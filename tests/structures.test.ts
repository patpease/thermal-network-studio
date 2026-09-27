import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { classifySite, femaArchetype, hazusArchetype } from '../src/site/classify';
import type { Site } from '../src/site/classify';
import { centroid, distance } from '../src/site/geometry';
import type { SiteData } from '../src/site/osm';
import { normaliseFema, normaliseNsi } from '../src/site/structures';
import type { Structures } from '../src/site/structures';

const KEYS = ['mankato-downtown', 'highland-park', 'alexandria-city-hall'] as const;
const load = (key: string) => {
  const data = (JSON.parse(readFileSync(resolve(import.meta.dirname, `fixtures/sites/${key}.json`), 'utf8')) as { data: SiteData }).data;
  const { structures } = JSON.parse(readFileSync(resolve(import.meta.dirname, `fixtures/structures/${key}.json`), 'utf8')) as { structures: Structures };
  return { osm: classifySite(data), both: classifySite({ ...data, structures }), structures };
};
const heated = (s: Site) => s.buildings.filter((b) => b.archetype !== null);

describe('the federal mapping tables', () => {
  it('Hazus: houses, 2–4 units, 5+ units, and the rest', () => {
    expect(hazusArchetype('RES1-2SNB', 1)?.archetype).toBe('single-family');
    expect(hazusArchetype('RES2', 1)?.archetype).toBe('single-family');
    expect(hazusArchetype('RES3A', 2)?.archetype).toBe('small-multifamily');
    expect(hazusArchetype('RES3B', 4)?.archetype).toBe('small-multifamily');
    expect(hazusArchetype('RES3C', 8)?.archetype).toBe('large-multifamily');
    expect(hazusArchetype('RES3F', 60)?.archetype).toBe('large-multifamily');
    expect(hazusArchetype('RES4', null)?.archetype).toBe('hotel');
    expect(hazusArchetype('COM6', null)?.archetype).toBe('hospital');
    expect(hazusArchetype('EDU1', null)?.archetype).toBe('school-primary');
    expect(hazusArchetype('IND3', null)?.archetype).toBe('warehouse');
    expect(hazusArchetype('COM10', null)).toEqual({ archetype: null, heated: false });
    expect(hazusArchetype('XYZ', null)).toBeNull();
  });

  it('FEMA: every occupancy it publishes maps to an answer or says nothing', () => {
    expect(femaArchetype('Single Family Dwelling', 'Residential', 120)?.archetype).toBe('single-family');
    expect(femaArchetype('Multi - Family Dwelling', 'Residential', 300)?.archetype).toBe('small-multifamily');
    expect(femaArchetype('Multi - Family Dwelling', 'Residential', 900)?.archetype).toBe('large-multifamily');
    expect(femaArchetype('Pre-K - 12 Schools', 'Education', 3000)?.archetype).toBe('school-primary');
    expect(femaArchetype('Religious', 'Assembly', 800)?.archetype).toBe('office-small');
    expect(femaArchetype('Parking', 'Commercial', 3000)).toEqual({ archetype: null, heated: false });
    expect(femaArchetype('Unclassified', 'Unclassified', 100)).toBeNull();
  });
});

describe('normalising what the services send', () => {
  it('keeps the largest ring of a multipolygon, and drops what it cannot read', () => {
    const big = [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]];
    const small = [[1, 1], [1.0001, 1], [1.0001, 1.0001], [1, 1]];
    const r = normaliseFema({
      features: [
        { geometry: { type: 'MultiPolygon', coordinates: [[small], [big]] }, properties: { BUILD_ID: 1, PRIM_OCC: 'Hospital', OCC_CLS: 'Commercial' } },
        { geometry: null, properties: { BUILD_ID: 2 } },
      ],
      properties: { exceededTransferLimit: true },
    });
    expect(r.structures).toHaveLength(1);
    expect(r.structures[0]!.ring).toHaveLength(5);
    expect(r.truncated).toBe(true);
    expect(normaliseNsi({ features: [{ geometry: { type: 'Point', coordinates: [0, 0] }, properties: { fd_id: 1, occtype: 'RES1', med_yr_blt: 0 } }] })[0]!.medianYearBuilt).toBeNull();
  });
});

describe('merging federal structures into the site (phase 12)', () => {
  it('fills the Mankato blocks OSM leaves empty', () => {
    const { osm, both } = load('mankato-downtown');
    expect(heated(osm).length).toBeLessThan(80);
    expect(heated(both).length).toBeGreaterThan(300);
    const added = both.buildings.filter((b) => b.origin === 'fema');
    expect(added.length).toBeGreaterThan(250);
    for (const b of added) {
      expect(b.archetypeGuessed).toBe(true);
      expect(b.reason).toMatch(/^Not in OpenStreetMap\./);
    }
  });

  for (const key of KEYS) {
    it(`${key}: never adds a FEMA copy of a building OSM already has`, () => {
      const { both } = load(key);
      const osmCentres = both.buildings.filter((b) => b.origin === 'osm').map((b) => centroid(b.footprint));
      for (const b of both.buildings.filter((x) => x.origin === 'fema')) {
        const c = centroid(b.footprint);
        expect(osmCentres.every((o) => distance(o, c) >= 8)).toBe(true);
      }
    });

    it(`${key}: a use OSM names by tag is never replaced`, () => {
      const { osm, both } = load(key);
      const after = new Map(both.buildings.map((b) => [b.id, b]));
      // Office small/large is a size split on floor area, which NSI storeys may move.
      const use = (a: string | null | undefined) => (a === 'office-large' ? 'office-small' : a);
      for (const b of osm.buildings.filter((x) => !x.archetypeGuessed)) {
        expect(use(after.get(b.id)?.archetype)).toBe(use(b.archetype));
        expect(after.get(b.id)?.archetypeGuessed).toBe(false);
      }
    });

    it(`${key}: storeys and year come from NSI only where OSM has none, and say so`, () => {
      const { osm, both } = load(key);
      const before = new Map(osm.buildings.map((b) => [b.id, b]));
      for (const b of both.buildings.filter((x) => x.origin === 'osm')) {
        const o = before.get(b.id)!;
        if (!o.levelsGuessed) expect(b.levelsSource).toBe('osm');
        if (b.levelsSource === 'nsi') expect(o.levelsGuessed).toBe(true);
        if (b.vintageSource === 'nsi-median') expect(o.vintage).toBeNull();
      }
      expect(both.structures).toEqual({ fema: true, nsi: true, femaTruncated: false });
    });
  }

  it('a site read without federal data says so, and is what it was', () => {
    const { osm } = load('highland-park');
    expect(osm.structures).toBeUndefined();
    expect(osm.buildings.every((b) => b.origin === 'osm' && b.vintageSource !== 'nsi-median')).toBe(true);
  });

  it('a set that did not answer is recorded as missing', () => {
    const { structures } = load('alexandria-city-hall');
    const data = (JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/sites/alexandria-city-hall.json'), 'utf8')) as { data: SiteData }).data;
    const s = classifySite({ ...data, structures: { fema: structures.fema, nsi: null } });
    expect(s.structures).toEqual({ fema: true, nsi: false, femaTruncated: false });
    expect(s.buildings.some((b) => b.levelsSource === 'nsi')).toBe(false);
  });
});
