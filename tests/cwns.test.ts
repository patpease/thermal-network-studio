import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { byState, selectPlants } from '../scripts/cwns/lib';
import { classifySite, CWNS_MATCH_M, federalAnchor, federalIndustrial } from '../src/site/classify';
import type { Ring } from '../src/site/geometry';
import type { SiteData } from '../src/site/osm';
import type { Structures } from '../src/site/structures';
import { fetchWastewater, KG_PER_S_PER_MGD, statesFor, wastewaterCapacityW } from '../src/site/wastewater';
import type { CwnsIndex, WastewaterData } from '../src/site/wastewater';

const dir = resolve(import.meta.dirname, '../public/data/cwns');
const index = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')) as CwnsIndex;
const state = (st: string) => JSON.parse(readFileSync(resolve(dir, `${st}.json`), 'utf8')) as { release: string; plants: { id: string; name: string; lat: number; lon: number; designMgd: number }[] };

describe('CWNS 2022 selection (import:cwns)', () => {
  const row = (id: string, change: string, loc: Partial<Record<string, string>>, flow: Record<string, string>) => ({ id, change, loc, flow });
  const tables = (rows: ReturnType<typeof row>[]) => ({
    facilities: rows.map((r) => ({ CWNS_ID: r.id, FACILITY_NAME: `Plant ${r.id}`, STATE_CODE: 'MN' })),
    facilityTypes: rows.flatMap((r) => [
      { CWNS_ID: r.id, FACILITY_TYPE: 'Treatment Plant', CHANGE_TYPE: r.change },
      { CWNS_ID: r.id, FACILITY_TYPE: 'Collection: Separate Sewers', CHANGE_TYPE: 'Rehabilitation' },
    ]),
    locations: rows.map((r) => ({ CWNS_ID: r.id, LOCATION_TYPE: 'Point', LATITUDE: '44.1', LONGITUDE: '-94', CITY: 'Mankato', STATE_CODE: 'MN', ...r.loc })),
    flow: rows.flatMap((r) => Object.entries(r.flow).map(([k, v]) => ({ CWNS_ID: r.id, FLOW_TYPE: k, CURRENT_DESIGN_FLOW: v }))),
    effluent: rows.map((r) => ({ CWNS_ID: r.id, CURRENT_EFFLUENT_TREATMENT_LEVEL: 'Secondary' })),
  });

  it('keeps built plants with a point and a design flow, and counts what it drops', () => {
    const { plants, dropped } = selectPlants(
      tables([
        row('1', 'No Change', {}, { 'Total Flow': '2.5' }),
        row('2', 'New', {}, { 'Total Flow': '9' }),
        row('3', 'Abandonment', {}, { 'Total Flow': '1' }),
        row('4', 'Rehabilitation', { LOCATION_TYPE: 'City' }, { 'Total Flow': '1' }),
        row('5', 'Replacement', {}, { 'Total Flow': '' }),
        row('6', 'Increase Capacity', {}, { 'Total Flow': '', 'Municipal Flow': '1', 'Industrial Flow': '0.5', 'Infiltration Flow': '0.25' }),
      ]),
    );
    expect(plants.map((p) => [p.id, p.designMgd])).toEqual([
      ['1', 2.5],
      ['6', 1.75],
    ]);
    expect(dropped).toEqual({ notBuilt: 2, noPoint: 1, noFlow: 1 });
    expect(plants[0]).toMatchObject({ name: 'Plant 1', city: 'Mankato', state: 'MN', treatment: 'Secondary' });
  });

  it('groups by state with each state’s box', () => {
    const g = byState([
      { id: 'a', name: 'a', city: null, state: 'MN', lat: 44, lon: -94, designMgd: 1, treatment: null },
      { id: 'b', name: 'b', city: null, state: 'MN', lat: 46, lon: -92, designMgd: 1, treatment: null },
    ]);
    expect(g.get('MN')!.bbox).toEqual([-94, 44, -92, 46]);
  });
});

describe('the committed CWNS files (public/data/cwns)', () => {
  it('match their index: one file per state, counts and boxes', () => {
    const files = readdirSync(dir).filter((f) => f !== 'index.json');
    expect(files.sort()).toEqual(Object.keys(index.states).map((s) => `${s}.json`).sort());
    expect(index.release).toMatch(/^2022CWNS_NATIONAL_/);
    let total = 0;
    for (const [st, v] of Object.entries(index.states)) {
      const f = state(st);
      expect(f.release).toBe(index.release);
      expect(f.plants).toHaveLength(v.count);
      total += v.count;
      for (const p of f.plants) {
        expect(p.designMgd, p.id).toBeGreaterThan(0);
        expect(p.lon).toBeGreaterThanOrEqual(v.bbox[0]);
        expect(p.lat).toBeGreaterThanOrEqual(v.bbox[1]);
        expect(p.lon).toBeLessThanOrEqual(v.bbox[2]);
        expect(p.lat).toBeLessThanOrEqual(v.bbox[3]);
      }
    }
    expect(total).toBeGreaterThan(10_000);
  });

  it('holds Mankato’s plant at its 2022 design flow', () => {
    expect(state('MN').plants.find((p) => p.id === '27000028001')).toMatchObject({ name: 'MANKATO WWTP', designMgd: 11.25 });
  });
});

describe('heat from a plant’s flow', () => {
  it('1 MGD is about 43.8 kg/s, and at 3 K about 0.55 MW', () => {
    expect(KG_PER_S_PER_MGD).toBeCloseTo(43.8, 1);
    expect(wastewaterCapacityW(1)).toBe(550_000);
    expect(wastewaterCapacityW(11.25)).toBe(6_190_000);
  });
});

// A boundary drawn just south of Mankato's plant (44.1826, −93.9998).
const PLANT: [number, number] = [-93.9998, 44.1826];
const box = (s: number, n: number): Ring => [
  [-94.003, s],
  [-93.997, s],
  [-93.997, n],
  [-94.003, n],
  [-94.003, s],
];
const NEAR = box(44.177, 44.180); // ~290 m south
const FAR = box(44.170, 44.173); // ~1 km south
const mankato: WastewaterData = { release: index.release, plants: [{ id: '27000028001', name: 'MANKATO WWTP', city: 'Mankato', at: PLANT, designMgd: 11.25, treatment: 'Advanced' }] };
const site = (boundary: Ring, extra: Partial<SiteData> = {}): SiteData => ({ version: 1, boundary, features: [], skipped: 0, wastewater: mankato, ...extra });

describe('CWNS plants in the classifier', () => {
  it('a plant within a quarter mile becomes a candidate with a flow-based capacity', () => {
    const s = classifySite(site(NEAR)).sources.find((x) => x.kind === 'wastewater')!;
    expect(s).toMatchObject({ id: 'cwns:27000028001', name: 'MANKATO WWTP', exchange: 'water', estimatedCapacityW: wastewaterCapacityW(11.25) });
    expect(s.cwns).toEqual({ id: '27000028001', designMgd: 11.25, release: index.release });
    expect(s.distanceM).toBeGreaterThan(200);
    expect(s.distanceM).toBeLessThan(402);
  });

  it('a plant farther than a quarter mile is not a candidate', () => {
    expect(classifySite(site(FAR)).sources.filter((x) => x.kind === 'wastewater')).toHaveLength(0);
  });

  it('a plant OSM also has appears once, enriched, never twice', () => {
    expect(CWNS_MATCH_M).toBe(150);
    // OSM's outline of the plant, about 100 m square around the CWNS point.
    const [x, y] = PLANT;
    const d = 0.0006;
    const ring: Ring = [[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d], [x - d, y - d]];
    const osm = { id: 'w1', tags: { man_made: 'wastewater_plant' }, geometry: { type: 'polygon' as const, ring } };
    const s = classifySite(site(NEAR, { features: [osm] })).sources.filter((x) => x.kind === 'wastewater');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: 'w1', name: 'MANKATO WWTP', estimatedCapacityW: wastewaterCapacityW(11.25) });
    expect(s[0]!.cwns?.designMgd).toBe(11.25);
  });

  it('without CWNS data an OSM plant keeps the flat estimate', () => {
    const osm = { id: 'w1', tags: { man_made: 'wastewater_plant' }, geometry: { type: 'point' as const, at: PLANT } };
    const s = classifySite(site(NEAR, { features: [osm], wastewater: null })).sources.find((x) => x.kind === 'wastewater')!;
    expect(s.estimatedCapacityW).toBe(2_000_000);
    expect(s.cwns).toBeUndefined();
  });

  it('fetches only the states a site’s box touches, and never throws', async () => {
    expect(statesFor([-94.01, 44.17, -93.99, 44.19], index)).toContain('MN');
    expect(statesFor([-94.01, 44.17, -93.99, 44.19], index)).not.toContain('CA');
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      const file = url.replace('/data/cwns/', '');
      return { ok: true, json: async () => JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as unknown };
    };
    const got = await fetchWastewater(NEAR, 402, fetcher);
    expect(got?.plants.map((p) => p.id)).toContain('27000028001');
    expect(asked.every((u) => u.startsWith('/data/cwns/'))).toBe(true);
    expect(await fetchWastewater(NEAR, 402, async () => ({ ok: false, json: async () => null }))).toBeNull();
    expect(await fetchWastewater(NEAR, 402, async () => Promise.reject(new Error('offline')))).toBeNull();
  });
});

describe('anchors from federal occupancy', () => {
  it('maps FEMA occupancy, then NSI Hazus codes', () => {
    expect(federalAnchor({ occupancy: 'Pre-K - 12 Schools', occupancyClass: 'Education' }, [])).toEqual({ anchor: 'school', source: 'fema' });
    expect(federalAnchor({ occupancy: 'Emergency Response', occupancyClass: 'Government' }, [])).toEqual({ anchor: 'emergency', source: 'fema' });
    expect(federalAnchor({ occupancy: 'General Services', occupancyClass: 'Government' }, [])).toEqual({ anchor: 'civic', source: 'fema' });
    expect(federalAnchor({ occupancy: 'Religious', occupancyClass: 'Assembly' }, [])).toEqual({ anchor: 'worship', source: 'fema' });
    expect(federalAnchor({ occupancy: 'Retail Trade', occupancyClass: 'Commercial' }, ['COM6'])).toEqual({ anchor: 'hospital', source: 'nsi' });
    expect(federalAnchor(null, ['RES1-1SNB'])).toBeNull();
    expect(federalIndustrial({ occupancyClass: 'Industrial' }, [])).toBe(true);
    expect(federalIndustrial(null, ['IND2'])).toBe(true);
    expect(federalIndustrial(null, ['COM1'])).toBe(false);
  });

  for (const name of ['mankato-downtown', 'highland-park', 'alexandria-city-hall']) {
    it(`${name}: federal anchors fill gaps and never override an OSM anchor`, () => {
      const read = <T>(p: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, p), 'utf8')) as T;
      const osm = read<{ data: SiteData }>(`fixtures/sites/${name}.json`).data;
      const { structures } = read<{ structures: Structures }>(`fixtures/structures/${name}.json`);
      const without = new Map(classifySite(osm).buildings.map((b) => [b.id, b]));
      const withFed = classifySite({ ...osm, structures }).buildings;
      for (const b of withFed) {
        const before = without.get(b.id);
        if (before?.anchor) {
          expect(b.anchor, b.id).toBe(before.anchor);
          expect(b.anchorSource).toBe('osm');
        }
        if (b.anchorSource === 'fema' || b.anchorSource === 'nsi') expect(before?.anchor ?? null).toBeNull();
      }
    });
  }

  it('finds anchors OSM does not tag on at least one fixture', () => {
    const counts = ['mankato-downtown', 'highland-park', 'alexandria-city-hall'].map((name) => {
      const osm = (JSON.parse(readFileSync(resolve(import.meta.dirname, `fixtures/sites/${name}.json`), 'utf8')) as { data: SiteData }).data;
      const { structures } = JSON.parse(readFileSync(resolve(import.meta.dirname, `fixtures/structures/${name}.json`), 'utf8')) as { structures: Structures };
      return classifySite({ ...osm, structures }).buildings.filter((b) => b.anchorSource === 'fema' || b.anchorSource === 'nsi').length;
    });
    expect(Math.max(...counts)).toBeGreaterThan(0);
  });
});
