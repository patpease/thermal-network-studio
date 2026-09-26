/**
 * The per-building load model: EPRI's 1R1C, plus hot water and process (D22).
 *
 * One node at the building's air-and-mass temperature T, one conductance H to
 * outdoors, one capacitance C (EPRI 3002029431, §4):
 *
 *     C·dT/dt = H·(T₀ − T) + G + Q
 *
 * stepped hourly by implicit Euler, which is unconditionally stable at a
 * one-hour step whatever C and H calibration picks. Q is the ideal HVAC load
 * that holds T inside the setpoint band: zero while T floats between the
 * setpoints, and exactly enough to hold the nearer setpoint otherwise.
 *
 * Everything here is PER m² OF FLOOR and in canonical SI: W/m² hourly means,
 * so a year's sum ÷ 1,000 is kWh/m². A building is a unit result × its floor
 * area, which is why a neighbourhood of 500 buildings costs one run per
 * distinct archetype, zone and vintage, not 500.
 *
 * Loads are THERMAL — what the building's heat pump must deliver — never fuel.
 */
import type { Archetype } from './archetypes.ts';
import { DHW_PROFILES, SCHEDULE_FAMILIES } from './schedules.ts';

export const HOURS = 8760;
const DT = 3600;

/** An hourly weather year. */
export interface WeatherYear {
  /** Dry bulb, °C, 8760 values. */
  readonly temperature: ArrayLike<number>;
  /** Global horizontal irradiance, W/m², 8760 values. */
  readonly ghi: ArrayLike<number>;
  /** Day of week of hour 0: 0 = Monday … 6 = Sunday. 1 Jan 2018 was a Monday. */
  readonly firstWeekday: number;
}

/** The two multipliers calibration fits per archetype and climate zone. */
export interface Calibration {
  /** Scales envelope, infiltration and ventilation conductance. */
  readonly loss: number;
  /**
   * Scales every free heat gain: internal AND solar. Solar is inside it
   * because the stock's cooling cannot otherwise be reached — a home with its
   * internal gains fitted to nothing still over-cooled on sun alone.
   */
  readonly gain: number;
}

export interface UnitOptions {
  /**
   * Multiplies envelope and infiltration conductance only — the part a
   * building's age and a retrofit change. 1 = the stock average (D23).
   */
  readonly envelopeFactor?: number;
}

export interface UnitLoads {
  /** W/m², hourly, ≥ 0. */
  readonly heating: Float64Array;
  /** W/m², hourly, ≥ 0 (heat removed). */
  readonly cooling: Float64Array;
}

/** Days before 1 January simulated to settle the mass temperature. */
const WARMUP_HOURS = 14 * 24;

/**
 * Space heating and cooling, W/m² for each hour of the year.
 */
export function spaceLoads(
  archetype: Archetype,
  calibration: Calibration,
  weather: WeatherYear,
  options: UnitOptions = {},
): UnitLoads {
  const family = SCHEDULE_FAMILIES[archetype.schedule];
  const envelope = options.envelopeFactor ?? 1;
  const baseLoss = calibration.loss * (archetype.envelopeUA + archetype.infiltrationUA) * envelope;
  const ventLoss = calibration.loss * archetype.ventilationUA;
  const C = archetype.capacitance;
  const sp = archetype.setpoints;
  const setbackGain = family.gain[3] ?? 0;

  const heating = new Float64Array(HOURS);
  const cooling = new Float64Array(HOURS);

  let T = sp.heatOccupied;
  // Warm up on the last fortnight of the year, then run the year proper.
  for (let step = -WARMUP_HOURS; step < HOURS; step++) {
    const hour = step < 0 ? HOURS + step : step;
    const hourOfDay = hour % 24;
    const weekday = (weather.firstWeekday + Math.floor(hour / 24)) % 7;
    const weekend = weekday >= 5 && family.weekend === 'setback';

    const occupied = weekend ? 0 : (family.hvac[hourOfDay] ?? 0);
    const gainFraction = weekend ? setbackGain : (family.gain[hourOfDay] ?? 0);

    const To = Number(weather.temperature[hour]);
    const H = baseLoss + ventLoss * occupied;
    const G = calibration.gain * (archetype.gainPeak * gainFraction + archetype.solarAperture * Number(weather.ghi[hour]));

    const heatSet = occupied > 0 ? sp.heatOccupied : sp.heatSetback;
    const coolSet = occupied > 0 ? sp.coolOccupied : sp.coolSetback;

    const a = C / DT + H;
    const b = (C / DT) * T + H * To + G;
    const free = b / a;

    let Q = 0;
    if (free < heatSet) {
      Q = a * heatSet - b;
      T = heatSet;
    } else if (free > coolSet) {
      Q = a * coolSet - b; // negative: heat removed
      T = coolSet;
    } else {
      T = free;
    }

    if (step >= 0) {
      if (Q > 0) heating[hour] = Q;
      else if (Q < 0) cooling[hour] = -Q;
    }
  }

  return { heating, cooling };
}

/**
 * Domestic hot water, W/m² hourly, from an annual thermal intensity.
 *
 * The quantity is the stock's (ResStock delivered load; ComStock fuel × a
 * stated efficiency); the shape is the archetype's daily draw profile, the
 * same every day. Seasonal variation in mains temperature is not modelled.
 */
export function dhwLoads(archetype: Archetype, annualKWhPerM2: number): Float64Array {
  const profile = DHW_PROFILES[archetype.dhwProfile];
  const daySum = profile.reduce((sum, v) => sum + v, 0);
  const perDayWh = (annualKWhPerM2 * 1000) / 365;
  const out = new Float64Array(HOURS);
  for (let hour = 0; hour < HOURS; hour++) {
    out[hour] = (perDayWh * (profile[hour % 24] ?? 0)) / daySum;
  }
  return out;
}

/**
 * Process cooling — refrigeration — W/m² hourly, flat.
 *
 * Refrigeration runs around the clock and barely follows the weather, so a
 * flat profile is the honest simple shape. This is heat REMOVED from the
 * cases, the load a network could take in; the compressor work that also
 * ends up as heat is the engine's business (phase 02).
 */
export function processCooling(annualKWhPerM2: number): Float64Array {
  return new Float64Array(HOURS).fill((annualKWhPerM2 * 1000) / HOURS);
}

/** Σ W/m² over the year ÷ 1,000 = kWh/m². */
export function annualKWhPerM2(series: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < series.length; i++) sum += Number(series[i]);
  return sum / 1000;
}
