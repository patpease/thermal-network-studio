/**
 * Business as usual (D9, D21): the same buildings, the same loads, served the
 * way the regional stock serves them today — its own mix of fuels at its own
 * average efficiency, from ComStock/ResStock, per archetype and climate zone.
 *
 * Efficiency is taken as constant through the year: the stock average
 * load ÷ fuel. A furnace is nearly constant; a heat pump or chiller is not,
 * and this flattens their seasonal swing. Stated, not hidden.
 */
import { BASELINE, DHW_EFFICIENCY, REFRIGERATION_COP } from '../loads/generated/calibration.ts';
import type { ClimateZone } from '../loads/zones.ts';
import { DISTRICT_COOLING_COP, FUEL_KG_PER_KWH } from './carbon.ts';
import type { Demand } from './demand.ts';

/** Used where the stock reports a load but no heating fuel at all. */
const FALLBACK_HEATING = { share: { natural_gas: 1 }, loadPerFuel: 0.8 } as const;

export interface EnergyResult {
  /** Site energy, kWh/yr, by carrier. */
  readonly siteKWh: Readonly<Record<string, number>>;
  readonly totalSiteKWh: number;
  /** Electricity, W, hourly — for its hour-by-hour carbon. */
  readonly electricity: Float64Array;
  readonly carbonKg: number;
  /** Carbon by carrier, kg/yr. */
  readonly carbonByCarrier: Readonly<Record<string, number>>;
}

export function carbonOf(siteKWh: Record<string, number>, electricity: Float64Array, grid: Float64Array) {
  const byCarrier: Record<string, number> = {};
  let electricKg = 0;
  for (let h = 0; h < 8760; h++) electricKg += (electricity[h]! / 1000) * grid[h]!;
  byCarrier.electricity = electricKg;
  for (const [carrier, kwh] of Object.entries(siteKWh)) {
    if (carrier === 'electricity') continue;
    const factor = FUEL_KG_PER_KWH[carrier as keyof typeof FUEL_KG_PER_KWH];
    if (factor === undefined) throw new Error(`No carbon factor for ${carrier}`);
    byCarrier[carrier] = kwh * factor;
  }
  const total = Object.values(byCarrier).reduce((a, b) => a + b, 0);
  return { byCarrier, total };
}

export function businessAsUsual(demand: Demand, zone: ClimateZone, grid: Float64Array): EnergyResult {
  const site: Record<string, number> = {};
  const electricity = new Float64Array(8760);
  const add = (carrier: string, wh: number) => {
    site[carrier] = (site[carrier] ?? 0) + wh / 1000;
  };

  for (const g of demand.groups) {
    const b = BASELINE[g.archetype][zone];

    // Heating: stock fuel shares at the stock's load per unit of fuel.
    const heatShares: Record<string, number> =
      Object.keys(b.heatingFuelShare).length > 0 ? b.heatingFuelShare : FALLBACK_HEATING.share;
    const heatLpf = b.heatingLoadPerFuel ?? FALLBACK_HEATING.loadPerFuel;
    // DHW: fuel shares, each at its own efficiency.
    const dhwShares: Record<string, number> =
      Object.keys(b.dhwFuelShare).length > 0 ? b.dhwFuelShare : { natural_gas: 1 };
    let dhwLpf = 0;
    for (const [fuel, share] of Object.entries(dhwShares)) dhwLpf += share * (DHW_EFFICIENCY[fuel as keyof typeof DHW_EFFICIENCY] ?? 0.8);
    // Cooling.
    const coolShares: Record<string, number> =
      Object.keys(b.coolingFuelShare).length > 0 ? b.coolingFuelShare : { electricity: 1 };
    const coolLpf = b.coolingLoadPerFuel ?? 3;

    let heatWh = 0;
    let dhwWh = 0;
    let coolWh = 0;
    let processWh = 0;
    for (let h = 0; h < 8760; h++) {
      const heatFuel = g.heating[h]! / heatLpf;
      const dhwFuel = g.dhw[h]! / dhwLpf;
      const coolFuel = g.cooling[h]! / coolLpf;
      const refrigeration = g.process[h]! / REFRIGERATION_COP;
      heatWh += heatFuel;
      dhwWh += dhwFuel;
      coolWh += coolFuel;
      processWh += refrigeration;
      electricity[h]! +=
        heatFuel * (heatShares['electricity'] ?? 0) +
        dhwFuel * (dhwShares['electricity'] ?? 0) +
        coolFuel * (coolShares['electricity'] ?? 0) +
        // District cooling is delivered cooling; its plant runs on electricity.
        (coolFuel * (coolShares['district_cooling'] ?? 0)) / DISTRICT_COOLING_COP +
        refrigeration;
    }
    for (const [fuel, share] of Object.entries(heatShares)) add(fuel, heatWh * share);
    for (const [fuel, share] of Object.entries(dhwShares)) add(fuel, dhwWh * share);
    for (const [fuel, share] of Object.entries(coolShares)) {
      if (fuel === 'district_cooling') add('electricity', (coolWh * share) / DISTRICT_COOLING_COP);
      else add(fuel, coolWh * share);
    }
    add('electricity', processWh);
  }

  const { byCarrier, total } = carbonOf(site, electricity, grid);
  const totalSite = Object.values(site).reduce((a, b) => a + b, 0);
  return { siteKWh: site, totalSiteKWh: totalSite, electricity, carbonKg: total, carbonByCarrier: byCarrier };
}
