/**
 * What the player can connect to the loop (D8, D26).
 *
 * Five kinds, and every named source in the plan is one of them:
 *
 *   bore-field      the ground: takes and gives, and remembers (ground.ts)
 *   air-source      a central air-to-water heat pump that warms the loop
 *   cooling-tower   rejects loop heat to outdoor air
 *   waste-heat      gives heat only, at a temperature above the loop — data
 *                   centres, ice rinks, breweries, supermarket condensers,
 *                   process plants
 *   water           a heat exchanger on water that can give OR take, when its
 *                   temperature is on the right side of the loop — sewers,
 *                   wastewater plants, lakes, rivers
 *
 * No pipes (D12): a source's position will matter to the map, not to the
 * physics.
 */
import type { BoreFieldSpec } from './ground.ts';
import type { WeatherYear } from '../loads/model.ts';

export type Source =
  | { readonly kind: 'bore-field'; readonly id: string; readonly spec: BoreFieldSpec }
  | { readonly kind: 'air-source'; readonly id: string; readonly capacityW: number }
  | { readonly kind: 'cooling-tower'; readonly id: string; readonly capacityW: number }
  | {
      readonly kind: 'waste-heat';
      readonly id: string;
      readonly label: string;
      /** Heat available, W, every hour. */
      readonly capacityW: number;
      /** Temperature it is available at, °C. */
      readonly temperature: number;
    }
  | {
      readonly kind: 'water';
      readonly id: string;
      readonly label: string;
      readonly capacityW: number;
      /** Water temperature for each hour of the year, °C. */
      readonly temperature: ArrayLike<number>;
    };

export type SourceKind = Source['kind'];

/** Pump and fan electricity per W of heat moved, by kind. */
export const PARASITIC = {
  'waste-heat': 0.02,
  water: 0.03,
  'cooling-tower': 0.02,
} as const;

/** A heat exchanger needs this much temperature difference to do anything. */
export const MIN_APPROACH = 2;
/** …and delivers full capacity from this much. Linear between. */
export const FULL_APPROACH = 5;

/** Fraction of capacity available across a temperature difference. */
export function exchangerFraction(deltaT: number): number {
  if (deltaT <= MIN_APPROACH) return 0;
  return Math.min(1, (deltaT - MIN_APPROACH) / (FULL_APPROACH - MIN_APPROACH));
}

function annualMean(weather: WeatherYear): number {
  let sum = 0;
  for (let h = 0; h < 8760; h++) sum += Number(weather.temperature[h]);
  return sum / 8760;
}

/**
 * Sewer water: warm and steady. A seasonal sine between about 12 °C at its
 * coldest (mid-February) and 22 °C at its warmest, which is the range the
 * sewage heat-recovery literature reports for temperate cities.
 */
export function sewerTemperature(): Float64Array {
  const out = new Float64Array(8760);
  for (let h = 0; h < 8760; h++) {
    const day = h / 24;
    out[h] = 17 - 5 * Math.cos((2 * Math.PI * (day - 45)) / 365);
  }
  return out;
}

/**
 * Lake or river water: follows the air a month late and damped, never below
 * 4 °C (the intake is below the surface, where water is densest).
 */
export function surfaceWaterTemperature(weather: WeatherYear): Float64Array {
  const mean = annualMean(weather) + 2;
  // Amplitude from the air's own monthly swing, damped.
  const monthly = new Array(12).fill(0);
  for (let m = 0; m < 12; m++) {
    let s = 0;
    for (let h = m * 730; h < (m + 1) * 730; h++) s += Number(weather.temperature[h]);
    monthly[m] = s / 730;
  }
  const amplitude = ((Math.max(...monthly) - Math.min(...monthly)) / 2) * 0.8;
  const out = new Float64Array(8760);
  for (let h = 0; h < 8760; h++) {
    const day = h / 24;
    // Coldest around day 40 (a month after the air's coldest), warmest ~day 222.
    out[h] = Math.max(4, mean - amplitude * Math.cos((2 * Math.PI * (day - 40)) / 365));
  }
  return out;
}

/**
 * Wet bulb from dry bulb and relative humidity, Stull (2011), J. Appl.
 * Meteor. 50: 2267–2269. Good to about ±1 K for RH 5–99% and −20 to 50 °C,
 * which is all a cooling tower's approach needs. Without humidity, falls back
 * to dry bulb — the pessimistic answer.
 */
export function wetBulb(dryBulb: number, relativeHumidity: number | undefined): number {
  if (relativeHumidity === undefined || !Number.isFinite(relativeHumidity)) return dryBulb;
  const T = dryBulb;
  const RH = Math.min(99, Math.max(5, relativeHumidity));
  return (
    T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
    Math.atan(T + RH) -
    Math.atan(RH - 1.676331) +
    0.00391838 * RH ** 1.5 * Math.atan(0.023101 * RH) -
    4.686035
  );
}

/** A cooling tower cools water to within this many K of the wet bulb. */
export const TOWER_APPROACH = 4;

/** Undisturbed ground: the annual mean air temperature plus 1 K. */
export function groundTemperature(weather: WeatherYear): number {
  return annualMean(weather) + 1;
}
