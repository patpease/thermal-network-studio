/**
 * The bore field as the loop sees it: fluid temperature as a function of the
 * heat drawn from, or put into, the ground (D10).
 *
 * Sign convention, used everywhere in the engine: heat EXTRACTED from the
 * ground is positive. Extraction cools the ground.
 *
 * Within the simulated year the response is superposed DAILY — one step per
 * day of the daily-mean extraction rate, 365²/2 terms — and the current hour
 * rides on top as a step since the start of its day plus the borehole
 * resistance. That keeps each hour's fluid temperature LINEAR in that hour's
 * extraction, T_f = A − B·Q, which is what lets dispatch solve for exactly the
 * extraction that holds the loop at a limit.
 *
 * Beyond the year (the 25-year projection), the year's daily loads are split
 * into their annual mean — a step that never ends, and whose response keeps
 * growing — and a zero-mean periodic part, whose response settles within two
 * or three cycles. An unbalanced field is the first term winning.
 */
import { gAt, tabulate } from './gfunction.ts';
import type { FieldGeometry, GTable } from './gfunction.ts';

const DAY = 86400;
const YEAR = 365 * DAY;

export interface BoreFieldSpec {
  /** Number of boreholes. Laid out as the squarest grid that holds them. */
  readonly boreholes: number;
  /** Active depth per borehole, m. */
  readonly depth?: number;
  /** Centre-to-centre spacing, m. */
  readonly spacing?: number;
  /** Ground thermal conductivity, W/m·K. */
  readonly conductivity?: number;
  /** Ground thermal diffusivity, m²/s. */
  readonly diffusivity?: number;
  /** Effective borehole thermal resistance, m·K/W. */
  readonly boreholeResistance?: number;
}

export const BORE_DEFAULTS = {
  depth: 150,
  spacing: 6,
  conductivity: 2.5,
  diffusivity: 1e-6,
  boreholeResistance: 0.12,
  buried: 2,
  radius: 0.075,
} as const;

/**
 * The fluid limits a design is held to: below −3 °C the loop needs more
 * antifreeze than a network wants; above 35 °C cooling heat pumps lose most of
 * their advantage. Reference lines on the drift chart, not hard stops.
 */
export const FLUID_LIMITS = { min: -3, max: 35 } as const;

export function layout(boreholes: number): { nx: number; ny: number } {
  const nx = Math.max(1, Math.ceil(Math.sqrt(boreholes)));
  const ny = Math.max(1, Math.ceil(boreholes / nx));
  return { nx, ny };
}

const tables = new Map<string, GTable>();

function gTable(geometry: FieldGeometry, diffusivity: number): GTable {
  const key = JSON.stringify([geometry, diffusivity]);
  let table = tables.get(key);
  if (!table) {
    table = tabulate(geometry, diffusivity, 3600, 30 * YEAR);
    tables.set(key, table);
  }
  return table;
}

export interface BoreField {
  readonly boreholes: number;
  /** Total active length, m. */
  readonly length: number;
  readonly groundTemperature: number;
  /** K per (W/m) of extraction: 1/(2πk). */
  readonly perW: number;
  readonly rb: number;
  readonly g: (seconds: number) => number;
}

export function boreField(spec: BoreFieldSpec, groundTemperature: number): BoreField {
  const depth = spec.depth ?? BORE_DEFAULTS.depth;
  const { nx, ny } = layout(spec.boreholes);
  const geometry: FieldGeometry = {
    nx,
    ny,
    spacing: spec.spacing ?? BORE_DEFAULTS.spacing,
    depth,
    buried: BORE_DEFAULTS.buried,
    radius: BORE_DEFAULTS.radius,
  };
  const table = gTable(geometry, spec.diffusivity ?? BORE_DEFAULTS.diffusivity);
  const boreholes = nx * ny;
  return {
    boreholes,
    length: boreholes * depth,
    groundTemperature,
    perW: 1 / (2 * Math.PI * (spec.conductivity ?? BORE_DEFAULTS.conductivity)),
    rb: spec.boreholeResistance ?? BORE_DEFAULTS.boreholeResistance,
    g: (t) => gAt(table, t),
  };
}

/**
 * Steps a year hour by hour. Call `beginDay(d)` at each day's first hour,
 * `coefficients(hourOfDay)` for that hour's T_f = A − B·Q, and `record(Q)`
 * with the extraction that was actually taken.
 */
export function yearStepper(field: BoreField) {
  const daily = new Float64Array(365); // mean extraction rate, W per m
  const gDay = new Float64Array(366);
  for (let k = 1; k <= 365; k++) gDay[k] = field.g(k * DAY);
  const gHour = new Float64Array(25);
  for (let h = 1; h <= 24; h++) gHour[h] = field.g(h * 3600);

  let day = 0;
  let wallPast = field.groundTemperature;
  let previousRate = 0;
  let sum = 0;
  let hours = 0;

  return {
    beginDay(d: number) {
      if (d > 0) daily[d - 1] = hours > 0 ? sum / hours : 0;
      day = d;
      sum = 0;
      hours = 0;
      // Wall temperature at the start of day d from every earlier day's step.
      let response = 0;
      let prior = 0;
      for (let j = 0; j < d; j++) {
        response += (daily[j]! - prior) * gDay[d - j]!;
        prior = daily[j]!;
      }
      wallPast = field.groundTemperature - field.perW * response;
      previousRate = d > 0 ? daily[d - 1]! : 0;
    },
    /** For hour h (0–23) of the current day: T_f = A − B·Q, Q in W. */
    coefficients(hourOfDay: number): { A: number; B: number } {
      const gh = gHour[hourOfDay + 1]!;
      const A = wallPast + field.perW * previousRate * gh;
      const B = (field.perW * gh + field.rb) / field.length;
      return { A, B };
    },
    record(extractionW: number) {
      sum += extractionW / field.length;
      hours++;
    },
    /** Daily mean extraction rates, W/m, once the year is done. */
    finish(): Float64Array {
      daily[day] = hours > 0 ? sum / hours : 0;
      return daily;
    },
  };
}

export interface DriftYear {
  readonly year: number;
  /**
   * Fluid temperature extremes, °C. From `projectDrift`, daily means; after
   * `anchorDrift` (what a result carries), hourly: year 1 is the simulated
   * year's own and later years move with the projection.
   */
  readonly minFluid: number;
  readonly maxFluid: number;
  readonly meanWall: number;
}

/**
 * Twenty-five years of the first year repeated: what the ground does if
 * nothing about the network changes. Mean-plus-periodic, as described above.
 */
export function projectDrift(field: BoreField, dailyRate: Float64Array, years = 25): DriftYear[] {
  const mean = dailyRate.reduce((a, b) => a + b, 0) / dailyRate.length;
  const periodic = Array.from(dailyRate, (q) => q - mean);

  // Response of the periodic part in year y, superposing every cycle since
  // t = 0 — exact for years 1 to 3, and settled from then on: by the third
  // cycle a zero-mean load's response has stopped changing year to year.
  const settledAfter = 3;
  const n = 365 * settledAfter;
  const steps = new Float64Array(n);
  for (let i = 0; i < n; i++) steps[i] = periodic[i % 365]! - (i > 0 ? periodic[(i - 1) % 365]! : 0);
  const gDays = new Float64Array(n + 1);
  for (let k = 1; k <= n; k++) gDays[k] = field.g(k * DAY);
  const periodicWallByYear: Float64Array[] = [];
  for (let y = 0; y < settledAfter; y++) {
    const wall = new Float64Array(365);
    for (let d = 0; d < 365; d++) {
      const at = y * 365 + d;
      let response = 0;
      for (let j = 0; j <= at; j++) response += steps[j]! * gDays[at - j + 1]!;
      wall[d] = -field.perW * response;
    }
    periodicWallByYear.push(wall);
  }

  const out: DriftYear[] = [];
  for (let y = 0; y < years; y++) {
    const periodicWall = periodicWallByYear[Math.min(y, settledAfter - 1)]!;
    let min = Infinity;
    let max = -Infinity;
    let wallSum = 0;
    for (let d = 0; d < 365; d++) {
      const t = y * YEAR + (d + 1) * DAY;
      const wall = field.groundTemperature - field.perW * mean * field.g(t) + periodicWall[d]!;
      const fluid = wall - dailyRate[d]! * field.rb;
      min = Math.min(min, fluid);
      max = Math.max(max, fluid);
      wallSum += wall;
    }
    out.push({ year: y + 1, minFluid: min, maxFluid: max, meanWall: wallSum / 365 });
  }
  return out;
}
