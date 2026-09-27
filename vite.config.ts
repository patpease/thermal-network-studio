import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

import { handleBuildings, handlePlace, handleSite, handleWeather, isAllowedHost, PATHS, siteForCounty } from './src/relay/relay';
import type { Fetcher, RelayResult } from './src/relay/relay';
import { centroid, pointInRing } from './src/site/geometry';
import type { Ring } from './src/site/geometry';

/**
 * The same relay, on the dev server: an adapter over src/relay/relay.ts, as
 * worker/handler.ts is. Not a second implementation.
 *
 * FIXTURE MODE (`TNS_FIXTURES=1 npm run dev`) answers from the committed test
 * fixtures instead of the network: the three Minnesota sites from
 * tests/fixtures/sites with their federal structures from
 * tests/fixtures/structures, and the calibration weather year for their zone. For
 * working offline, and for anywhere Overpass or Open-Meteo cannot be reached.
 * It exists only here, in development; the Worker has no such mode.
 */
function relay(): Plugin {
  const pinned: Fetcher = async (url, init) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) throw new Error(`Refusing to fetch ${target.hostname}`);
    return fetch(target.toString(), {
      method: init?.method ?? 'GET',
      ...(init?.body !== undefined ? { body: init.body } : {}),
      ...(init?.timeoutMs !== undefined ? { signal: AbortSignal.timeout(init.timeoutMs) } : {}),
      headers: { Accept: 'application/json', 'User-Agent': 'thermal-network-studio (dev)', ...(init?.headers ?? {}) },
    });
  };
  const fixtures = process.env['TNS_FIXTURES'] === '1';

  return {
    name: 'thermal-network-relay',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        let body = '';
        if (req.method === 'POST') for await (const chunk of req) body += chunk;

        let result: RelayResult;
        if (fixtures) result = fixtureAnswer(url, body);
        else if (url.pathname === PATHS.place) result = await handlePlace(url.searchParams, pinned);
        else if (url.pathname === PATHS.site) result = await handleSite(url.searchParams, pinned);
        else if (url.pathname === PATHS.weather) result = await handleWeather(url.searchParams, pinned);
        else if (url.pathname === PATHS.buildings && req.method === 'POST') result = await handleBuildings(safeJson(body), pinned);
        else result = { status: 404, body: { message: 'Not found.' } };

        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(result.body));
      });
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ----------------------------------------------------------- fixture mode

const FIXTURE_SITES = [
  { key: 'mankato-downtown', label: 'Downtown Mankato, Minnesota (fixture)', county: '27013', town: 'Mankato' },
  { key: 'highland-park', label: 'Highland Park, St. Paul, Minnesota (fixture)', county: '27123', town: 'St. Paul' },
  { key: 'alexandria-city-hall', label: 'Alexandria, Minnesota (fixture)', county: '27041', town: 'Alexandria' },
];

function loadFixture(key: string) {
  return JSON.parse(readFileSync(resolve(__dirname, `tests/fixtures/sites/${key}.json`), 'utf8')) as {
    data: { boundary: Ring; features: unknown[]; skipped: number; version: 1 };
  };
}

function fixtureAnswer(url: URL, body: string): RelayResult {
  const p = url.searchParams;
  if (url.pathname === PATHS.place) {
    const places = FIXTURE_SITES.map((s) => {
      const [lon, lat] = centroid(loadFixture(s.key).data.boundary);
      return { label: s.label, latitude: lat, longitude: lon };
    });
    return { status: 200, body: { places, attribution: 'Fixture mode' } };
  }
  const at: [number, number] = [Number(p.get('lon')), Number(p.get('lat'))];
  const nearest = (point: [number, number]) =>
    FIXTURE_SITES.find((s) => pointInRing(point, loadFixture(s.key).data.boundary)) ?? FIXTURE_SITES[0]!;
  if (url.pathname === PATHS.site) {
    const f = nearest(at);
    return { status: 200, body: { ...siteForCounty(f.county), town: f.town, state: 'MN' } };
  }
  if (url.pathname === PATHS.weather) {
    const site = siteForCounty(nearest(at).county)!;
    const zones = JSON.parse(gunzipSync(readFileSync(resolve(__dirname, 'data/calibration/weather.json.gz'))).toString('utf8')).zones;
    const z = zones[site.zone];
    return {
      status: 200,
      body: {
        year: 2018,
        timezone: 'fixture',
        temperature: z.temperatureTenthsC.map((t: number) => t / 10),
        relativeHumidity: z.relativeHumidityPct,
        ghi: z.ghiWm2,
        firstWeekday: 0,
        attribution: `Fixture: NLR AMY2018, ${z.place}`,
      },
    };
  }
  if (url.pathname === PATHS.buildings) {
    const boundary = (safeJson(body) as { boundary?: Ring })?.boundary ?? [];
    const site = boundary.length ? nearest(centroid(boundary) as [number, number]) : FIXTURE_SITES[0]!;
    const data = loadFixture(site.key).data;
    const federal = JSON.parse(readFileSync(resolve(__dirname, `tests/fixtures/structures/${site.key}.json`), 'utf8')) as { structures: unknown };
    return {
      status: 200,
      body: { site: { ...data, boundary, structures: federal.structures }, attribution: '© OpenStreetMap contributors, ODbL; FEMA USA Structures, NSI (fixture)' },
    };
  }
  return { status: 404, body: { message: 'Not found.' } };
}

export default defineConfig({
  plugins: [react(), relay()],
  // 5186/4186. The siblings hold 5183–5185 and 4183–4185, and `strictPort`
  // turns a collision into a refusal to start rather than a silent hop.
  server: { port: 5186, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
