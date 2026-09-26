/**
 * Test fixtures: a few of the Minnesota study's sites, from OpenStreetMap.
 *
 *   npm run fixtures:sites
 *
 * From the OSM editing API (`/api/0.6/map`), not Overpass: this is a handful
 * of one-off requests to build committed test data, which the API's usage
 * policy allows, and it is reachable from places Overpass is not. The API
 * returns nodes and references; this script resolves them into the Overpass
 * `out geom` shape and runs the SAME normaliser the relay uses, so a fixture
 * is exactly what the relay would have produced.
 *
 * Boundaries are rectangles around each site's centre. The Minnesota report
 * publishes names, not boundaries, so these are this tool's reading of "the
 * site", stated here and in each fixture.
 *
 * © OpenStreetMap contributors, ODbL. The fixtures are derived data and carry
 * the attribution in their own `attribution` field.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bbox, centroid, metresPerDegree, pointInRing } from '../../src/site/geometry.ts';
import type { LonLat, Ring } from '../../src/site/geometry.ts';
import { normaliseElements, SOURCE_SEARCH_M } from '../../src/site/osm.ts';
import type { OverpassElement } from '../../src/site/osm.ts';

interface SiteDef {
  readonly key: string;
  readonly name: string;
  /** [lon, lat] */
  readonly centre: LonLat;
  /** Half-width and half-height of the boundary, m. */
  readonly halfWidth: number;
  readonly halfHeight: number;
  /** What the Minnesota report says about it, for the test to check. */
  readonly report: string;
}

export const SITES: readonly SiteDef[] = [
  {
    key: 'mankato-downtown',
    name: 'Downtown Mankato',
    centre: [-94.0005, 44.1665],
    halfWidth: 450,
    halfHeight: 450,
    report: 'Medium-density mixed-use downtown; data centre, ice arena, supermarket, soybean plant and wastewater plant nearby; Minnesota River adjacent. Scored 71.28.',
  },
  {
    key: 'highland-park',
    name: 'Highland Park, St. Paul',
    // Between the Charles M. Schulz–Highland Arena and Highland Park High.
    centre: [-93.169, 44.916],
    halfWidth: 450,
    halfHeight: 450,
    report: 'Medium-density residential with an ice arena and schools; "a lack of load diversity". Scored 45.95.',
  },
  {
    key: 'alexandria-city-hall',
    name: 'Alexandria City Hall',
    centre: [-95.3772, 45.8862],
    halfWidth: 400,
    halfHeight: 400,
    report: 'Medium-density mixed use: city hall, library, courthouse, churches; data centre and brewery; Lake Winona adjacent. Scored 69.38.',
  },
];

const API = 'https://api.openstreetmap.org/api/0.6/map.json';

interface ApiElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  members?: { type: string; ref: number; role: string }[];
}

function rectangle(centre: LonLat, halfWidth: number, halfHeight: number): Ring {
  const m = metresPerDegree(centre[1]);
  const dx = halfWidth / m.x;
  const dy = halfHeight / m.y;
  const [x, y] = centre;
  return [
    [x - dx, y - dy],
    [x + dx, y - dy],
    [x + dx, y + dy],
    [x - dx, y + dy],
    [x - dx, y - dy],
  ];
}

async function fetchBox(w: number, s: number, e: number, n: number): Promise<ApiElement[]> {
  const url = `${API}?bbox=${w.toFixed(6)},${s.toFixed(6)},${e.toFixed(6)},${n.toFixed(6)}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'thermal-network-studio fixtures (github.com/patpease)' } });
  if (response.status === 400) {
    // Too many nodes: split in four.
    const mx = (w + e) / 2;
    const my = (s + n) / 2;
    const parts = await Promise.all([
      fetchBox(w, s, mx, my),
      fetchBox(mx, s, e, my),
      fetchBox(w, my, mx, n),
      fetchBox(mx, my, e, n),
    ]);
    return parts.flat();
  }
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return ((await response.json()) as { elements: ApiElement[] }).elements;
}

/** Resolve references into Overpass `out geom` shape, dropping duplicates. */
function toOverpass(elements: ApiElement[]): OverpassElement[] {
  const nodes = new Map<number, { lat: number; lon: number }>();
  const ways = new Map<number, ApiElement>();
  for (const el of elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) nodes.set(el.id, { lat: el.lat, lon: el.lon });
    if (el.type === 'way') ways.set(el.id, el);
  }
  const out = new Map<string, OverpassElement>();
  for (const el of elements) {
    const key = `${el.type}${el.id}`;
    if (out.has(key) || !el.tags) continue;
    if (el.type === 'node') out.set(key, { type: 'node', id: el.id, lat: el.lat!, lon: el.lon!, tags: el.tags });
    else if (el.type === 'way') {
      const geometry = (el.nodes ?? []).map((id) => nodes.get(id) ?? null);
      out.set(key, { type: 'way', id: el.id, tags: el.tags, geometry });
    } else if (el.type === 'relation') {
      const members = (el.members ?? [])
        .filter((m) => m.type === 'way')
        .map((m) => ({
          type: 'way',
          role: m.role,
          geometry: (ways.get(m.ref)?.nodes ?? []).map((id) => nodes.get(id) ?? null),
        }));
      out.set(key, { type: 'relation', id: el.id, tags: el.tags, members });
    }
  }
  return [...out.values()];
}

/**
 * Keep what the relay's Overpass query would have selected: buildings, POIs
 * and land use inside the boundary; roads, rail and open space crossing it;
 * sources and water in the grown box. Approximate at the edges (Overpass
 * selects by geometry, this by any node inside), which a fixture can afford.
 */
function selectLikeOverpass(elements: OverpassElement[], boundary: Ring): OverpassElement[] {
  const within = (el: OverpassElement) => {
    const pts = el.type === 'node' ? [{ lat: el.lat!, lon: el.lon! }] : (el.geometry ?? el.members?.flatMap((m) => m.geometry ?? []) ?? []);
    return pts.some((p) => p && pointInRing([p.lon, p.lat], boundary));
  };
  return elements.filter((el) => {
    const t = el.tags ?? {};
    const source =
      t['telecom'] === 'data_center' || t['building'] === 'data_center' || t['leisure'] === 'ice_rink' ||
      (/(^|;)\s*(ice_hockey|ice_skating|skating|curling)\s*(;|$)/.test(t['sport'] ?? '') && (t['leisure'] || t['building'])) ||
      t['craft'] === 'brewery' || t['man_made'] === 'wastewater_plant' ||
      ['food', 'brewery', 'dairy', 'slaughterhouse'].includes(t['industrial'] ?? '') ||
      t['natural'] === 'water' || ['river', 'canal'].includes(t['waterway'] ?? '');
    if (source) return true;
    if (!within(el)) return false;
    if (t['building'] || t['landuse']) return true;
    if (['motorway', 'trunk', 'primary'].includes(t['highway'] ?? '') || t['railway'] === 'rail') return true;
    if (['park', 'pitch', 'playground'].includes(t['leisure'] ?? '') || t['amenity'] === 'parking') return true;
    return el.type === 'node' && ['amenity', 'shop', 'office', 'tourism', 'leisure', 'craft', 'healthcare', 'telecom', 'man_made'].some((k) => k in t);
  });
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  mkdirSync(resolve(here, '../../tests/fixtures/sites'), { recursive: true });
  for (const site of SITES) {
    const boundary = rectangle(site.centre, site.halfWidth, site.halfHeight);
    const [w, s, e, n] = bbox(boundary, SOURCE_SEARCH_M);
    const raw = await fetchBox(w, s, e, n);
    const elements = selectLikeOverpass(toOverpass(raw), boundary);
    const data = normaliseElements(elements, boundary);
    const fixture = {
      site: site.name,
      report: site.report,
      boundaryNote: `A ${site.halfWidth * 2} × ${site.halfHeight * 2} m rectangle about [${site.centre.join(', ')}] — this tool's reading of the site; the report publishes no boundary.`,
      attribution: '© OpenStreetMap contributors, ODbL 1.0',
      fetched: new Date().toISOString().slice(0, 10),
      data,
    };
    writeFileSync(resolve(here, `../../tests/fixtures/sites/${site.key}.json`), `${JSON.stringify(fixture)}\n`);
    const buildings = data.features.filter((f) => f.tags['building'] && f.geometry.type === 'polygon' && pointInRing(centroid((f.geometry as { ring: Ring }).ring), boundary));
    console.log(`${site.key}: ${raw.length} raw → ${data.features.length} features, ${buildings.length} buildings inside`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
