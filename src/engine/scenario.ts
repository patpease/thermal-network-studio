/**
 * One run: a neighbourhood, a design, a weather year → everything the results
 * screen shows, and the score (D4, D20).
 *
 * The score is the average of two percentages, each against business as
 * usual and each shown beside it:
 *
 *   efficiency = % less site energy for heating, cooling, hot water and
 *                refrigeration than the stock serving the same loads today
 *   carbon     = % less CO₂, electricity at Cambium's long-run marginal rate
 *                for the hour, fuels at EPA factors
 *
 * Each is clamped to 0–100 for the score; the unclamped percentage is kept,
 * because a design that makes things worse should say by how much.
 *
 * The score says how a design compares with today. It does not predict what
 * any real network would save (the framing is ZEEL's, and permanent).
 */
import type { WeatherYear } from '../loads/model.ts';
import { businessAsUsual, carbonOf } from './baseline.ts';
import type { EnergyResult } from './baseline.ts';
import { gridIntensity } from './carbon.ts';
import { neighbourhoodDemand, siteMetrics } from './demand.ts';
import type { Neighbourhood, SiteMetrics } from './demand.ts';
import { simulateNetwork } from './network.ts';
import type { NetworkDesign, NetworkResult } from './network.ts';

export interface Score {
  /** Unclamped fractional reductions vs business as usual. */
  readonly energyReduction: number;
  readonly carbonReduction: number;
  /** 0–100 each, and their mean. */
  readonly efficiencyPoints: number;
  readonly carbonPoints: number;
  readonly total: number;
}

export interface ScenarioResult {
  readonly site: SiteMetrics;
  readonly baseline: EnergyResult;
  readonly network: NetworkResult & { readonly carbonKg: number; readonly totalSiteKWh: number };
  readonly score: Score;
  /** Hourly demand totals the network serves (after any retrofit), W — for the charts. */
  readonly demand: { heating: Float64Array; dhw: Float64Array; cooling: Float64Array; process: Float64Array };
}

const clampPoints = (fraction: number) => Math.round(Math.min(100, Math.max(0, fraction * 100)));

export function scoreOf(baseline: { totalSiteKWh: number; carbonKg: number }, network: { totalSiteKWh: number; carbonKg: number }): Score {
  const energyReduction = baseline.totalSiteKWh > 0 ? 1 - network.totalSiteKWh / baseline.totalSiteKWh : 0;
  const carbonReduction = baseline.carbonKg > 0 ? 1 - network.carbonKg / baseline.carbonKg : 0;
  const efficiencyPoints = clampPoints(energyReduction);
  const carbonPoints = clampPoints(carbonReduction);
  return {
    energyReduction,
    carbonReduction,
    efficiencyPoints,
    carbonPoints,
    total: Math.round((efficiencyPoints + carbonPoints) / 2),
  };
}

export function runScenario(neighbourhood: Neighbourhood, design: NetworkDesign, weather: WeatherYear): ScenarioResult {
  const asBuilt = neighbourhoodDemand(neighbourhood, weather);
  const retrofit = design.retrofit ?? 1;
  // The retrofit multiplies whatever each building already carries.
  const demand =
    retrofit === 1
      ? asBuilt
      : neighbourhoodDemand({ ...neighbourhood, buildings: neighbourhood.buildings.map((b) => ({ ...b, retrofit: (b.retrofit ?? 1) * retrofit })) }, weather);
  const grid = gridIntensity(neighbourhood.region);
  const baseline = businessAsUsual(asBuilt, neighbourhood.zone, grid);
  const net = simulateNetwork(demand, design, weather);

  let electricKWh = 0;
  for (let h = 0; h < 8760; h++) electricKWh += net.electricity[h]! / 1000;
  const carbon = carbonOf({ electricity: electricKWh }, net.electricity, grid);
  const network = { ...net, carbonKg: carbon.total, totalSiteKWh: electricKWh };

  return {
    // The neighbourhood as it stands: what the site panel describes.
    site: siteMetrics(asBuilt, neighbourhood.landArea),
    baseline,
    network,
    score: scoreOf(baseline, network),
    demand: { heating: demand.heating, dhw: demand.dhw, cooling: demand.cooling, process: demand.process },
  };
}
