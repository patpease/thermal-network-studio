/**
 * Everything the Worker decides, as a plain function a test can call.
 *
 * `index.ts` is the adapter Cloudflare loads; this is the judgement. The
 * relay's logic lives in `src/relay/relay.ts`; this file routes to it, holds
 * the ONE function in this runtime that can reach the network (pinned to an
 * exact host list), puts the security headers on everything, and caches
 * successes at the edge.
 */
import {
  buildingsCacheKey,
  handleBuildings,
  handlePlace,
  handleSite,
  handleSteam,
  handleWeather,
  isAllowedHost,
  isRelayResult,
  parseBoundary,
  PATHS,
  RELAY_VERSION,
  steamCacheKey,
  weatherCacheKey,
  weatherYear,
} from '../src/relay/relay';
import type { Fetcher, RelayResult } from '../src/relay/relay';

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/** The Workers edge cache, when there is one (not in tests). */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/**
 * The OpenFreeMap origin. The map's vector tiles, glyphs and sprites all load
 * from here, directly and not through a relay (D17).
 */
export const TILE_ORIGIN = 'https://tiles.openfreemap.org';

/**
 * The policy. Third-party origins, and the only ones: OpenFreeMap for the
 * basemap, and Cloudflare's Web Analytics beacon, which Cloudflare injects
 * into the response itself. Every data service is reached through /api/*, so
 * none of them is in connect-src.
 *
 * `style-src` has NO 'unsafe-inline'. React and MapLibre set styles through
 * the CSSOM, which CSP does not govern; a literal style="…" would be blocked.
 * `worker-src blob:` is for MapLibre's tile workers.
 */
export const HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://static.cloudflareinsights.com",
    "style-src 'self'",
    `img-src 'self' data: blob: ${TILE_ORIGIN}`,
    "font-src 'self'",
    `connect-src 'self' ${TILE_ORIGIN} https://cloudflareinsights.com`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
  // HTTPS only, for a year, as ZEEL sends it. workers.dev is HTTPS-only
  // already; this keeps it so when a custom domain arrives.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};

/** Overpass asks every client to identify itself. */
const USER_AGENT = 'thermal-network-studio (https://github.com/patpease/thermal-network-studio)';

/** The only code in this runtime that can reach the network. */
export const pinnedFetch: Fetcher = async (url, init) => {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !isAllowedHost(target.hostname)) {
    throw new Error(`Refusing to fetch ${target.hostname}`);
  }
  return fetch(target.toString(), {
    method: init?.method ?? 'GET',
    ...(init?.body !== undefined ? { body: init.body } : {}),
    ...(init?.timeoutMs !== undefined ? { signal: AbortSignal.timeout(init.timeoutMs) } : {}),
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...(init?.headers ?? {}) },
  });
};

function json(result: RelayResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...HEADERS,
      'Cache-Control': result.status === 200 && result.cacheSeconds ? `public, max-age=${Math.min(result.cacheSeconds, 86400)}` : 'no-store',
    },
  });
}

async function cached(cache: EdgeCache | null, key: string | null, run: () => Promise<RelayResult>, waitUntil: (p: Promise<unknown>) => void) {
  const request = key ? new Request(`https://cache.invalid/${encodeURIComponent(key)}`) : null;
  if (cache && request) {
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  const result = await run();
  const response = json(result);
  if (cache && request && result.status === 200 && result.cacheSeconds) {
    // The edge keeps it for the relay's own period, not the browser's.
    const stored = response.clone();
    const headers = new Headers(stored.headers);
    headers.set('Cache-Control', `public, max-age=${result.cacheSeconds}`);
    waitUntil(cache.put(request, new Response(stored.body, { status: 200, headers })));
  }
  return response;
}

export async function handle(
  request: Request,
  env: Env,
  options: { fetcher?: Fetcher; cache?: EdgeCache | null; waitUntil?: (p: Promise<unknown>) => void } = {},
): Promise<Response> {
  const url = new URL(request.url);
  const fetcher = options.fetcher ?? pinnedFetch;
  const cache = options.cache ?? null;
  const waitUntil = options.waitUntil ?? (() => {});

  if (url.pathname.startsWith('/api/')) {
    const p = url.searchParams;
    switch (url.pathname) {
      case PATHS.place:
        if (request.method !== 'GET') return json({ status: 405, body: { message: 'Use GET.' } });
        return cached(cache, `place|${RELAY_VERSION}|${(p.get('q') ?? '').trim().toLowerCase()}`, () => handlePlace(p, fetcher), waitUntil);
      case PATHS.site:
        if (request.method !== 'GET') return json({ status: 405, body: { message: 'Use GET.' } });
        // Four decimals (~11 m): county lines are finer than the weather's 1 km.
        return cached(
          cache,
          `site|${RELAY_VERSION}|${Number(p.get('lat')).toFixed(4)}|${Number(p.get('lon')).toFixed(4)}`,
          () => handleSite(p, fetcher),
          waitUntil,
        );
      case PATHS.weather: {
        if (request.method !== 'GET') return json({ status: 405, body: { message: 'Use GET.' } });
        const lat = Number(p.get('lat'));
        const lon = Number(p.get('lon'));
        const key = Number.isFinite(lat) && Number.isFinite(lon) ? weatherCacheKey(lat, lon, weatherYear()) : null;
        return cached(cache, key, () => handleWeather(p, fetcher), waitUntil);
      }
      case PATHS.buildings: {
        if (request.method !== 'POST') return json({ status: 405, body: { message: 'Use POST.' } });
        const text = await request.text();
        if (text.length > 20_000) return json({ status: 413, body: { message: 'That boundary is too detailed.' } });
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return json({ status: 400, body: { message: 'Send JSON: { "boundary": [[lon, lat], …] }.' } });
        }
        const boundary = parseBoundary(body);
        const key = isRelayResult(boundary) ? null : buildingsCacheKey(boundary);
        return cached(cache, key, () => handleBuildings(body, fetcher), waitUntil);
      }
      case PATHS.steam:
        if (request.method !== 'GET') return json({ status: 405, body: { message: 'Use GET.' } });
        return cached(cache, steamCacheKey(p), () => handleSteam(p, fetcher), waitUntil);
      default:
        // Any other /api/* path must 404 rather than fall through to the shell.
        return json({ status: 404, body: { message: 'Not found.' } });
    }
  }

  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(HEADERS)) headers.set(key, value);

  // A FAILURE MUST NEVER INHERIT THE IMMUTABLE CACHE RULE. public/_headers
  // matches on the path, not the outcome, so a 404 under /assets/ would be
  // stamped "immutable" for a year. It took Heat Balance Studio down once.
  if (!response.ok) headers.set('Cache-Control', 'no-store');

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
