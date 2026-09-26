/**
 * Fit the 1R1C model to the stock, and generate `src/loads/generated/calibration.ts`.
 *
 *   npm run calibrate:fit
 *
 * Reads only committed inputs — `data/calibration/targets.json` and
 * `weather.json.gz` — so it runs offline and in seconds. For each archetype and
 * climate zone it solves two multipliers, one on loss conductance and one on
 * internal gain, so that the model's annual space heating AND cooling equal the
 * stock's. Two unknowns, two equations: an exact fit where one exists, and a
 * reported residual where the priors cannot reach it.
 *
 * It also derives, per archetype, how envelope conductance varies with
 * vintage (D23), and the business-as-usual fuel mix and efficiencies (D21).
 *
 * Like the siblings' importers, it prints every decision it had to make and
 * refuses to write output it cannot stand behind.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARCHETYPES } from '../../src/loads/archetypes.ts';
import type { Archetype } from '../../src/loads/archetypes.ts';
import { annualKWhPerM2, spaceLoads } from '../../src/loads/model.ts';
import type { Calibration } from '../../src/loads/model.ts';
import { normaliseZone, VINTAGE_BANDS, ZONES } from '../../src/loads/zones.ts';
import type { ClimateZone, VintageBand } from '../../src/loads/zones.ts';
import { calibrationWeather } from './weatherFixture.ts';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Thermal efficiency applied to ComStock's DHW FUEL to get a DHW LOAD, which
 * ComStock does not report directly. Typical storage-heater values. ResStock
 * reports the delivered load and needs none of this.
 */
export const DHW_EFFICIENCY: Record<string, number> = {
  natural_gas: 0.8,
  propane: 0.8,
  fuel_oil: 0.78,
  other_fuel: 0.78,
  electricity: 0.98,
  district_heating: 1,
};

/**
 * Refrigeration: heat removed from the cases per unit of compressor
 * electricity. A mid-range commercial refrigeration COP.
 */
export const REFRIGERATION_COP = 2.5;

/** Below this many models, a zone borrows the nearest zone with enough. */
const MIN_MODELS = 30;

/**
 * An exact fit is within 2% of both targets, OR within 1 kWh/m² of one that
 * is small: Miami offices carry 0.96 kWh/m² of heating that is reheat, which
 * a single-node model cannot produce, and 100% of almost nothing is not a
 * failure worth refusing over.
 */
const FIT_TOLERANCE = 0.02;
const FIT_ABSOLUTE = 1;

/**
 * Vintage factors are clamped to this range. Where envelope is a small share
 * of the heating load — hospitals, whose heating is ventilation and reheat —
 * the factor needed to reproduce a band swings wildly (3.45, then 0.50) on a
 * few hundred models, and a lever that large would say more about the fit
 * than about the building.
 */
const VINTAGE_RANGE = [0.5, 2] as const;

interface Group {
  source: 'comstock' | 'resstock';
  type: string;
  zone: string;
  vintage: VintageBand;
  models: number;
  floorAreaM2: number;
  dhwFloorAreaM2: number;
  kWhPerM2: Record<string, number | null>;
}

const targetsFile = JSON.parse(readFileSync(resolve(here, '../../data/calibration/targets.json'), 'utf8')) as {
  attribution: string;
  sources: Record<string, { release: string; url: string }>;
  groups: Group[];
};

interface Pool {
  models: number;
  area: number;
  dhwArea: number;
  sums: Record<string, number>;
}

function pool(groups: readonly Group[]): Pool {
  const out: Pool = { models: 0, area: 0, dhwArea: 0, sums: {} };
  for (const g of groups) {
    out.models += g.models;
    out.area += g.floorAreaM2;
    out.dhwArea += g.dhwFloorAreaM2;
    for (const [metric, value] of Object.entries(g.kWhPerM2)) {
      if (value === null) continue;
      const isDhw = metric === 'dhwLoad' || metric.startsWith('energy.dhw.');
      out.sums[metric] = (out.sums[metric] ?? 0) + value * (isDhw ? g.dhwFloorAreaM2 : g.floorAreaM2);
    }
  }
  return out;
}

function intensity(p: Pool, metric: string): number {
  const isDhw = metric === 'dhwLoad' || metric.startsWith('energy.dhw.');
  const denominator = isDhw ? p.dhwArea : p.area;
  return denominator > 0 ? (p.sums[metric] ?? 0) / denominator : 0;
}

function sumPrefix(p: Pool, prefix: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const metric of Object.keys(p.sums)) {
    if (metric.startsWith(prefix)) out[metric.slice(prefix.length)] = intensity(p, metric);
  }
  return out;
}

function groupsFor(archetype: Archetype, zone: ClimateZone, vintage?: VintageBand): Group[] {
  return targetsFile.groups.filter(
    (g) =>
      g.source === archetype.calibration.dataset &&
      archetype.calibration.types.includes(g.type) &&
      normaliseZone(g.zone) === zone &&
      (vintage === undefined || g.vintage === vintage),
  );
}

interface Targets {
  heating: number;
  cooling: number;
  dhw: number;
  process: number;
  models: number;
  area: number;
  pool: Pool;
}

function targetsOf(archetype: Archetype, p: Pool): Targets {
  let dhw: number;
  if (archetype.calibration.dataset === 'resstock') dhw = intensity(p, 'dhwLoad');
  else {
    dhw = 0;
    for (const [fuel, kwh] of Object.entries(sumPrefix(p, 'energy.dhw.'))) {
      const efficiency = DHW_EFFICIENCY[fuel];
      if (efficiency === undefined) throw new Error(`No DHW efficiency for ${fuel}`);
      dhw += kwh * efficiency;
    }
  }
  // ComStock's component loads are attributions, and where there is almost no
  // heating (a Miami supermarket) they can net to a hair below zero. A load
  // cannot be negative; floor at zero.
  return {
    heating: Math.max(0, intensity(p, 'heatingLoad')),
    cooling: Math.max(0, intensity(p, 'coolingLoad')),
    dhw,
    process: intensity(p, 'energy.refrigeration.electricity') * REFRIGERATION_COP,
    models: p.models,
    area: p.area,
    pool: p,
  };
}

const weatherCache = new Map<ClimateZone, ReturnType<typeof calibrationWeather>>();
const weather = (zone: ClimateZone) => {
  let w = weatherCache.get(zone);
  if (!w) weatherCache.set(zone, (w = calibrationWeather(zone)));
  return w;
};

function simulate(archetype: Archetype, zone: ClimateZone, c: Calibration, envelopeFactor = 1) {
  const loads = spaceLoads(archetype, c, weather(zone), { envelopeFactor });
  return { heating: annualKWhPerM2(loads.heating), cooling: annualKWhPerM2(loads.cooling) };
}

const BOUNDS = [0.02, 20] as const;
const clamp = (x: number) => Math.min(BOUNDS[1], Math.max(BOUNDS[0], x));

/**
 * Newton in log space on (loss, gain) → (heating, cooling), finite-difference
 * Jacobian. Log space keeps both multipliers positive and makes the problem
 * close to linear, since loads scale roughly as a power of each.
 */
function fit(archetype: Archetype, zone: ClimateZone, target: Targets) {
  let x = [0, 0]; // log(loss), log(gain)
  const residual = (v: number[]) => {
    const r = simulate(archetype, zone, { loss: Math.exp(v[0]!), gain: Math.exp(v[1]!) });
    // Relative residuals, floored so a near-zero cooling target cannot dominate.
    return {
      loads: r,
      f: [
        (r.heating - target.heating) / Math.max(target.heating, 1),
        (r.cooling - target.cooling) / Math.max(target.cooling, 1),
      ],
    };
  };

  let current = residual(x);
  for (let iteration = 0; iteration < 40; iteration++) {
    if (Math.abs(current.f[0]!) < 1e-4 && Math.abs(current.f[1]!) < 1e-4) break;
    const h = 1e-3;
    const dl = residual([x[0]! + h, x[1]!]).f;
    const dg = residual([x[0]!, x[1]! + h]).f;
    const J = [
      [(dl[0]! - current.f[0]!) / h, (dg[0]! - current.f[0]!) / h],
      [(dl[1]! - current.f[1]!) / h, (dg[1]! - current.f[1]!) / h],
    ];
    const det = J[0]![0]! * J[1]![1]! - J[0]![1]! * J[1]![0]!;
    let step: number[];
    if (Math.abs(det) > 1e-9) {
      step = [
        (J[1]![1]! * current.f[0]! - J[0]![1]! * current.f[1]!) / det,
        (-J[1]![0]! * current.f[0]! + J[0]![0]! * current.f[1]!) / det,
      ];
    } else {
      // Singular: one load does not respond (Miami has almost no heating to
      // move). Take a one-dimensional step on each diagonal that does.
      step = [
        Math.abs(J[0]![0]!) > 1e-9 ? current.f[0]! / J[0]![0]! : 0,
        Math.abs(J[1]![1]!) > 1e-9 ? current.f[1]! / J[1]![1]! : 0,
      ];
      if (step[0] === 0 && step[1] === 0) break;
    }
    // Damp large steps: a full Newton step from a poor prior can overshoot
    // into the region where cooling is zero and the Jacobian is singular.
    const size = Math.hypot(step[0]!, step[1]!);
    if (size > 1) step = step.map((s) => s / size);
    const next = [
      Math.log(clamp(Math.exp(x[0]! - step[0]!))),
      Math.log(clamp(Math.exp(x[1]! - step[1]!))),
    ];
    const trial = residual(next);
    x = next;
    current = trial;
  }

  const loss = Math.exp(x[0]!);
  const gain = Math.exp(x[1]!);
  const error = {
    heating: target.heating > 0 ? current.loads.heating / target.heating - 1 : 0,
    cooling: target.cooling > 0 ? current.loads.cooling / target.cooling - 1 : 0,
  };
  const close = (fitted: number, wanted: number, relative: number) =>
    Math.abs(relative) <= FIT_TOLERANCE || Math.abs(fitted - wanted) <= FIT_ABSOLUTE;
  const exact =
    close(current.loads.heating, target.heating, error.heating) && close(current.loads.cooling, target.cooling, error.cooling);
  return { loss, gain, fitted: current.loads, error, exact };
}

/** Mean temperature of each zone's calibration year, for "nearest zone". */
function meanTemperature(zone: ClimateZone): number {
  const t = weather(zone).temperature;
  let sum = 0;
  for (let i = 0; i < t.length; i++) sum += t[i]!;
  return sum / t.length;
}

const round = (x: number, digits = 4) => Number(x.toPrecision(digits));

function main() {
  const decisions: string[] = [];
  const calibration: Record<string, Record<string, unknown>> = {};
  const vintageFactors: Record<string, Record<string, number>> = {};
  const baseline: Record<string, Record<string, unknown>> = {};
  let inexact = 0;

  for (const archetype of ARCHETYPES) {
    calibration[archetype.id] = {};
    baseline[archetype.id] = {};

    const zoneTargets = new Map<ClimateZone, Targets>();
    for (const zone of ZONES) zoneTargets.set(zone, targetsOf(archetype, pool(groupsFor(archetype, zone))));

    for (const zone of ZONES) {
      let target = zoneTargets.get(zone)!;
      let borrowedFrom: ClimateZone | null = null;
      if (target.models < MIN_MODELS) {
        // Borrow the nearest zone by mean temperature that has enough models.
        const candidates = ZONES.filter((z) => z !== zone && zoneTargets.get(z)!.models >= MIN_MODELS);
        const mine = meanTemperature(zone);
        candidates.sort((a, b) => Math.abs(meanTemperature(a) - mine) - Math.abs(meanTemperature(b) - mine));
        borrowedFrom = candidates[0] ?? null;
        if (!borrowedFrom) throw new Error(`${archetype.id}: no zone has ${MIN_MODELS} models`);
        decisions.push(
          `${archetype.id} ${zone}: ${target.models} models < ${MIN_MODELS}; borrows ${borrowedFrom}'s intensities`,
        );
        target = zoneTargets.get(borrowedFrom)!;
      }

      const result = fit(archetype, zone, target);
      if (!result.exact) {
        inexact++;
        decisions.push(
          `${archetype.id} ${zone}: no exact fit — heating ${(result.error.heating * 100).toFixed(1)}%, cooling ${(result.error.cooling * 100).toFixed(1)}% (loss ×${result.loss.toFixed(2)}, gain ×${result.gain.toFixed(2)})`,
        );
      }

      calibration[archetype.id]![zone] = {
        loss: round(result.loss),
        gain: round(result.gain),
        targets: {
          heating: round(target.heating),
          cooling: round(target.cooling),
          dhw: round(target.dhw),
          process: round(target.process),
        },
        fitted: { heating: round(result.fitted.heating), cooling: round(result.fitted.cooling) },
        exact: result.exact,
        models: target.models,
        borrowedFrom,
      };

      // Business as usual (D21): what the stock burns today for heat, cooling
      // and hot water, and how efficiently, on average.
      const heatingFuel = sumPrefix(target.pool, 'energy.heating.');
      const coolingFuel = sumPrefix(target.pool, 'energy.cooling.');
      const dhwFuel = sumPrefix(target.pool, 'energy.dhw.');
      const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
      const shares = (o: Record<string, number>) => {
        const t = total(o);
        return Object.fromEntries(
          Object.entries(o)
            .filter(([, v]) => v > 0)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, round(v / t, 3)]),
        );
      };
      baseline[archetype.id]![zone] = {
        heatingFuelShare: shares(heatingFuel),
        heatingLoadPerFuel: total(heatingFuel) > 0 ? round(target.heating / total(heatingFuel), 3) : null,
        coolingFuelShare: shares(coolingFuel),
        coolingLoadPerFuel: total(coolingFuel) > 0 ? round(target.cooling / total(coolingFuel), 3) : null,
        dhwFuelShare: shares(dhwFuel),
      };
    }

    // Vintage (D23): the envelope factor per band that reproduces that band's
    // heating load, pooled over every zone by floor area. Bisection on one
    // number, because the zone calibrations are already fixed.
    vintageFactors[archetype.id] = {};
    for (const band of VINTAGE_BANDS) {
      let targetSum = 0;
      let weightSum = 0;
      const zonesUsed: { zone: ClimateZone; area: number; c: Calibration }[] = [];
      for (const zone of ZONES) {
        const t = targetsOf(archetype, pool(groupsFor(archetype, zone, band)));
        const c = calibration[archetype.id]![zone] as { loss: number; gain: number; borrowedFrom: string | null };
        if (t.models < MIN_MODELS || c.borrowedFrom) continue;
        targetSum += t.heating * t.area;
        weightSum += t.area;
        zonesUsed.push({ zone, area: t.area, c });
      }
      if (weightSum === 0) {
        vintageFactors[archetype.id]![band] = 1;
        decisions.push(`${archetype.id} ${band}: too few models in any zone; factor 1`);
        continue;
      }
      const target = targetSum / weightSum;
      const heatingAt = (f: number) =>
        zonesUsed.reduce((s, u) => s + simulate(archetype, u.zone, u.c, f).heating * u.area, 0) / weightSum;
      let lo = 0.2;
      let hi = 4;
      for (let i = 0; i < 30; i++) {
        const mid = Math.sqrt(lo * hi);
        if (heatingAt(mid) < target) lo = mid;
        else hi = mid;
      }
      const solved = Math.sqrt(lo * hi);
      const factor = Math.min(VINTAGE_RANGE[1], Math.max(VINTAGE_RANGE[0], solved));
      if (factor !== solved) {
        decisions.push(`${archetype.id} ${band}: vintage factor ${solved.toFixed(2)} clamped to ${factor}`);
      }
      vintageFactors[archetype.id]![band] = round(factor, 3);
    }
  }

  const total = ARCHETYPES.length * ZONES.length;
  console.log(decisions.join('\n'));
  console.log(`\n${total - inexact}/${total} archetype × zone fits exact (2% or 1 kWh/m²).`);

  // Refuse to write a table that is mostly approximate: at that point the
  // priors are wrong and the fix is in archetypes.ts, not in the output.
  if (inexact > total * 0.1) {
    console.error(`Refusing to write: ${inexact} inexact fits exceeds 10%. Revisit the priors.`);
    process.exit(1);
  }

  const banner = `/**
 * GENERATED by scripts/calibrate/fit.ts — do not edit. Re-run
 * \`npm run calibrate:fit\` after changing archetypes.ts, the model, or the
 * targets.
 *
 * ${targetsFile.attribution}
 * Sources: ${Object.values(targetsFile.sources)
   .map((s) => s.release)
   .join('; ')}.
 *
 * Per archetype × climate zone: the two fitted multipliers, the stock's annual
 * thermal intensities they reproduce (kWh/m²), and the fit achieved on the
 * calibration weather year (NLR AMY2018, one county per zone).
 */
import type { ArchetypeId } from '../archetypes.ts';
import type { ClimateZone, VintageBand } from '../zones.ts';

export interface ZoneCalibration {
  readonly loss: number;
  readonly gain: number;
  /** Stock annual thermal intensity, kWh/m²: heating, cooling, DHW, refrigeration. */
  readonly targets: { readonly heating: number; readonly cooling: number; readonly dhw: number; readonly process: number };
  readonly fitted: { readonly heating: number; readonly cooling: number };
  readonly exact: boolean;
  readonly models: number;
  /** Set when this zone had too few models and took a neighbour's intensities. */
  readonly borrowedFrom: ClimateZone | null;
}

export interface ZoneBaseline {
  /** Share of heating FUEL energy by fuel. */
  readonly heatingFuelShare: Readonly<Record<string, number>>;
  /** Heating load ÷ heating fuel: the stock's average efficiency or COP. */
  readonly heatingLoadPerFuel: number | null;
  readonly coolingFuelShare: Readonly<Record<string, number>>;
  /** Cooling load ÷ cooling energy: the stock's average COP. */
  readonly coolingLoadPerFuel: number | null;
  readonly dhwFuelShare: Readonly<Record<string, number>>;
}

export const DHW_EFFICIENCY = ${JSON.stringify(DHW_EFFICIENCY)} as const;
export const REFRIGERATION_COP = ${REFRIGERATION_COP};
`;

  const body = `
export const CALIBRATION: Readonly<Record<ArchetypeId, Readonly<Record<ClimateZone, ZoneCalibration>>>> = ${JSON.stringify(calibration, null, 1)};

/** Multiplies envelope + infiltration conductance by vintage band (D23). */
export const VINTAGE_FACTORS: Readonly<Record<ArchetypeId, Readonly<Record<VintageBand, number>>>> = ${JSON.stringify(vintageFactors, null, 1)};

/** Business as usual, from the stock's own fuel use (D21). */
export const BASELINE: Readonly<Record<ArchetypeId, Readonly<Record<ClimateZone, ZoneBaseline>>>> = ${JSON.stringify(baseline, null, 1)};

/** Every decision the fit had to make, in the order it made them. */
export const CALIBRATION_DECISIONS: readonly string[] = ${JSON.stringify(decisions, null, 1)};
`;

  writeFileSync(resolve(here, '../../src/loads/generated/calibration.ts'), banner + body);
}

main();
