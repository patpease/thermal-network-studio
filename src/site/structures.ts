/**
 * Federal structure inventories, one small shape each (phase 12).
 *
 * OSM is thin in places — Mankato's blocks south of downtown return about one
 * building where there are ninety. Two federal sets fill it, reviewed and
 * measured in docs/building-data.md:
 *
 *   FEMA USA Structures   footprint polygons with an occupancy
 *                         (Single Family Dwelling, Pre-K - 12 Schools …).
 *                         CC BY 4.0, FEMA and ORNL.
 *   USACE NSI             one point per structure with a Hazus occupancy
 *                         (RES1, RES3C …), storeys, floor area, residential
 *                         units and the block group's median year built.
 *                         Public (federal).
 *
 * The relay normalises both here, as it does OSM in osm.ts; the classifier
 * decides what to do with them. Either may be null: that service did not
 * answer, and the site is OSM alone.
 */
import { ringArea } from './geometry.ts';
import type { LonLat, Ring } from './geometry.ts';

export interface FemaStructure {
  /** 'fema:<BUILD_ID>'. */
  readonly id: string;
  readonly ring: Ring;
  /** PRIM_OCC, e.g. "Single Family Dwelling". */
  readonly occupancy: string;
  /** OCC_CLS, e.g. "Residential". */
  readonly occupancyClass: string;
  /** m, when FEMA has it (often empty). */
  readonly heightM: number | null;
  readonly outbuilding: boolean;
}

export interface NsiStructure {
  /** 'nsi:<fd_id>'. */
  readonly id: string;
  readonly at: LonLat;
  /** Hazus occupancy, e.g. "RES1-2SNB", "RES3C", "EDU1". */
  readonly occtype: string;
  readonly stories: number | null;
  /** Floor area, m² (NSI's sqft, converted). */
  readonly floorAreaM2: number | null;
  readonly units: number | null;
  /** The CENSUS BLOCK GROUP's median year built — not this building's own. */
  readonly medianYearBuilt: number | null;
}

export interface Structures {
  readonly fema: readonly FemaStructure[] | null;
  readonly nsi: readonly NsiStructure[] | null;
  /** FEMA returned its page limit; some structures may be missing. */
  readonly femaTruncated?: boolean;
}

/** Both sets ask for attribution; it goes wherever their buildings are shown. */
export const STRUCTURES_ATTRIBUTION = 'Structures: FEMA USA Structures (FEMA, ORNL), CC BY 4.0; USACE National Structure Inventory';

const M2_PER_FT2 = 0.09290304;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');

/** The largest outer ring of a GeoJSON Polygon or MultiPolygon. */
function outerRing(geometry: unknown): Ring | null {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || !Array.isArray(g.coordinates)) return null;
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? (g.coordinates as unknown[]) : [];
  let best: Ring | null = null;
  let bestArea = 0;
  for (const p of polygons) {
    const outer = Array.isArray(p) ? (p[0] as unknown) : null;
    if (!Array.isArray(outer) || outer.length < 4) continue;
    const ring = outer
      .filter((q): q is [number, number] => Array.isArray(q) && typeof q[0] === 'number' && typeof q[1] === 'number')
      .map(([x, y]) => [r6(x), r6(y)] as const);
    if (ring.length < 4) continue;
    const area = ringArea(ring);
    if (area > bestArea) {
      best = ring;
      bestArea = area;
    }
  }
  return best;
}

/** FEMA's `f=geojson` answer → structures. Anything malformed is dropped, not guessed at. */
export function normaliseFema(json: unknown): { structures: FemaStructure[]; truncated: boolean } {
  const j = json as { features?: unknown[]; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } } | null;
  const out: FemaStructure[] = [];
  for (const f of j?.features ?? []) {
    const feature = f as { geometry?: unknown; properties?: Record<string, unknown> };
    const p = feature.properties ?? {};
    const ring = outerRing(feature.geometry);
    const id = p['BUILD_ID'] ?? p['OBJECTID'];
    if (!ring || (typeof id !== 'number' && typeof id !== 'string')) continue;
    const out1 = str(p['OUTBLDG']).toLowerCase();
    out.push({
      id: `fema:${id}`,
      ring,
      occupancy: str(p['PRIM_OCC']),
      occupancyClass: str(p['OCC_CLS']),
      heightM: num(p['HEIGHT']),
      outbuilding: out1 !== '' && !['n', 'no', '0', 'false'].includes(out1),
    });
  }
  return { structures: out, truncated: Boolean(j?.exceededTransferLimit ?? j?.properties?.exceededTransferLimit) };
}

/** NSI's feature collection → structures. */
export function normaliseNsi(json: unknown): NsiStructure[] {
  const j = json as { features?: unknown[] } | null;
  const out: NsiStructure[] = [];
  for (const f of j?.features ?? []) {
    const feature = f as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> };
    const p = feature.properties ?? {};
    const c = feature.geometry?.coordinates;
    if (feature.geometry?.type !== 'Point' || !Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    const id = p['fd_id'];
    if (typeof id !== 'number' && typeof id !== 'string') continue;
    const sqft = num(p['sqft']);
    const year = num(p['med_yr_blt']);
    out.push({
      id: `nsi:${id}`,
      at: [r6(c[0]), r6(c[1])],
      occtype: str(p['occtype']),
      stories: num(p['num_story']),
      floorAreaM2: sqft === null ? null : Math.round(sqft * M2_PER_FT2),
      units: num(p['resunits']),
      medianYearBuilt: year !== null && year >= 1600 && year <= 2100 ? Math.round(year) : null,
    });
  }
  return out;
}
