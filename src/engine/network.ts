/**
 * The ambient loop, hour by hour (D1, D6, D10).
 *
 * Each hour:
 *
 *   1. Every building's heat pump works against the loop at last hour's loop
 *      temperature. Heating EXTRACTS heat from the loop (the load less the
 *      compressor work); cooling and refrigeration REJECT heat into it (the
 *      load plus the work). What cancels between them is heat shared.
 *   2. The net need is met in a fixed order — the dispatch the player is
 *      really designing when they choose what to build:
 *        a. waste heat and water exchangers, when their temperature is on the
 *           right side of the loop;
 *        b. the bore field, as far as it can go without the fluid leaving the
 *           operating band;
 *        c. the air-source heat pump (heating) or cooling tower (cooling);
 *        d. anything left is UNMET, carried by electric backup and counted.
 *   3. The loop temperature is the bore field's fluid temperature after (b);
 *      with no bore field it sits at the band edge it is being held at.
 *
 * One lag, deliberately: COPs use the previous hour's loop temperature. The
 * alternative is an iteration per hour for a correction well under the
 * uncertainty of a Carnot-fraction COP.
 */
import type { WeatherYear } from '../loads/model.ts';
import type { Demand } from './demand.ts';
import { boreField, projectDrift, yearStepper } from './ground.ts';
import type { DriftYear } from './ground.ts';
import { airSourceCop, coolingCop, heatingCop, HEAT_PUMP, refrigerationCop } from './heatpumps.ts';
import { exchangerFraction, groundTemperature, PARASITIC, TOWER_APPROACH, wetBulb } from './sources.ts';
import type { Source } from './sources.ts';

export interface LoopBand {
  /** °C. Below this the loop is warmed by the air-source heat pump or backup. */
  readonly min: number;
  /** °C. Above this the loop is cooled by the tower or backup. */
  readonly max: number;
}

export const DEFAULT_BAND: LoopBand = { min: 2, max: 30 };

/**
 * Distribution pumping, per W of thermal energy delivered to buildings. No
 * pipes are modelled (D12), so this is a flat, stated factor: a few percent is
 * typical of 5GDHC networks.
 */
export const DISTRIBUTION_PUMPING = 0.02;

/** Electric backup: resistance for heat; an air-cooled rejector for cooling. */
export const BACKUP = { heatingCop: 1, coolingWPerW: 0.33 } as const;

export interface NetworkDesign {
  readonly sources: readonly Source[];
  readonly band?: LoopBand;
  /**
   * An envelope retrofit across every connected building, as a factor on
   * envelope and infiltration conductance (1 = as built). It changes the
   * NETWORK case only: business as usual is the stock as it stands today, so
   * a retrofit earns its points against what is there now (D23).
   */
  readonly retrofit?: number;
}

export interface NetworkResult {
  /** °C, hourly. */
  readonly loopTemperature: Float64Array;
  /** W, hourly: all electricity the network scenario uses. */
  readonly electricity: Float64Array;
  /** kWh/yr by use. */
  readonly electricityKWh: {
    readonly buildingHeatPumps: number;
    readonly airSource: number;
    readonly parasitic: number;
    readonly pumping: number;
    readonly backup: number;
  };
  /** kWh/yr of heat each source put in (+) or took out (−) of the loop, net. */
  readonly sourceKWh: Readonly<Record<string, number>>;
  /**
   * The same, gross: what each source gave the loop and what it took, kWh/yr,
   * both positive. A bore field does both in one year; netting them hides the
   * store, which is the point of it. `backup` is a source here too.
   */
  readonly sourceInKWh: Readonly<Record<string, number>>;
  readonly sourceOutKWh: Readonly<Record<string, number>>;
  /** Heat the buildings took from, and put into, the loop, kWh/yr. */
  readonly extractedKWh: number;
  readonly rejectedKWh: number;
  /**
   * The worst hour's NET need, W: the most heat the plant must add in any
   * hour (buildings drawing more than others reject), and the most it must
   * remove. What balancing plant is sized against.
   */
  readonly peakHeatToAddW: number;
  readonly peakHeatToRemoveW: number;
  /** Heat shared building to building, kWh/yr: Σ min(extracted, rejected). */
  readonly sharedKWh: number;
  readonly sharedByMonth: readonly number[];
  /** Heat the buildings took from, and put into, the loop each month, kWh. */
  readonly extractedByMonth: readonly number[];
  readonly rejectedByMonth: readonly number[];
  /** Hours with any unmet need, and the energy, kWh/yr. */
  readonly unmetHours: number;
  readonly unmetKWh: number;
  /** Seasonal COP of the whole system: thermal delivered ÷ electricity. */
  readonly systemCop: number;
  readonly drift: readonly DriftYear[] | null;
}

const MONTH_HOURS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map((d) => d * 24);

export function simulateNetwork(demand: Demand, design: NetworkDesign, weather: WeatherYear): NetworkResult {
  const band = design.band ?? DEFAULT_BAND;
  const bores = design.sources.filter((s) => s.kind === 'bore-field');
  const air = design.sources.filter((s) => s.kind === 'air-source');
  const towers = design.sources.filter((s) => s.kind === 'cooling-tower');
  const exchangers = design.sources.filter((s) => s.kind === 'waste-heat' || s.kind === 'water');

  // Several bore fields act as one: their lengths add. Geometry is the first's.
  const totalBoreholes = bores.reduce((n, b) => n + (b.kind === 'bore-field' ? b.spec.boreholes : 0), 0);
  const firstBore = bores[0];
  const field =
    firstBore && firstBore.kind === 'bore-field' && totalBoreholes > 0
      ? boreField({ ...firstBore.spec, boreholes: totalBoreholes }, groundTemperature(weather))
      : null;
  const stepper = field ? yearStepper(field) : null;

  const airCapacity = air.reduce((s, a) => s + (a.kind === 'air-source' ? a.capacityW : 0), 0);
  const towerCapacity = towers.reduce((s, t) => s + (t.kind === 'cooling-tower' ? t.capacityW : 0), 0);

  const loop = new Float64Array(8760);
  const electricity = new Float64Array(8760);
  const sourceWh: Record<string, number> = {};
  const inWh: Record<string, number> = {};
  const outWh: Record<string, number> = {};
  const credit = (id: string, wh: number) => {
    sourceWh[id] = (sourceWh[id] ?? 0) + wh;
    if (wh > 0) inWh[id] = (inWh[id] ?? 0) + wh;
    else if (wh < 0) outWh[id] = (outWh[id] ?? 0) - wh;
  };
  let hpWh = 0;
  let airWh = 0;
  let parasiticWh = 0;
  let pumpingWh = 0;
  let backupWh = 0;
  let sharedWh = 0;
  const sharedMonthly = new Array(12).fill(0);
  const extractedMonthly = new Array(12).fill(0);
  const rejectedMonthly = new Array(12).fill(0);
  let unmetHours = 0;
  let unmetWh = 0;
  let deliveredWh = 0;
  let extractedWh = 0;
  let peakAdd = 0;
  let peakRemove = 0;
  let rejectedWh = 0;

  let T = field ? field.groundTemperature : (band.min + band.max) / 2;
  let month = 0;
  let monthEnd = MONTH_HOURS[0]!;

  for (let h = 0; h < 8760; h++) {
    if (h >= monthEnd) monthEnd += MONTH_HOURS[++month]!;
    if (stepper && h % 24 === 0) stepper.beginDay(h / 24);

    // 1. Buildings against the loop.
    const space = demand.heating[h]!;
    const dhw = demand.dhw[h]!;
    const cool = demand.cooling[h]!;
    const proc = demand.process[h]!;
    const copSpace = heatingCop(T);
    const copDhw = heatingCop(T, HEAT_PUMP.dhwSupply);
    const copCool = coolingCop(T);
    const copRef = refrigerationCop(T);
    const work = space / copSpace + dhw / copDhw + cool / copCool + proc / copRef;
    const extracted = space * (1 - 1 / copSpace) + dhw * (1 - 1 / copDhw);
    const rejected = cool * (1 + 1 / copCool) + proc * (1 + 1 / copRef);
    extractedWh += extracted;
    rejectedWh += rejected;
    peakAdd = Math.max(peakAdd, extracted - rejected);
    peakRemove = Math.max(peakRemove, rejected - extracted);
    extractedMonthly[month] += extracted;
    rejectedMonthly[month] += rejected;
    const shared = Math.min(extracted, rejected);
    sharedWh += shared;
    sharedMonthly[month] += shared;
    const delivered = space + dhw + cool + proc;
    deliveredWh += delivered;

    let elec = work + DISTRIBUTION_PUMPING * delivered;
    hpWh += work;
    pumpingWh += DISTRIBUTION_PUMPING * delivered;

    // Net need: positive = the loop must be given heat.
    let need = extracted - rejected;

    // 2a. Exchangers, in the order the player listed them.
    for (const x of exchangers) {
      if (need === 0) break;
      const temperature = x.kind === 'water' ? Number(x.temperature[h]) : x.kind === 'waste-heat' ? x.temperature : 0;
      const capacity = x.kind === 'water' || x.kind === 'waste-heat' ? x.capacityW : 0;
      let moved = 0;
      if (need > 0 && temperature > T) {
        moved = Math.min(need, capacity * exchangerFraction(temperature - T));
      } else if (need < 0 && x.kind === 'water' && temperature < T) {
        moved = -Math.min(-need, capacity * exchangerFraction(T - temperature));
      }
      if (moved !== 0) {
        need -= moved;
        credit(x.id, moved);
        const p = Math.abs(moved) * PARASITIC[x.kind];
        elec += p;
        parasiticWh += p;
      }
    }

    // 2b. The bore field, up to the band.
    let nextT = T;
    if (field && stepper) {
      const { A, B } = stepper.coefficients(h % 24);
      // Extraction Q gives fluid temperature A − B·Q; keep it inside the band.
      const qMax = (A - band.min) / B; // most extraction before hitting min
      const qMin = (A - band.max) / B; // most rejection (negative) before max
      const q = Math.min(Math.max(need, Math.min(qMin, 0)), Math.max(qMax, 0));
      stepper.record(q);
      credit(firstBore!.id, q);
      need -= q;
      nextT = A - B * q;
    }

    // 2c. Air-source heat pump (heating) or cooling tower (cooling).
    const outdoor = Number(weather.temperature[h]);
    if (need > 0 && airCapacity > 0) {
      const cop = airSourceCop(outdoor, band.min);
      if (cop > 0) {
        const given = Math.min(need, airCapacity);
        need -= given;
        const e = given / cop;
        elec += e;
        airWh += e;
        for (const a of air) credit(a.id, (given * (a.kind === 'air-source' ? a.capacityW : 0)) / airCapacity);
      }
      if (!field) nextT = band.min;
    } else if (need < 0 && towerCapacity > 0) {
      // A tower cools water to within its approach of the wet bulb, so it can
      // take heat while that is below the loop's upper limit.
      const humidity = weather.relativeHumidity ? Number(weather.relativeHumidity[h]) : undefined;
      if (wetBulb(outdoor, humidity) + TOWER_APPROACH < Math.max(band.max, nextT)) {
        const taken = Math.min(-need, towerCapacity);
        need += taken;
        const p = taken * PARASITIC['cooling-tower'];
        elec += p;
        parasiticWh += p;
        for (const t of towers) credit(t.id, (-taken * (t.kind === 'cooling-tower' ? t.capacityW : 0)) / towerCapacity);
      }
      if (!field) nextT = band.max;
    } else if (!field) {
      nextT = need > 0 ? band.min : need < 0 ? band.max : T;
    }

    // 2d. Backup for whatever is left.
    if (Math.abs(need) > 1e-6 * Math.max(delivered, 1)) {
      unmetHours++;
      unmetWh += Math.abs(need);
      const e = need > 0 ? need / BACKUP.heatingCop : -need * BACKUP.coolingWPerW;
      elec += e;
      backupWh += e;
      credit('backup', need);
      if (!field) nextT = need > 0 ? band.min : band.max;
    }

    electricity[h] = elec;
    loop[h] = nextT;
    T = nextT;
  }

  const daily = stepper?.finish() ?? null;
  const totalElectricWh = hpWh + airWh + parasiticWh + pumpingWh + backupWh;
  return {
    loopTemperature: loop,
    electricity,
    electricityKWh: {
      buildingHeatPumps: hpWh / 1000,
      airSource: airWh / 1000,
      parasitic: parasiticWh / 1000,
      pumping: pumpingWh / 1000,
      backup: backupWh / 1000,
    },
    sourceKWh: Object.fromEntries(Object.entries(sourceWh).map(([k, v]) => [k, v / 1000])),
    sourceInKWh: Object.fromEntries(Object.entries(inWh).map(([k, v]) => [k, v / 1000])),
    sourceOutKWh: Object.fromEntries(Object.entries(outWh).map(([k, v]) => [k, v / 1000])),
    extractedKWh: extractedWh / 1000,
    peakHeatToAddW: peakAdd,
    peakHeatToRemoveW: peakRemove,
    rejectedKWh: rejectedWh / 1000,
    sharedKWh: sharedWh / 1000,
    sharedByMonth: sharedMonthly.map((v) => v / 1000),
    extractedByMonth: extractedMonthly.map((v) => v / 1000),
    rejectedByMonth: rejectedMonthly.map((v) => v / 1000),
    unmetHours,
    unmetKWh: unmetWh / 1000,
    systemCop: totalElectricWh > 0 ? deliveredWh / totalElectricWh : 0,
    drift: field && daily ? projectDrift(field, daily) : null,
  };
}
