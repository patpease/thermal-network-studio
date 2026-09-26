/**
 * A neighbourhood's hourly thermal demand, and the site metrics it already
 * implies before anything is built (D24).
 *
 * Buildings are grouped by what makes their per-m² loads differ — archetype,
 * vintage, retrofit — and each group is one unit simulation times its total
 * floor area. That is exact, because the model is linear in floor area, and
 * it is what keeps a 500-building neighbourhood a handful of simulations.
 */
import type { ArchetypeId } from '../loads/archetypes.ts';
import { buildingLoads } from '../loads/building.ts';
import type { WeatherYear } from '../loads/model.ts';
import type { ClimateZone, VintageBand } from '../loads/zones.ts';
import type { GeaRegion } from './generated/cambium.ts';

export interface NeighbourhoodBuilding {
  readonly id: string;
  readonly archetype: ArchetypeId;
  /** Conditioned floor area, m². */
  readonly floorArea: number;
  readonly vintage?: VintageBand;
  readonly retrofit?: number;
}

export interface Neighbourhood {
  readonly zone: ClimateZone;
  readonly region: GeaRegion;
  /** Land area inside the boundary, m² — for demand density. */
  readonly landArea: number;
  readonly buildings: readonly NeighbourhoodBuilding[];
}

export interface DemandGroup {
  readonly archetype: ArchetypeId;
  readonly vintage: VintageBand | undefined;
  readonly retrofit: number;
  readonly floorArea: number;
  readonly count: number;
  /** W, hourly. */
  readonly heating: Float64Array;
  readonly cooling: Float64Array;
  readonly dhw: Float64Array;
  readonly process: Float64Array;
}

export interface Demand {
  readonly groups: readonly DemandGroup[];
  /** Totals, W, hourly: space heating, DHW, space cooling, process cooling. */
  readonly heating: Float64Array;
  readonly dhw: Float64Array;
  readonly cooling: Float64Array;
  readonly process: Float64Array;
  readonly floorArea: number;
}

export function neighbourhoodDemand(n: Neighbourhood, weather: WeatherYear): Demand {
  const byKey = new Map<string, { b: NeighbourhoodBuilding; floorArea: number; count: number }>();
  for (const b of n.buildings) {
    const key = `${b.archetype}|${b.vintage ?? ''}|${b.retrofit ?? 1}`;
    const g = byKey.get(key);
    if (g) {
      g.floorArea += b.floorArea;
      g.count++;
    } else byKey.set(key, { b, floorArea: b.floorArea, count: 1 });
  }

  const totals = {
    heating: new Float64Array(8760),
    dhw: new Float64Array(8760),
    cooling: new Float64Array(8760),
    process: new Float64Array(8760),
  };
  const groups: DemandGroup[] = [];
  let floorArea = 0;
  for (const { b, floorArea: area, count } of byKey.values()) {
    const loads = buildingLoads(
      {
        archetype: b.archetype,
        zone: n.zone,
        floorArea: area,
        ...(b.vintage ? { vintage: b.vintage } : {}),
        ...(b.retrofit !== undefined ? { retrofit: b.retrofit } : {}),
      },
      weather,
    );
    for (let h = 0; h < 8760; h++) {
      totals.heating[h]! += loads.heating[h]!;
      totals.dhw[h]! += loads.dhw[h]!;
      totals.cooling[h]! += loads.cooling[h]!;
      totals.process[h]! += loads.process[h]!;
    }
    groups.push({
      archetype: b.archetype,
      vintage: b.vintage,
      retrofit: b.retrofit ?? 1,
      floorArea: area,
      count,
      ...loads,
    });
    floorArea += area;
  }
  return { groups, ...totals, floorArea };
}

export interface SiteMetrics {
  /** Annual thermal demand, kWh: heating (space + DHW) and cooling (space + process). */
  readonly heatingKWh: number;
  readonly coolingKWh: number;
  /**
   * Demand overlap coefficient (EPRI 3002029431, p. 14): the share of demand
   * that could cancel hour by hour. 0 = never coincide, 1 = perfectly matched.
   */
  readonly doc: number;
  /** Load balance index (p. 15): (H − C)/(H + C). +1 all heating, −1 all cooling. */
  readonly lbi: number;
  /**
   * Heating as a share of all thermal demand — the quantity Minnesota's load
   * balance rubric is written in (Table D-1: ≤80%, 80–90%, >90%).
   */
  readonly heatingShare: number;
  /** Annual thermal demand per land area, GWh/km²·yr (EPRI: 50–150 typical). */
  readonly densityGWhPerKm2: number;
  /** Peak hourly heating and cooling demand, W. */
  readonly peakHeatingW: number;
  readonly peakCoolingW: number;
}

export function siteMetrics(demand: Demand, landArea: number): SiteMetrics {
  let H = 0;
  let C = 0;
  let overlap = 0;
  let peakH = 0;
  let peakC = 0;
  for (let h = 0; h < 8760; h++) {
    const heat = demand.heating[h]! + demand.dhw[h]!;
    const cool = demand.cooling[h]! + demand.process[h]!;
    H += heat;
    C += cool;
    overlap += Math.min(heat, cool);
    peakH = Math.max(peakH, heat);
    peakC = Math.max(peakC, cool);
  }
  const total = H + C;
  return {
    heatingKWh: H / 1000,
    coolingKWh: C / 1000,
    doc: total > 0 ? (2 * overlap) / total : 0,
    lbi: total > 0 ? (H - C) / total : 0,
    heatingShare: total > 0 ? H / total : 0,
    // Wh → GWh is 1e-9; m² → km² is 1e-6.
    densityGWhPerKm2: landArea > 0 ? (total * 1e-9) / (landArea * 1e-6) : 0,
    peakHeatingW: peakH,
    peakCoolingW: peakC,
  };
}

export { minnesotaBalanceBand } from './bands.ts';
