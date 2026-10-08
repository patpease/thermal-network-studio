import { describe, expect, it } from 'vitest';

import { classifySite, kvLabel, TRANSMISSION_KV, voltagesKv } from '../src/site/classify';
import { siteContext } from '../src/site/context';
import { metresPerDegree } from '../src/site/geometry';
import type { LonLat, Ring } from '../src/site/geometry';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';
import { normaliseElements, overpassQuery, SOURCE_SEARCH_M, SUBSTATION_SEARCH_M } from '../src/site/osm';
import type { OsmFeature, SiteData } from '../src/site/osm';

// A ~200 m square block in Mankato, and points east of it at set distances.
const C: LonLat = [-94.0, 44.165];
const m = metresPerDegree(C[1]);
const east = (metres: number): LonLat => [C[0] + 100 / m.x + metres / m.x, C[1]];
const boundary: Ring = [
  [C[0] - 100 / m.x, C[1] - 100 / m.y],
  [C[0] + 100 / m.x, C[1] - 100 / m.y],
  [C[0] + 100 / m.x, C[1] + 100 / m.y],
  [C[0] - 100 / m.x, C[1] + 100 / m.y],
  [C[0] - 100 / m.x, C[1] - 100 / m.y],
];
const square = ([x, y]: LonLat, half = 20): Ring => [
  [x - half / m.x, y - half / m.y],
  [x + half / m.x, y - half / m.y],
  [x + half / m.x, y + half / m.y],
  [x - half / m.x, y + half / m.y],
  [x - half / m.x, y - half / m.y],
];
const house: OsmFeature = { id: 'w1', tags: { building: 'house' }, geometry: { type: 'polygon', ring: square(C, 6) } };
const subs: OsmFeature[] = [
  // 500 m east, mapped as an area, tagged distribution.
  { id: 'w10', tags: { power: 'substation', substation: 'distribution', voltage: '13800;4160', name: 'Riverside', operator: 'Xcel Energy' }, geometry: { type: 'polygon', ring: square(east(520)) } },
  // 1.2 km east, a point, no type: its 115 kV makes it transmission voltage.
  { id: 'n11', tags: { power: 'substation', voltage: '115000;13800' }, geometry: { type: 'point', at: east(1_200) } },
  // 300 m east, a point with nothing but the power tag.
  { id: 'n12', tags: { power: 'substation' }, geometry: { type: 'point', at: east(300) } },
  // 2 km east: beyond a mile.
  { id: 'n13', tags: { power: 'substation', voltage: '345000' }, geometry: { type: 'point', at: east(2_000) } },
];
const data = (features: OsmFeature[]): SiteData => ({ version: 1, boundary, features, skipped: 0 });

describe('substations within a mile (grid nearby)', () => {
  it('reads OSM voltages in volts as kV, highest first', () => {
    expect(voltagesKv('115000;13800')).toEqual([115, 13.8]);
    expect(voltagesKv('13800;115000;13800')).toEqual([115, 13.8]);
    expect(voltagesKv('4160')).toEqual([4.2]);
    expect(voltagesKv('medium')).toEqual([]);
    expect(voltagesKv(undefined)).toEqual([]);
    expect(kvLabel([115, 13.8])).toBe('115/13.8 kV');
    expect(kvLabel([])).toBe('');
  });

  it('asks Overpass for substations a mile out, as a second output', () => {
    expect(SUBSTATION_SEARCH_M).toBe(1_609);
    const q = overpassQuery(boundary);
    expect(q).toMatch(/nwr\["power"="substation"\]\([^)]+\);\nout geom\([^)]+\) tags;$/);
    // The substation box is wider than the heat-source box.
    const boxes = [...q.matchAll(/out geom\(([^)]+)\)/g)].map((x) => x[1]!.split(',').map(Number));
    expect(boxes).toHaveLength(2);
    expect(boxes[1]![2]! - boxes[1]![0]!).toBeGreaterThan(boxes[0]![2]! - boxes[0]![0]! + (2 * (SUBSTATION_SEARCH_M - SOURCE_SEARCH_M) * 0.9) / m.y);
  });

  it('keeps the substation tags, and a closed substation way is an area', () => {
    const d = normaliseElements(
      [
        {
          type: 'way',
          id: 7,
          tags: { power: 'substation', voltage: '69000', substation: 'transmission', name: 'North', 'ref:fake': 'x' },
          geometry: square(C).map(([lon, lat]) => ({ lon, lat })),
        },
      ],
      boundary,
    );
    expect(d.features[0]!.tags).toEqual({ power: 'substation', voltage: '69000', substation: 'transmission', name: 'North' });
    expect(d.features[0]!.geometry.type).toBe('polygon');
  });

  it('lists those within a mile, nearest first, each labelled', () => {
    const s = classifySite(data([house, ...subs])).substations;
    expect(s.map((x) => x.id)).toEqual(['n12', 'w10', 'n11']);
    expect(s[0]).toMatchObject({ name: null, voltagesKv: [], kind: null, kindFrom: null, ring: null });
    expect(s[1]).toMatchObject({ name: 'Riverside', operator: 'Xcel Energy', voltagesKv: [13.8, 4.2], kind: 'distribution', kindFrom: 'osm' });
    expect(s[1]!.ring).not.toBeNull();
    expect(s[1]!.distanceM).toBeGreaterThan(450);
    expect(s[1]!.distanceM).toBeLessThan(520);
    expect(s[2]).toMatchObject({ voltagesKv: [115, 13.8], kind: 'transmission', kindFrom: 'voltage' });
    expect(TRANSMISSION_KV).toBe(69);
  });

  it('never becomes a building, a source, or anything the engine is given', () => {
    const withSubs = classifySite(data([house, ...subs]));
    const without = classifySite(data([house]));
    expect(withSubs.buildings).toEqual(without.buildings);
    expect(withSubs.sources).toEqual(without.sources);
    expect(toNeighbourhood(withSubs, EMPTY_SELECTION, '6A', 'MISO_North')).toEqual(toNeighbourhood(without, EMPTY_SELECTION, '6A', 'MISO_North'));
  });

  it('Site features names the nearest, or says none is mapped', () => {
    const row = (site: ReturnType<typeof classifySite>) => siteContext(site, null).find((r) => r.key === 'substation')!;
    expect(row(classifySite(data([house, subs[0]!]))).finding).toMatch(/^Riverside, 13\.8\/4\.2 kV, \d+ m away$/);
    expect(row(classifySite(data([house]))).finding).toBe('None mapped in OpenStreetMap within 1,609 m');
    // OSM did not answer: unknown, never "none".
    const federalOnly = row(classifySite({ ...data([house]), osmUnavailable: true }));
    expect(federalOnly).toMatchObject({ known: false, finding: '' });
  });
});
