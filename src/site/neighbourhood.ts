/**
 * A classified site → the engine's neighbourhood.
 *
 * Every building with an archetype is connected unless the player has taken
 * it out (D11); overrides replace the classifier's archetype or levels. The
 * D11 cap is enforced here, not in the UI, so nothing downstream can ever be
 * handed more buildings than a network is allowed.
 */
import type { ArchetypeId } from '../loads/archetypes.ts';
import type { ClimateZone } from '../loads/zones.ts';
import type { Neighbourhood } from '../engine/demand.ts';
import type { GeaRegion } from '../engine/generated/cambium.ts';
import { CONDITIONED_FRACTION, MAX_BUILDINGS } from './classify.ts';
import type { Site, SiteBuilding } from './classify.ts';

export interface BuildingOverride {
  readonly archetype?: ArchetypeId | null;
  readonly levels?: number;
}

export interface Selection {
  /** Buildings the player has taken out. */
  readonly excluded: ReadonlySet<string>;
  readonly overrides: ReadonlyMap<string, BuildingOverride>;
}

export const EMPTY_SELECTION: Selection = Object.freeze({
  excluded: new Set<string>(),
  overrides: new Map<string, BuildingOverride>(),
});

/** The building as the player currently has it. */
export function effective(b: SiteBuilding, selection: Selection): SiteBuilding {
  const o = selection.overrides.get(b.id);
  if (!o) return b;
  const archetype = o.archetype !== undefined ? o.archetype : b.archetype;
  const levels = o.levels ?? b.levels;
  return {
    ...b,
    archetype,
    archetypeGuessed: o.archetype !== undefined ? false : b.archetypeGuessed,
    reason: o.archetype !== undefined ? 'Set by you' : b.reason,
    levels,
    levelsGuessed: o.levels !== undefined ? false : b.levelsGuessed,
    floorArea: archetype ? Math.round(b.footprintM2 * levels * CONDITIONED_FRACTION) : 0,
  };
}

export function connected(site: Site, selection: Selection): SiteBuilding[] {
  return site.buildings.map((b) => effective(b, selection)).filter((b) => b.archetype !== null && !selection.excluded.has(b.id));
}

export function toNeighbourhood(site: Site, selection: Selection, zone: ClimateZone, region: GeaRegion): Neighbourhood {
  const buildings = connected(site, selection);
  if (buildings.length > MAX_BUILDINGS) {
    throw new Error(`${buildings.length} buildings: a network connects at most ${MAX_BUILDINGS}. Draw a smaller area or take some out.`);
  }
  return {
    zone,
    region,
    landArea: site.areaM2,
    buildings: buildings.map((b) => ({
      id: b.id,
      archetype: b.archetype!,
      floorArea: b.floorArea,
      ...(b.vintage ? { vintage: b.vintage } : {}),
    })),
  };
}
