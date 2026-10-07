import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { handleSteam, steamCacheKey } from '../src/relay/relay';
import { classifySite, STEAM_MATCH_M } from '../src/site/classify';
import type { Ring } from '../src/site/geometry';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';
import type { SiteData } from '../src/site/osm';
import { LL84_MIN_FLOOR_M2, ll84Url, normaliseLl84, touchesNyc } from '../src/site/steam';

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/steam/midtown.json'), 'utf8')) as {
  box: [number, number, number, number];
  rows: Record<string, unknown>[];
};
const params = (box: readonly number[]) => new URLSearchParams({ w: String(box[0]), s: String(box[1]), e: String(box[2]), n: String(box[3]) });

describe('NYC LL84 district steam', () => {
  it('keeps each property’s latest year, and flags steam only above zero', () => {
    const d = normaliseLl84([
      { property_id: '1', report_year: '2023', district_steam_use_kbtu: '500', latitude: '40.75', longitude: '-73.98' },
      { property_id: '1', report_year: '2024', district_steam_use_kbtu: 'Not Available', latitude: '40.75', longitude: '-73.98' },
      { property_id: '2', report_year: '2024', district_steam_use_kbtu: '12.5', latitude: '40.751', longitude: '-73.981', property_name: 'Two' },
      { property_id: '3', report_year: '2022', district_steam_use_kbtu: '0', latitude: '40.752', longitude: '-73.982' },
      { property_id: '4', report_year: '2024', district_steam_use_kbtu: '9', latitude: '0', longitude: '0' },
    ]);
    // 1 left steam in 2024; 3 reports zero; 4 has no location.
    expect(d.steam.map((p) => p.id)).toEqual(['2']);
    expect(d).toMatchObject({ year: 2024, properties: 4 });
    expect(d.steam[0]).toMatchObject({ name: 'Two', at: [-73.981, 40.751], year: 2024 });
  });

  it('reads the recorded Midtown answer: buildings on steam, in their latest year', () => {
    const d = normaliseLl84(fixture.rows);
    expect(d.year).toBe(2024);
    expect(d.properties).toBeGreaterThan(50);
    expect(d.steam.length).toBeGreaterThan(10);
    expect(d.steam.some((p) => /Grace Building/.test(p.name ?? ''))).toBe(true);
  });

  it('asks only for the fields it uses, in the box, and only in New York City', () => {
    const url = new URL(ll84Url(fixture.box));
    expect(url.hostname).toBe('data.cityofnewyork.us');
    expect(url.searchParams.get('$select')).toContain('district_steam_use_kbtu');
    expect(url.searchParams.get('$select')).not.toContain('site_eui');
    expect(url.searchParams.get('$where')).toContain('latitude between 40.752 and 40.7565');
    expect(touchesNyc(fixture.box)).toBe(true);
    expect(touchesNyc([-94.0, 44.1, -93.9, 44.2])).toBe(false);
  });

  it('the relay answers from the service in NYC and makes no request outside it', async () => {
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(fixture.rows), { status: 200 });
    };
    const nyc = await handleSteam(params(fixture.box), fetcher);
    expect(nyc.status).toBe(200);
    expect((nyc.body as { steam: { steam: unknown[] } }).steam.steam.length).toBeGreaterThan(10);
    expect(asked).toHaveLength(1);

    const mankato = await handleSteam(params([-94.0, 44.1, -93.99, 44.11]), fetcher);
    expect(mankato).toMatchObject({ status: 200, body: { steam: null } });
    expect(asked).toHaveLength(1);

    expect((await handleSteam(params([-74, 40.7, -73.5, 40.9]), fetcher)).status).toBe(400);
    expect((await handleSteam(params(fixture.box), async () => new Response('', { status: 503 }))).status).toBe(502);
    expect(steamCacheKey(params(fixture.box))).toMatch(/^steam\|\d+\|/);
  });
});

describe('steam in the classifier', () => {
  // A footprint drawn round the Grace Building's LL84 point, and one round
  // a point that reports no steam.
  const steam = normaliseLl84(fixture.rows);
  const grace = steam.steam.find((p) => /Grace Building/.test(p.name ?? ''))!;
  const square = ([x, y]: readonly [number, number], d = 0.0002): Ring => [
    [x - d, y - d],
    [x + d, y - d],
    [x + d, y + d],
    [x - d, y + d],
    [x - d, y - d],
  ];
  const boundary: Ring = [
    [fixture.box[0], fixture.box[1]],
    [fixture.box[2], fixture.box[1]],
    [fixture.box[2], fixture.box[3]],
    [fixture.box[0], fixture.box[3]],
    [fixture.box[0], fixture.box[1]],
  ];
  const site = (s: SiteData['steam']): SiteData => ({
    version: 1,
    boundary,
    skipped: 0,
    features: [
      { id: 'w1', tags: { building: 'office', 'building:levels': '30' }, geometry: { type: 'polygon', ring: square(grace.at) } },
      { id: 'w2', tags: { building: 'office', 'building:levels': '10' }, geometry: { type: 'polygon', ring: square([fixture.box[0] + 0.0004, fixture.box[1] + 0.0004]) } },
    ],
    ...(s !== undefined ? { steam: s } : {}),
  });

  it('flags the building whose footprint holds a steam property, and counts the rest', () => {
    const s = classifySite(site(steam));
    expect(s.buildings.find((b) => b.id === 'w1')!.steam).toBe(true);
    expect(s.buildings.find((b) => b.id === 'w2')!.steam).toBe(false);
    expect(s.steam).toMatchObject({ year: 2024, buildings: 1 });
    expect(s.steam!.unmatched).toBeGreaterThan(10);
  });

  it('an address point on the street frontage takes the nearest footprint within 20 m, and no farther', () => {
    expect(STEAM_MATCH_M).toBe(20);
    // ~10 m and ~30 m east of the Grace Building's square (0.0002° ≈ 17 m half-width).
    const near = { ...grace, id: 'near', at: [grace.at[0] + 0.0002 + 10 / 84_400, grace.at[1]] as [number, number] };
    const far = { ...grace, id: 'far', at: [grace.at[0] + 0.0002 + 30 / 84_400, grace.at[1]] as [number, number] };
    const one = (p: typeof grace) => {
      const f = site({ year: 2024, properties: 1, steam: [p] });
      return classifySite({ ...f, features: [f.features[0]!] });
    };
    expect(one(near).buildings[0]!.steam).toBe(true);
    expect(one(far).buildings[0]!.steam).toBe(false);
    expect(one(far).steam).toMatchObject({ buildings: 0, unmatched: 1 });
  });

  it('a nearby footprint too small to be an LL84 property is never flagged', () => {
    // A ~17 m square shop, the point 10 m off its edge.
    const near = { ...grace, id: 'near', at: [grace.at[0] + 0.0001 + 10 / 84_400, grace.at[1]] as [number, number] };
    const f = site({ year: 2024, properties: 1, steam: [near] });
    const small = { id: 'w9', tags: { building: 'retail', 'building:levels': '1' }, geometry: { type: 'polygon' as const, ring: square(grace.at, 0.0001) } };
    const s = classifySite({ ...f, features: [small] });
    expect(s.buildings[0]!.floorArea).toBeLessThan(LL84_MIN_FLOOR_M2 / 2);
    expect(s.buildings[0]!.steam).toBe(false);
    expect(s.steam).toMatchObject({ buildings: 0, unmatched: 1 });
  });

  it('outside NYC there is no steam summary, and no building is flagged', () => {
    const s = classifySite(site(undefined));
    expect(s.steam).toBeUndefined();
    expect(s.buildings.every((b) => !b.steam)).toBe(true);
  });

  it('never changes what the engine is given', () => {
    const a = toNeighbourhood(classifySite(site(steam)), EMPTY_SELECTION, '4A', 'NYISO');
    const b = toNeighbourhood(classifySite(site(undefined)), EMPTY_SELECTION, '4A', 'NYISO');
    expect(a).toEqual(b);
  });
});
