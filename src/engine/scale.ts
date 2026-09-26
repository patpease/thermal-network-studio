/**
 * Network scale against HEET's economies-of-scale point.
 *
 * HEET's Massachusetts checklist: "economies of scale inflection point is
 * approximately at a shared load of 300 tons, given that the annual heating
 * and cooling loads are well balanced. It is advisable to have a minimum load
 * of 300 tons for the system of buildings being networked."
 *
 * The network's size here is its peak load in tons: the larger of the
 * connected buildings' peak heating and peak cooling demand, from the hourly
 * simulation (so it already carries the buildings' diversity).
 */
import type { SiteMetrics } from './demand.ts';

/** One ton of refrigeration, W (12,000 Btu/h). */
export const TON_W = 3_516.85;
export const SCALE_POINT_TONS = 300;

export interface Scale {
  readonly tons: number;
  readonly belowPoint: boolean;
  /** Tons still to reach the point; 0 at or above it. */
  readonly shortTons: number;
  /**
   * About how many more buildings like the connected ones would reach the
   * point, from their average size. Null when nothing is connected.
   */
  readonly moreBuildings: number | null;
}

export function scaleOf(metrics: Pick<SiteMetrics, 'peakHeatingW' | 'peakCoolingW'>, buildingCount: number): Scale {
  const tons = Math.max(metrics.peakHeatingW, metrics.peakCoolingW) / TON_W;
  const shortTons = Math.max(0, SCALE_POINT_TONS - tons);
  const perBuilding = buildingCount > 0 ? tons / buildingCount : 0;
  return {
    tons,
    belowPoint: tons < SCALE_POINT_TONS,
    shortTons,
    moreBuildings: shortTons === 0 ? 0 : perBuilding > 0 ? Math.ceil(shortTons / perBuilding) : null,
  };
}
