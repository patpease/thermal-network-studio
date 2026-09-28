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
  OVERPASS_TIMEOUT_MS,
  parseBoundary,
  placeNames,
  siteForCounty,
  standardOffsetSeconds,
  yearFromArchive,
  FEMA_HOST,
  femaUrl,
  remarkIsBusy,
  remarkIsTooLarge,
  NSI_HOST,
  nsiUrl,
  STRUCTURES_TIMEOUT_MS,
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

const FEDERAL = new Set([FEMA_HOST, NSI_HOST]);

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
      if (FEDERAL.has(host)) return jsonResponse({ features: [] });
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
    for (const first of [
      async () => new Response('slow down', { status: 429 }),
      async (): Promise<Response> => {
        throw new Error('The operation was aborted due to timeout');
      },
      async () => new Response('<html>Service unavailable</html>', { status: 200 }),
    ]) {
      const asked: string[] = [];
      const fetcher: Fetcher = async (url) => {
        const host = new URL(url).hostname;
        if (FEDERAL.has(host)) return jsonResponse({ features: [] });
        asked.push(host);
        if (host === OVERPASS_HOSTS[0]) return first();
        return jsonResponse({ elements: [] });
      };
      expect((await handleBuildings({ boundary: box }, fetcher, () => {})).status).toBe(200);
      expect(asked).toEqual([...OVERPASS_HOSTS]);
    }
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
    const r = await handleBuildings({ boundary: box }, async (url) => {
      if (FEDERAL.has(new URL(url).hostname)) return jsonResponse({ features: [] });
      calls++;
      return new Response('bad', { status: 400 });
    });
    expect(calls).toBe(1);
    expect(r.status).toBe(502);
  });

  it('attaches FEMA and NSI structures beside OSM, each asked once, in parallel', async () => {
    const asked: string[] = [];
    const fetcher: Fetcher = async (url, init) => {
      const u = new URL(url);
      asked.push(u.hostname);
      if (u.hostname === FEMA_HOST) {
        expect(u.searchParams.get('f')).toBe('geojson');
        expect(u.searchParams.get('geometryType')).toBe('esriGeometryEnvelope');
        expect(init?.timeoutMs).toBe(STRUCTURES_TIMEOUT_MS);
        return jsonResponse({
          type: 'FeatureCollection',
          features: [
            {
              geometry: { type: 'Polygon', coordinates: [[[-93.996, 44.165], [-93.9955, 44.165], [-93.9955, 44.1655], [-93.996, 44.1655], [-93.996, 44.165]]] },
              properties: { BUILD_ID: 7, OCC_CLS: 'Residential', PRIM_OCC: 'Single Family Dwelling', HEIGHT: null, OUTBLDG: null },
            },
          ],
        });
      }
      if (u.hostname === NSI_HOST) {
        expect(u.searchParams.get('bbox')!.split(',')).toHaveLength(10);
        return jsonResponse({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-93.99575, 44.16525] }, properties: { fd_id: 9, occtype: 'RES3C', num_story: 2, sqft: 5436, resunits: 8, med_yr_blt: 1974 } }],
        });
      }
      return jsonResponse({ elements: [] });
    };
    const r = await handleBuildings({ boundary: box }, fetcher);
    const site = (r.body as { site: { structures: { fema: { id: string; occupancy: string }[]; nsi: { id: string; units: number; floorAreaM2: number }[] } } }).site;
    expect(asked.filter((h) => h === FEMA_HOST)).toHaveLength(1);
    expect(asked.filter((h) => h === NSI_HOST)).toHaveLength(1);
    expect(site.structures.fema[0]).toMatchObject({ id: 'fema:7', occupancy: 'Single Family Dwelling' });
    expect(site.structures.nsi[0]).toMatchObject({ id: 'nsi:9', units: 8, floorAreaM2: 505 });
  });

  it('a federal set that fails is null, and the site still comes back', async () => {
    const r = await handleBuildings({ boundary: box }, async (url) => {
      const host = new URL(url).hostname;
      if (host === FEMA_HOST) return new Response('down', { status: 503 });
      if (host === NSI_HOST) throw new Error('timeout');
      return jsonResponse({ elements: [] });
    });
    expect(r.status).toBe(200);
    expect((r.body as { site: { structures: unknown } }).site.structures).toEqual({ fema: null, nsi: null });
  });

  it('an ArcGIS error body (200 with { error }) counts as a failure', async () => {
    const r = await handleBuildings({ boundary: box }, async (url) =>
      new URL(url).hostname === FEMA_HOST ? jsonResponse({ error: { code: 400, message: 'Invalid query' } }) : jsonResponse({ elements: [], features: [] }),
    );
    expect((r.body as { site: { structures: { fema: unknown } } }).site.structures.fema).toBeNull();
  });

  it('a "too busy" remark is the server, not the query: it asks the next instance', async () => {
    const asked: string[] = [];
    const r = await handleBuildings(
      { boundary: box },
      async (url) => {
        const host = new URL(url).hostname;
        if (FEDERAL.has(host)) return jsonResponse({ features: [] });
        asked.push(host);
        if (host === OVERPASS_HOSTS[0]) {
          return jsonResponse({ elements: [], remark: 'runtime error: open64: 0 Success /osm3s_osm_base Dispatcher_Client::request_read_and_idx::timeout. The server is probably too busy to handle your request.' });
        }
        return jsonResponse({ elements: [] });
      },
      () => {},
    );
    expect(r.status).toBe(200);
    expect(asked).toEqual([OVERPASS_HOSTS[0], OVERPASS_HOSTS[1]]);
    expect((r.body as { attempts: { outcome: string }[] }).attempts.map((a) => a.outcome)).toEqual(['busy', 'ok']);
  });

  it('tells a busy remark from a query that is genuinely too large', () => {
    expect(remarkIsBusy('runtime error: … The server is probably too busy to handle your request.')).toBe(true);
    expect(remarkIsTooLarge('runtime error: Query timed out in "query" at line 3 after 26 seconds.')).toBe(true);
    expect(remarkIsTooLarge('runtime error: Query run out of memory using about 64 MB of RAM.')).toBe(true);
    expect(remarkIsTooLarge('runtime error: … The server is probably too busy to handle your request.')).toBe(false);
  });

  it('records what each instance did, and logs one line per load', async () => {
    const lines: string[] = [];
    const r = await handleBuildings(
      { boundary: box },
      async (url) => {
        const host = new URL(url).hostname;
        if (FEDERAL.has(host)) return jsonResponse({ features: [] });
        if (host === OVERPASS_HOSTS[0]) throw new Error('The operation was aborted due to timeout');
        return jsonResponse({ elements: [] });
      },
      (l) => lines.push(l),
    );
    const attempts = (r.body as { attempts: { host: string; outcome: string; status: number | null }[] }).attempts;
    expect(attempts.map((a) => [a.host, a.outcome, a.status])).toEqual([
      [OVERPASS_HOSTS[0], 'timeout', null],
      [OVERPASS_HOSTS[1], 'ok', 200],
    ]);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ event: 'buildings', result: 'osm' });
  });

  it('with no instance answering, FEMA footprints still make a site — flagged, and never cached', async () => {
    const lines: string[] = [];
    const r = await handleBuildings(
      { boundary: box },
      async (url) => {
        const host = new URL(url).hostname;
        if (host === FEMA_HOST) {
          return jsonResponse({
            features: [
              {
                geometry: { type: 'Polygon', coordinates: [[[-93.996, 44.165], [-93.9955, 44.165], [-93.9955, 44.1655], [-93.996, 44.1655], [-93.996, 44.165]]] },
                properties: { BUILD_ID: 7, OCC_CLS: 'Residential', PRIM_OCC: 'Single Family Dwelling' },
              },
            ],
          });
        }
        if (host === NSI_HOST) return jsonResponse({ features: [] });
        return new Response('down', { status: 521 });
      },
      (l) => lines.push(l),
    );
    expect(r.status).toBe(200);
    expect(r.cacheSeconds).toBeUndefined();
    const body = r.body as { site: { osmUnavailable?: true; features: unknown[]; structures: { fema: unknown[] } }; servedBy: string | null };
    expect(body.site.osmUnavailable).toBe(true);
    expect(body.site.features).toEqual([]);
    expect(body.site.structures.fema).toHaveLength(1);
    expect(body.servedBy).toBeNull();
    expect(JSON.parse(lines[0]!)).toMatchObject({ result: 'federal-only' });
  });

  it('with neither OSM nor FEMA, says so plainly, with what each instance did', async () => {
    const r = await handleBuildings({ boundary: box }, async () => new Response('down', { status: 503 }), () => {});
    expect(r.status).toBe(503);
    const body = r.body as { message: string; attempts: unknown[] };
    expect(body.message).toBe(OVERPASS_DOWN);
    expect(body.attempts).toHaveLength(OVERPASS_HOSTS.length);
  });

  it('pins the federal hosts exactly, never by suffix', () => {
    for (const h of [FEMA_HOST, NSI_HOST]) {
      expect(isAllowedHost(h)).toBe(true);
      expect(isAllowedHost(`${h}.example.com`)).toBe(false);
    }
    expect(new URL(femaUrl(parseBoundary({ boundary: box }) as never)).hostname).toBe(FEMA_HOST);
    expect(new URL(nsiUrl(parseBoundary({ boundary: box }) as never)).hostname).toBe(NSI_HOST);
  });

  it('asks private.coffee first, the main instance second, and no longer Kumi; waits longer than the query does', () => {
    expect([...OVERPASS_HOSTS]).toEqual(['overpass.private.coffee', 'overpass-api.de']);
    expect(isAllowedHost('overpass.kumi.systems')).toBe(false);
    expect(OVERPASS_TIMEOUT_MS).toBeGreaterThan(25_000);
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
