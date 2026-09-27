/**
 * Existing thermal networks near a place (from data/networks, generated into
 * ./generated/networks.ts). For learning, not connecting: none of these is a
 * source the design can use.
 */
import { EXISTING_NETWORKS } from './generated/networks.ts';
import type { ExistingNetwork } from './generated/networks.ts';
import { distance } from './geometry.ts';
import type { LonLat } from './geometry.ts';

/** 25 miles: near enough to visit, or to know the people who run it. */
export const NEARBY_NETWORK_M = 40_234;

export interface NetworkNear {
  readonly network: ExistingNetwork;
  readonly distanceM: number;
}

/** Every network within `withinM` of `at`, nearest first. */
export function networksNear(at: LonLat, withinM = NEARBY_NETWORK_M, all: readonly ExistingNetwork[] = EXISTING_NETWORKS): NetworkNear[] {
  return all
    .map((network) => ({ network, distanceM: distance(at, [network.at[0], network.at[1]]) }))
    .filter((n) => n.distanceM <= withinM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** The nearest network anywhere, for a site with none within reach. */
export function nearestNetwork(at: LonLat, all: readonly ExistingNetwork[] = EXISTING_NETWORKS): NetworkNear | null {
  let best: NetworkNear | null = null;
  for (const network of all) {
    const d = distance(at, [network.at[0], network.at[1]]);
    if (!best || d < best.distanceM) best = { network, distanceM: d };
  }
  return best;
}
