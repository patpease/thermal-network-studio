/**
 * OpenStreetMap in, one small shape out.
 *
 * The relay asks Overpass for everything a site needs in one query and hands
 * the browser only this normalised form: features with a kind of geometry and
 * the handful of tags the classifier reads. Raw Overpass JSON for a dense
 * downtown is megabytes; this is a small fraction of it.
 *
 * `normaliseElements` takes Overpass `out geom` elements. The fixture script
 * turns the OSM editing API's node-and-reference form into that same shape
 * first, so relay and fixtures share one normaliser.
 */
import { bbox, ringArea } from './geometry.ts';
import type { LonLat, Ring } from './geometry.ts';
import type { Structures } from './structures.ts';

export type Geometry =
  | { readonly type: 'point'; readonly at: LonLat }
  | { readonly type: 'line'; readonly path: readonly LonLat[] }
  | { readonly type: 'polygon'; readonly ring: Ring };

export interface OsmFeature {
  /** 'w123', 'n45', 'r9' — OSM type initial and id. */
  readonly id: string;
  readonly tags: Readonly<Record<string, string>>;
  readonly geometry: Geometry;
}

export interface SiteData {
  readonly version: 1;
  readonly boundary: Ring;
  readonly features: readonly OsmFeature[];
  /** Multipolygon relations too complex to resolve, dropped and counted. */
  readonly skipped: number;
  /**
   * The federal structure sets for the same area (phase 12). Absent in a
   * site read before them, or from a project file saved before them.
   */
  readonly structures?: Structures;
}

/** The tags anything downstream reads. Everything else is dropped. */
const KEEP = new Set([
  'building',
  'building:levels',
  'building:use',
  'height',
  'min_height',
  'start_date',
  'building:start_date',
  'amenity',
  'shop',
  'office',
  'tourism',
  'leisure',
  'sport',
  'craft',
  'healthcare',
  'telecom',
  'man_made',
  'industrial',
  'landuse',
  'natural',
  'water',
  'waterway',
  'highway',
  'railway',
  'parking',
  'name',
  'operator',
  'place',
]);

function keepTags(tags: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tags) return out;
  for (const [k, v] of Object.entries(tags)) if (KEEP.has(k)) out[k] = v;
  return out;
}

interface OverpassPoint {
  lat: number;
  lon: number;
}

/** Overpass `out geom` element shapes, as much as is read. */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: OverpassPoint;
  geometry?: (OverpassPoint | null)[];
  members?: { type: string; role: string; geometry?: (OverpassPoint | null)[] }[];
}

const toLonLat = (points: (OverpassPoint | null)[]): LonLat[] =>
  points.filter((p): p is OverpassPoint => p !== null && Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p) => [p.lon, p.lat] as const);

const isClosed = (path: readonly LonLat[]) =>
  path.length >= 4 && path[0]![0] === path[path.length - 1]![0] && path[0]![1] === path[path.length - 1]![1];

/** Tags whose ways are areas when closed (OSM's own convention, abridged). */
const AREA_KEYS = ['building', 'landuse', 'leisure', 'natural', 'amenity', 'man_made', 'shop', 'water', 'parking', 'tourism'];

/**
 * Join a relation's outer members into one ring where they chain end to end.
 * Returns null for anything more complex (several disjoint outers, gaps):
 * rare for buildings, and dropping one is better than drawing it wrong.
 */
function outerRing(members: NonNullable<OverpassElement['members']>): Ring | null {
  // A member can arrive with no usable points — Overpass clips geometry to the
  // query box, and the editing API omits nodes outside its box. Drop those
  // before joining, or the join reads the ends of an empty piece.
  const pieces = members
    .filter((m) => m.role === 'outer' && m.geometry)
    .map((m) => toLonLat(m.geometry!))
    .filter((p) => p.length >= 2);
  if (pieces.length === 0) return null;
  const ring: LonLat[] = [...pieces.shift()!];
  while (pieces.length > 0) {
    const end = ring[ring.length - 1]!;
    const i = pieces.findIndex((p) => {
      const a = p[0]!;
      const b = p[p.length - 1]!;
      return (a[0] === end[0] && a[1] === end[1]) || (b[0] === end[0] && b[1] === end[1]);
    });
    if (i < 0) return null;
    const next = pieces.splice(i, 1)[0]!;
    const forward = next[0]![0] === end[0] && next[0]![1] === end[1];
    ring.push(...(forward ? next : [...next].reverse()).slice(1));
  }
  return isClosed(ring) ? ring : null;
}

export function normaliseElements(elements: readonly OverpassElement[], boundary: Ring): SiteData {
  const features: OsmFeature[] = [];
  let skipped = 0;
  for (const el of elements) {
    const tags = keepTags(el.tags);
    if (Object.keys(tags).length === 0) continue;
    const id = `${el.type[0]}${el.id}`;

    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      features.push({ id, tags, geometry: { type: 'point', at: [el.lon, el.lat] } });
    } else if (el.type === 'way' && el.geometry) {
      const path = toLonLat(el.geometry);
      if (path.length < 2) continue;
      const area = isClosed(path) && AREA_KEYS.some((k) => k in tags) && tags['highway'] === undefined;
      features.push({ id, tags, geometry: area ? { type: 'polygon', ring: path } : { type: 'line', path } });
    } else if (el.type === 'relation' && el.members) {
      const ring = outerRing(el.members);
      if (ring) features.push({ id, tags, geometry: { type: 'polygon', ring } });
      else if (el.center) features.push({ id, tags, geometry: { type: 'point', at: [el.center.lon, el.center.lat] } });
      else skipped++;
    }
  }
  return { version: 1, boundary, features, skipped };
}

/** Largest area a query may cover. A neighbourhood, not a city. */
export const MAX_BOUNDARY_M2 = 4_000_000;

/** How far beyond the boundary to look for sources, water and barriers, m. */
/**
 * How far outside the boundary a heat source is looked for: a quarter mile,
 * the reach VCTN gives for recirculating waste heat (Moving Heat).
 */
export const SOURCE_SEARCH_M = 402;

/**
 * The Overpass query for a boundary: buildings, POIs and land use inside it;
 * waste-heat and water sources within SOURCE_SEARCH_M of it; roads, rail and
 * open space crossing it. Geometry is clipped to the grown bounding box, so a
 * lake next to the site does not arrive as the whole lake.
 */
export function overpassQuery(boundary: Ring): string {
  const poly = boundary.map(([lon, lat]) => `${lat.toFixed(6)} ${lon.toFixed(6)}`).join(' ');
  const [w, s, e, n] = bbox(boundary, SOURCE_SEARCH_M);
  const box = `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`;
  return `[out:json][timeout:25][maxsize:67108864];
(
  way["building"](poly:"${poly}");
  relation["building"]["type"="multipolygon"](poly:"${poly}");
  node(poly:"${poly}")[~"^(amenity|shop|office|tourism|leisure|craft|healthcare|telecom|man_made)$"~"."];
  way["landuse"](poly:"${poly}");
  way["highway"~"^(motorway|trunk|primary)$"](poly:"${poly}");
  way["railway"="rail"](poly:"${poly}");
  way["leisure"~"^(park|pitch|playground)$"](poly:"${poly}");
  way["amenity"="parking"](poly:"${poly}");
  nwr["telecom"="data_center"](${box});
  nwr["building"="data_center"](${box});
  nwr["leisure"="ice_rink"](${box});
  nwr["sport"~"(^|;)(ice_hockey|ice_skating|skating|curling)(;|$)"]["leisure"~"^(sports_centre|stadium|sports_hall)$"](${box});
  way["building"]["sport"~"(^|;)(ice_hockey|ice_skating|skating|curling)(;|$)"](${box});
  nwr["craft"="brewery"](${box});
  nwr["man_made"="wastewater_plant"](${box});
  nwr["industrial"~"^(food|brewery|dairy|slaughterhouse)$"](${box});
  way["natural"="water"](${box});
  relation["natural"="water"](${box});
  way["waterway"~"^(river|canal)$"](${box});
  node["place"~"^(neighbourhood|suburb|quarter)$"]["name"](${box});
);
out geom(${box}) tags;`;
}

/** Why a boundary is refused before any query is made, or null if it is fine. */
export function boundaryProblem(boundary: Ring): string | null {
  if (boundary.length < 3) return 'A boundary needs at least three points.';
  for (const [lon, lat] of boundary) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return 'A boundary point is not a valid coordinate.';
    }
  }
  const area = ringArea(boundary);
  if (area > MAX_BOUNDARY_M2) {
    return `That area is ${(area / 1e6).toFixed(1)} km²; draw one under ${MAX_BOUNDARY_M2 / 1e6} km².`;
  }
  if (area < 100) return 'That area is too small to hold a building.';
  return null;
}
