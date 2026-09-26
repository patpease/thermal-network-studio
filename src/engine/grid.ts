/**
 * Grid impact: the electric peak of the network (TEN) against the same
 * buildings electrified one by one (BLE, building-level electrification).
 *
 * BLE serves the SAME loads the network serves (after any retrofit), so the
 * comparison is between systems, not envelopes:
 *
 *   space heating   an air-source heat pump per building, COP from outdoor
 *                   air; below −25 °C it runs on its resistance strip (COP 1)
 *   hot water       a heat pump water heater, flat COP
 *   space cooling   an air conditioner, COP from outdoor air
 *   refrigeration   air-cooled, as today
 *
 * Today's electricity is shown beside both as a reference: the peak the grid
 * already carries for these loads.
 *
 * Winter is December to February, summer June to August. The peak is the
 * largest hour.
 */
import type { WeatherYear } from '../loads/model.ts';
import { REFRIGERATION_COP } from '../loads/generated/calibration.ts';
import type { Demand } from './demand.ts';
import { HEAT_PUMP } from './heatpumps.ts';

export const BLE = {
  /** °C outdoor air below which the building heat pump runs on resistance. */
  resistanceBelow: -25,
  /** Fraction of Carnot for packaged air-source equipment. */
  efficiency: 0.45,
  /** Heat pump water heater COP. */
  dhwCop: 2.5,
  maxCop: 5,
} as const;

const K = 273.15;
const MIN_LIFT = 5;

/** A building's own air-source heat pump heating the space. */
export function bleHeatingCop(outdoor: number): number {
  if (outdoor < BLE.resistanceBelow) return 1;
  const sink = HEAT_PUMP.spaceSupply;
  const lift = Math.max(sink - (outdoor - 5), MIN_LIFT);
  return Math.min(BLE.maxCop, Math.max(1, (BLE.efficiency * (sink + K)) / lift));
}

/** A building's own air conditioner. */
export function bleCoolingCop(outdoor: number): number {
  const evaporator = HEAT_PUMP.coolingSupply;
  const lift = Math.max(outdoor + 10 - evaporator, MIN_LIFT);
  return Math.min(BLE.maxCop, Math.max(1, (BLE.efficiency * (evaporator + K)) / lift));
}

/** Hourly electricity, W, of building-level electrification for `demand`. */
export function bleElectricity(demand: Demand, weather: WeatherYear): Float64Array {
  const out = new Float64Array(8760);
  for (let h = 0; h < 8760; h++) {
    const t = Number(weather.temperature[h]);
    out[h] =
      demand.heating[h]! / bleHeatingCop(t) +
      demand.dhw[h]! / BLE.dhwCop +
      demand.cooling[h]! / bleCoolingCop(t) +
      demand.process[h]! / REFRIGERATION_COP;
  }
  return out;
}

const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365].map((d) => d * 24);
const WINTER = [11, 0, 1];
const SUMMER = [5, 6, 7];

function peakIn(series: ArrayLike<number>, months: readonly number[]): number {
  let peak = 0;
  for (const m of months) for (let h = MONTH_START[m]!; h < MONTH_START[m + 1]!; h++) peak = Math.max(peak, Number(series[h]));
  return peak;
}

function sum(series: ArrayLike<number>): number {
  let s = 0;
  for (let h = 0; h < series.length; h++) s += Number(series[h]);
  return s;
}

export interface PeakSet {
  /** W, the largest hour. */
  readonly winterW: number;
  readonly summerW: number;
  /** kWh/yr. */
  readonly annualKWh: number;
}

export interface GridImpact {
  readonly today: PeakSet;
  readonly ble: PeakSet;
  readonly network: PeakSet;
  /** 1 − network ÷ BLE, winter peak. Positive: the network is lower. */
  readonly winterReduction: number;
  readonly summerReduction: number;
}

const peaks = (s: ArrayLike<number>): PeakSet => ({ winterW: peakIn(s, WINTER), summerW: peakIn(s, SUMMER), annualKWh: sum(s) / 1000 });

export function gridImpact(today: ArrayLike<number>, ble: ArrayLike<number>, network: ArrayLike<number>): GridImpact {
  const t = peaks(today);
  const b = peaks(ble);
  const n = peaks(network);
  return {
    today: t,
    ble: b,
    network: n,
    winterReduction: b.winterW > 0 ? 1 - n.winterW / b.winterW : 0,
    summerReduction: b.summerW > 0 ? 1 - n.summerW / b.summerW : 0,
  };
}
