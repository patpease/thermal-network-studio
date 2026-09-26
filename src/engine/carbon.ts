/**
 * Carbon: fuels at EPA factors, electricity at Cambium's long-run marginal
 * rate for the hour, month and grid region (D9, D20).
 *
 * Fuel factors are combustion CO₂ only, to match the Cambium basis
 * (combustion, CO₂ — the workbook's defaults). Neither side counts upstream
 * methane; counting it on one side only would tilt the comparison.
 */
import { LRMER_G_PER_KWH } from './generated/cambium.ts';
import type { GeaRegion } from './generated/cambium.ts';

/** kWh in one MMBtu. */
const KWH_PER_MMBTU = 293.07107;

/**
 * kg CO₂ per kWh of fuel (HHV). EPA GHG Emission Factors Hub, Table 1:
 * natural gas 53.06, propane 62.87, distillate fuel oil No. 2 73.96 kg/MMBtu.
 */
export const FUEL_KG_PER_KWH = {
  natural_gas: 53.06 / KWH_PER_MMBTU,
  propane: 62.87 / KWH_PER_MMBTU,
  fuel_oil: 73.96 / KWH_PER_MMBTU,
  // ComStock's "other fuel" is mostly oil-like; charged as fuel oil.
  other_fuel: 73.96 / KWH_PER_MMBTU,
  // District heat delivered, from a gas plant at 75% including distribution.
  district_heating: 53.06 / KWH_PER_MMBTU / 0.75,
} as const;

/** District cooling delivered, from electric chillers at this plant COP. */
export const DISTRICT_COOLING_COP = 4;

/** Cumulative first-of-month hour index for a 365-day year. */
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365].map((d) => d * 24);

export function monthOfHour(hour: number): number {
  let m = 0;
  while (m < 11 && hour >= MONTH_START[m + 1]!) m++;
  return m;
}

/** kg CO₂ per kWh of electricity for each hour of the year in `region`. */
export function gridIntensity(region: GeaRegion): Float64Array {
  const table = LRMER_G_PER_KWH[region];
  const out = new Float64Array(8760);
  for (let h = 0; h < 8760; h++) out[h] = table[monthOfHour(h)]![h % 24]! / 1000;
  return out;
}
