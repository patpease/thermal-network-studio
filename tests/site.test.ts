import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { neighbourhoodDemand, siteMetrics } from '../src/engine/demand';
import { centroid, lineCrossesRing, pointInRing, ringArea } from '../src/site/geometry';
import type { Ring } from '../src/site/geometry';
import { classifySite, MAX_BUILDINGS, vintageOf } from '../src/site/classify';
import type { Site } from '../src/site/classify';
import { siteContext } from '../src/site/context';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';
import { boundaryProblem, normaliseElements, overpassQuery } from '../src/site/osm';
import type { OverpassElement, SiteData } from '../src/site/osm';

const load = (key: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `fixtures/sites/${key}.json`), 'utf8')) as { data: SiteData };

/** A square of side `m` metres at about 45° N. */
function square(m: number, lon = -93.2, lat = 45): Ring {
  const dx = m / (111_195 * Math.cos((lat * Math.PI) / 180));
  const dy = m / 111_195;
  return [
    [lon, lat],
    [lon + dx, lat],
    [lon + dx, lat + dy],
    [lon, lat + dy],
    [lon, lat],
  ];
}

describe('geometry', () => {
  it('measures a 100 m square as 10,000 m² to within 0.5%', () => {
    expect(ringArea(square(100)) / 10_000).toBeCloseTo(1, 2);
  });

  it('tests inside and crossing', () => {
    const s = square(100);
    expect(pointInRing(centroid(s), s)).toBe(true);
    expect(pointInRing([-93.3, 45], s)).toBe(false);
    expect(lineCrossesRing([[-93.3, 45.0004], [-93.1, 45.0004]], s)).toBe(true);
    expect(lineCrossesRing([[-93.3, 46], [-93.1, 46]], s)).toBe(false);
  });
});

describe('the boundary', () => {
  it('refuses a city, a speck, and nonsense', () => {
    expect(boundaryProblem(square(3000))).toMatch(/km²/);
    expect(boundaryProblem(square(5))).toMatch(/too small/);
    expect(boundaryProblem([[0, 0], [1, 1]])).toMatch(/three/);
    expect(boundaryProblem(square(500))).toBeNull();
  });

  it('builds one Overpass query that asks for buildings inside and sources around', () => {
    const q = overpassQuery(square(500));
    expect(q).toContain('way["building"](poly:');
    expect(q).toContain('"telecom"="data_center"');
    expect(q).toContain('"man_made"="wastewater_plant"');
    expect(q).toMatch(/out geom\([-\d.,]+\) tags;$/);
  });
});

describe('normalising OSM', () => {
  it('keeps only the tags anything reads, and turns closed building ways into polygons', () => {
    const ring = square(20);
    const el: OverpassElement = {
      type: 'way',
      id: 7,
      tags: { building: 'house', 'addr:street': 'Main', name: 'No. 1' },
      geometry: ring.map(([lon, lat]) => ({ lon, lat })),
    };
    const d = normaliseElements([el], square(100));
    expect(d.features[0]!.id).toBe('w7');
    expect(d.features[0]!.geometry.type).toBe('polygon');
    expect(d.features[0]!.tags).toEqual({ building: 'house', name: 'No. 1' });
  });

  it('skips relation members that arrive with no points instead of crashing', () => {
    const ring = square(20);
    const el: OverpassElement = {
      type: 'relation',
      id: 9,
      tags: { building: 'yes' },
      members: [
        { type: 'way', role: 'outer', geometry: [] },
        { type: 'way', role: 'outer', geometry: ring.map(([lon, lat]) => ({ lon, lat })) },
      ],
    };
    expect(normaliseElements([el], square(100)).features[0]!.geometry.type).toBe('polygon');
  });
});

function siteOf(features: { tags: Record<string, string>; m: number; at?: [number, number] }[]): Site {
  const boundary = square(400);
  const elements: OverpassElement[] = features.map((f, i) => {
    const ring = square(f.m, -93.2 + 0.0005 + i * 0.0006, 45 + 0.0005);
    return { type: 'way', id: i + 1, tags: f.tags, geometry: ring.map(([lon, lat]) => ({ lon, lat })) };
  });
  return classifySite(normaliseElements(elements, boundary));
}

describe('classifying buildings', () => {
  it('reads tags directly and does not call that a guess', () => {
    const s = siteOf([{ tags: { building: 'house' }, m: 12 }, { tags: { building: 'yes', shop: 'supermarket' }, m: 60 }]);
    expect(s.buildings.map((b) => b.archetype)).toEqual(['single-family', 'supermarket']);
    expect(s.buildings.every((b) => !b.archetypeGuessed)).toBe(true);
  });

  it('guesses an untagged building from its size, and says so', () => {
    const s = siteOf([{ tags: { building: 'yes' }, m: 12 }, { tags: { building: 'yes' }, m: 40 }]);
    expect(s.buildings[0]!.archetype).toBe('single-family');
    expect(s.buildings[1]!.archetype).toBe('large-multifamily');
    expect(s.buildings.every((b) => b.archetypeGuessed)).toBe(true);
    expect(s.buildings[0]!.reason).toMatch(/size/);
  });

  it('a garage and a shed are not heat loads; a data centre is a source, not a load', () => {
    const s = siteOf([
      { tags: { building: 'garage' }, m: 8 },
      { tags: { building: 'data_center', name: 'DC1' }, m: 50 },
    ]);
    expect(s.buildings.map((b) => b.archetype)).toEqual([null, null]);
    expect(s.sources.map((x) => x.kind)).toEqual(['data-centre']);
    // Its footprint at 250 W/m², to the nearest 10 kW.
    const hall = s.buildings[1]!.footprintM2;
    expect(Math.abs(s.sources[0]!.estimatedCapacityW - hall * 250)).toBeLessThanOrEqual(5_000);
  });

  it('levels from the tag, from height, or a guessed default', () => {
    const s = siteOf([
      { tags: { building: 'office', 'building:levels': '7' }, m: 30 },
      { tags: { building: 'office', height: '16' }, m: 30 },
      { tags: { building: 'office' }, m: 30 },
    ]);
    expect(s.buildings.map((b) => b.levels)).toEqual([7, 5, 2]);
    expect(s.buildings.map((b) => b.levelsGuessed)).toEqual([false, false, true]);
    // The small/large office split follows floor area.
    expect(s.buildings[0]!.archetype).toBe('office-large');
    expect(s.buildings[2]!.archetype).toBe('office-small');
  });

  it('reads vintage from start_date', () => {
    expect(vintageOf({ start_date: '1925' })).toBe('pre-1950');
    expect(vintageOf({ start_date: '2004-06' })).toBe('2000+');
    expect(vintageOf({})).toBeNull();
  });

  it('marks anchors', () => {
    const s = siteOf([{ tags: { building: 'yes', amenity: 'townhall', name: 'City Hall' }, m: 30 }]);
    expect(s.buildings[0]!.anchor).toBe('civic');
  });
});

describe('the Minnesota sites (D28): what OSM lets us check', () => {
  const mankato = classifySite(load('mankato-downtown').data);
  const highland = classifySite(load('highland-park').data);
  const alexandria = classifySite(load('alexandria-city-hall').data);
  const kinds = (s: Site) => new Set(s.sources.map((x) => x.kind));

  it('Mankato: the river, the ice arena, a supermarket and a brewery are all found', () => {
    // The report lists a data centre, ice arena, supermarket, soybean plant and
    // wastewater plant, with the Minnesota River adjacent. OSM tags four within
    // 500 m of this boundary; the data centre and the plants are not there.
    for (const k of ['river', 'ice-rink', 'supermarket', 'brewery'] as const) expect(kinds(mankato).has(k)).toBe(true);
  });

  it('Highland Park: the arena is found — tagged as a sports centre with sport=skating', () => {
    expect(highland.sources.some((s) => s.kind === 'ice-rink' && /Highland Arena/.test(s.name ?? ''))).toBe(true);
  });

  it('Alexandria: City Hall, the courthouse and the library are anchors; Lake Winona is found', () => {
    const names = alexandria.buildings.filter((b) => b.anchor).map((b) => b.name ?? '');
    expect(names).toContain('Alexandria City Hall');
    expect(names).toContain('Douglas County Courthouse');
    expect(alexandria.sources.some((s) => s.kind === 'lake' && /Winona/.test(s.name ?? ''))).toBe(true);
  });

  it('Highland Park is the more residential, as the report says (“a lack of load diversity”)', () => {
    const residentialShare = (s: Site) => {
      const all = s.buildings.reduce((a, b) => a + b.floorArea, 0);
      const res = s.buildings
        .filter((b) => ['single-family', 'small-multifamily', 'large-multifamily'].includes(b.archetype ?? ''))
        .reduce((a, b) => a + b.floorArea, 0);
      return res / all;
    };
    expect(residentialShare(highland)).toBeGreaterThan(0.8);
    expect(residentialShare(highland)).toBeGreaterThan(residentialShare(mankato));
  });

  it('… and so the more heating-dominated, on the same weather', () => {
    const weather = calibrationWeather('6A');
    const share = (s: Site) => {
      const buildings = s.buildings.filter((b) => b.archetype).slice(0, MAX_BUILDINGS).map((b) => b.id);
      const keep = new Set(buildings);
      const trimmed = { ...s, buildings: s.buildings.filter((b) => keep.has(b.id)) };
      const n = toNeighbourhood(trimmed, EMPTY_SELECTION, '6A', 'MISO_North');
      return siteMetrics(neighbourhoodDemand(n, weather), n.landArea).heatingShare;
    };
    expect(share(highland)).toBeGreaterThan(share(mankato));
  });

  it('the site features panel lists only what the tool can find, and names no study', () => {
    const rows = siteContext(alexandria, null);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey['anchors']!.known).toBe(true);
    expect(byKey['anchors']!.finding).toMatch(/City Hall/);
    for (const k of ['geology', 'hvac', 'grid', 'environment', 'priority', 'ownership']) expect(byKey[k]).toBeUndefined();
    expect(JSON.stringify(rows)).not.toMatch(/Minnesota/);
    // No weights and no total, anywhere in it.
    expect(JSON.stringify(rows)).not.toMatch(/weight|score/i);
  });

  it('prints the search distance in the displayed unit, never a bare "m" under IP', () => {
    const ip = { area: (m2: number) => `${m2} ft²`, density: (d: number) => `${d}`, distance: (m: number) => `${Math.round(m / 0.3048)} ft` };
    const row = siteContext(mankato, null, ip).find((r) => r.key === 'opportunistic')!;
    expect(row.finding).toMatch(/within 1640 ft/);
    expect(row.finding).not.toMatch(/\b500 m\b/);
  });
});

describe('the D11 cap', () => {
  it('refuses to hand the engine more than 500 buildings', () => {
    const highland = classifySite(load('highland-park').data);
    const heated = highland.buildings.filter((b) => b.archetype).length;
    expect(heated).toBeGreaterThan(MAX_BUILDINGS);
    expect(() => toNeighbourhood(highland, EMPTY_SELECTION, '6A', 'MISO_North')).toThrow(/at most 500/);
  });
});

describe('neighbourhood name', () => {
  const ring = square(400);
  const [cx, cy] = centroid(ring);
  const place = (id: string, name: string, kind: string, at: [number, number]) => ({ id, tags: { place: kind, name }, geometry: { type: 'point' as const, at } });
  const data = (features: ReturnType<typeof place>[]): SiteData => ({ version: 1, boundary: ring, features, skipped: 0 });

  it('takes the one inside the boundary over a nearer one outside', () => {
    const s = classifySite(data([place('n1', 'Outside', 'neighbourhood', [cx + 0.006, cy]), place('n2', 'Inside', 'suburb', [cx + 0.001, cy])]));
    expect(s.placeName).toBe('Inside');
  });

  it('prefers a neighbourhood to the suburb it sits in', () => {
    const s = classifySite(data([place('n1', 'Suburb', 'suburb', [cx, cy]), place('n2', 'Hood', 'neighbourhood', [cx + 0.001, cy])]));
    expect(s.placeName).toBe('Hood');
  });

  it('is null when OSM names none, never guessed', () => {
    expect(classifySite(data([])).placeName).toBeNull();
  });
});
