import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  handleBuildings,
  handleSite,
  handleWeather,
  isAllowedHost,
  OVERPASS_DOWN,
  OVERPASS_HOSTS,
  parseBoundary,
  placeNames,
  siteForCounty,
  standardOffsetSeconds,
  yearFromArchive,
} from '../src/relay/relay';
import type { Fetcher } from '../src/relay/relay';
import { handle } from '../worker/handler';
import type { EdgeCache, Env } from '../worker/handler';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const env: Env = { ASSETS: { fetch: async () => new Response('<html>', { status: 200 }) } };

describe('host pinning', () => {
  it('allows exact hosts only', () => {
    expect(isAllowedHost('overpass-api.de')).toBe(true);
    expect(isAllowedHost('OVERPASS-API.DE')).toBe(true);
    expect(isAllowedHost('overpass-api.de.example.com')).toBe(false);
    expect(isAllowedHost('evil-overpass-api.de')).toBe(false);
  });
});

describe('/api/site', () => {
  it('turns a county into the zone its calibration uses and its Cambium region', () => {
    expect(siteForCounty('27013')).toMatchObject({ zone: '6A', region: 'MISO_North', county: 'MN, Blue Earth County' });
    expect(siteForCounty('17031')).toMatchObject({ zone: '5A', region: 'PJM_West' });
  });

  it('refuses a county with no Cambium grid region (Alaska) rather than guessing one', () => {
    expect(siteForCounty('02090')).toBeNull();
  });

  it('reads the Census geocoder’s answer', async () => {
    const fetcher: Fetcher = async (url) => {
      expect(new URL(url).hostname).toBe('geocoding.geo.census.gov');
      return jsonResponse({ result: { geographies: { Counties: [{ GEOID: '27013' }] } } });
    };
    const r = await handleSite(new URLSearchParams('lat=44.16&lon=-94.0'), fetcher);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ countyFips: '27013', zone: '6A' });
  });

  it('names the town and state the point is in, preferring an incorporated place', async () => {
    const fetcher: Fetcher = async (url) => {
      expect(new URL(url).searchParams.get('layers')).toContain('Incorporated Places');
      return jsonResponse({
        result: {
          geographies: {
            Counties: [{ GEOID: '27013' }],
            'Incorporated Places': [{ BASENAME: 'Mankato', NAME: 'Mankato city' }],
            'County Subdivisions': [{ BASENAME: 'Mankato' }],
            States: [{ STUSAB: 'MN', NAME: 'Minnesota' }],
          },
        },
      });
    };
    const r = await handleSite(new URLSearchParams('lat=44.16&lon=-94.0'), fetcher);
    expect(r.body).toMatchObject({ town: 'Mankato', state: 'MN' });
  });

  it('falls back to a census-designated place, then a township, and never invents one', () => {
    expect(placeNames({ 'Census Designated Places': [{ BASENAME: 'Columbia' }], States: [{ STUSAB: 'MD' }] })).toEqual({ town: 'Columbia', state: 'MD' });
    expect(placeNames({ 'County Subdivisions': [{ BASENAME: 'Framingham' }] })).toEqual({ town: 'Framingham', state: null });
    expect(placeNames({})).toEqual({ town: null, state: null });
  });

  it('says plainly when a point is outside the United States', async () => {
    const r = await handleSite(new URLSearchParams('lat=51.5&lon=-0.1'), async () => jsonResponse({ result: { geographies: { Counties: [] } } }));
    expect(r.status).toBe(422);
  });
});

/** A synthetic archive: temperature = the label's index, so shifts are visible. */
function archive(year: number, appliedOffset: number, timezone = 'America/Chicago') {
  const time: string[] = [];
  const start = Date.UTC(year - 1, 11, 31);
  const end = Date.UTC(year + 1, 0, 1, 23);
  for (let t = start; t <= end; t += 3600_000) time.push(new Date(t).toISOString().slice(0, 16));
  return {
    timezone,
    utc_offset_seconds: appliedOffset,
    hourly: {
      time,
      temperature_2m: time.map((_, i) => i),
      relative_humidity_2m: time.map(() => 50),
      shortwave_radiation: time.map(() => 100),
    },
  };
}

describe('/api/weather', () => {
  it('knows Chicago’s standard offset whatever the season', () => {
    expect(standardOffsetSeconds('America/Chicago')).toBe(-6 * 3600);
  });

  it('shifts a summer request (CDT applied) back to standard time', () => {
    const a = archive(2025, -5 * 3600);
    const jan1 = a.hourly.time.indexOf('2025-01-01T00:00');
    const w = yearFromArchive(a, 2025);
    // 00:00 CST is 01:00 CDT: the value labelled one hour later.
    expect(w.temperature[0]).toBe(jan1 + 1);
    expect(w.temperature).toHaveLength(8760);
  });

  it('leaves a winter request (CST applied) where it is', () => {
    const a = archive(2025, -6 * 3600);
    expect(yearFromArchive(a, 2025).temperature[0]).toBe(a.hourly.time.indexOf('2025-01-01T00:00'));
  });

  it('drops 29 February in a leap year, and still returns 8760 hours', () => {
    const a = archive(2024, -6 * 3600);
    const w = yearFromArchive(a, 2024);
    expect(w.temperature).toHaveLength(8760);
    expect(w.temperature[59 * 24]).toBe(a.hourly.time.indexOf('2024-03-01T00:00'));
  });

  it('knows the weekday of 1 January (2025 began on a Wednesday)', () => {
    expect(yearFromArchive(archive(2025, -6 * 3600), 2025).firstWeekday).toBe(2);
  });

  it('asks for last year, a day either side, in one call', async () => {
    let asked = '';
    await handleWeather(
      new URLSearchParams('lat=44.1636&lon=-93.9994'),
      async (url) => {
        asked = url;
        return jsonResponse(archive(2025, -6 * 3600));
      },
      new Date('2026-09-26'),
    );
    const u = new URL(asked);
    expect(u.searchParams.get('start_date')).toBe('2024-12-31');
    expect(u.searchParams.get('end_date')).toBe('2026-01-01');
    expect(u.searchParams.get('latitude')).toBe('44.16');
  });

  it('turns Open-Meteo’s daily limit into a plain message', async () => {
    const r = await handleWeather(new URLSearchParams('lat=44&lon=-94'), async () => jsonResponse({ reason: 'limit' }, 429));
    expect(r.status).toBe(503);
  });
});

describe('/api/buildings', () => {
  const box = [
    [-94.0, 44.16],
    [-93.99, 44.16],
    [-93.99, 44.17],
    [-94.0, 44.17],
  ];

  it('closes an open boundary and refuses a bad one', () => {
    const ring = parseBoundary({ boundary: box });
    expect(Array.isArray(ring) && ring.length).toBe(5);
    expect(parseBoundary({ boundary: [[0, 0]] })).toMatchObject({ status: 400 });
    expect(parseBoundary({})).toMatchObject({ status: 400 });
  });

  it('posts one query to Overpass and returns the normalised site', async () => {
    let method = '';
    let body = '';
    const fetcher: Fetcher = async (url, init) => {
      expect(new URL(url).hostname).toBe('overpass-api.de');
      method = init?.method ?? '';
      body = decodeURIComponent(init?.body ?? '');
      return jsonResponse({
        elements: [{ type: 'node', id: 1, lat: 44.165, lon: -93.995, tags: { amenity: 'townhall', name: 'City Hall', fixme: 'x' } }],
      });
    };
    const r = await handleBuildings({ boundary: box }, fetcher);
    expect(method).toBe('POST');
    expect(body).toContain('[out:json]');
    const site = (r.body as { site: { features: { tags: Record<string, string> }[] } }).site;
    expect(site.features[0]!.tags).toEqual({ amenity: 'townhall', name: 'City Hall' });
  });

  it('when one Overpass instance is down (Cloudflare 521), asks the next', async () => {
    const asked: string[] = [];
    const fetcher: Fetcher = async (url, init) => {
      const host = new URL(url).hostname;
      asked.push(host);
      expect(init?.timeoutMs).toBeGreaterThan(0);
      if (host === OVERPASS_HOSTS[0]) return new Response('<html>Web server is down</html>', { status: 521 });
      return jsonResponse({ elements: [] });
    };
    const r = await handleBuildings({ boundary: box }, fetcher);
    expect(r.status).toBe(200);
    expect(asked).toEqual([OVERPASS_HOSTS[0], OVERPASS_HOSTS[1]]);
  });

  it('moves on when an instance is busy, times out or answers with an HTML page', async () => {
    const asked: string[] = [];
    const fetcher: Fetcher = async (url) => {
      const host = new URL(url).hostname;
      asked.push(host);
      if (host === OVERPASS_HOSTS[0]) return new Response('slow down', { status: 429 });
      if (host === OVERPASS_HOSTS[1]) throw new Error('The operation was aborted due to timeout');
      return jsonResponse({ elements: [] });
    };
    expect((await handleBuildings({ boundary: box }, fetcher)).status).toBe(200);
    expect(asked).toEqual([...OVERPASS_HOSTS]);
  });

  it('when every instance is down, says so plainly and says what to do', async () => {
    const r = await handleBuildings({ boundary: box }, async () => new Response('down', { status: 521 }));
    expect(r.status).toBe(503);
    expect((r.body as { message: string }).message).toBe(OVERPASS_DOWN);
    expect(OVERPASS_DOWN).toMatch(/try again in a few minutes/);
    expect(OVERPASS_DOWN).not.toMatch(/\d{3}/);
  });

  it('stops at a 400: the query is at fault, and every instance would refuse it', async () => {
    let calls = 0;
    const r = await handleBuildings({ boundary: box }, async () => {
      calls++;
      return new Response('bad', { status: 400 });
    });
    expect(calls).toBe(1);
    expect(r.status).toBe(502);
  });

  it('pins every Overpass mirror exactly, never by suffix', () => {
    for (const h of OVERPASS_HOSTS) {
      expect(isAllowedHost(h)).toBe(true);
      expect(isAllowedHost(`${h}.example.com`)).toBe(false);
    }
  });

  it('turns an Overpass timeout into “draw a smaller one”', async () => {
    const r = await handleBuildings({ boundary: box }, async () => jsonResponse({ elements: [], remark: 'runtime error: Query timed out' }));
    expect(r.status).toBe(503);
    expect((r.body as { message: string }).message).toMatch(/smaller/);
  });
});

describe('the Worker routes the relay', () => {
  const place = async () => jsonResponse({ results: [{ name: 'Mankato', admin1: 'Minnesota', latitude: 44.16, longitude: -94 }] });

  it('answers /api/place, and refuses the wrong method', async () => {
    const ok = await handle(new Request('https://x.test/api/place?q=Mankato'), env, { fetcher: place });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { places: { label: string }[] }).places[0]!.label).toBe('Mankato, Minnesota');
    const wrong = await handle(new Request('https://x.test/api/place?q=Mankato', { method: 'POST' }), env, { fetcher: place });
    expect(wrong.status).toBe(405);
  });

  it('serves a repeated request from the edge cache without calling upstream again', async () => {
    const store = new Map<string, Response>();
    const cache: EdgeCache = {
      match: async (r) => store.get(r.url)?.clone(),
      put: async (r, res) => void store.set(r.url, res),
    };
    let calls = 0;
    const counting: Fetcher = async () => {
      calls++;
      return place();
    };
    const pending: Promise<unknown>[] = [];
    const opts = { fetcher: counting, cache, waitUntil: (p: Promise<unknown>) => void pending.push(p) };
    await handle(new Request('https://x.test/api/place?q=mankato'), env, opts);
    await Promise.all(pending);
    const second = await handle(new Request('https://x.test/api/place?q=Mankato'), env, opts);
    expect(second.status).toBe(200);
    expect(calls).toBe(1);
  });

  it('never caches a failure', async () => {
    const r = await handle(new Request('https://x.test/api/weather?lat=44&lon=-94'), env, {
      fetcher: async () => jsonResponse({}, 429),
    });
    expect(r.status).toBe(503);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('a relay that was never deployed would answer HTML: this one answers JSON 404', async () => {
    const r = await handle(new Request('https://x.test/api/nope'), env);
    expect(r.status).toBe(404);
    expect(r.headers.get('Content-Type')).toContain('application/json');
  });
});

describe('fixtures are what the relay would have produced', () => {
  it('each carries its OSM attribution and a stated boundary', () => {
    for (const key of ['mankato-downtown', 'highland-park', 'alexandria-city-hall']) {
      const f = JSON.parse(readFileSync(resolve(import.meta.dirname, `fixtures/sites/${key}.json`), 'utf8'));
      expect(f.attribution).toMatch(/OpenStreetMap/);
      expect(f.boundaryNote).toMatch(/rectangle/);
      expect(f.data.version).toBe(1);
    }
  });
});
