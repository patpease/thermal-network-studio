/**
 * Everything the Worker decides, as a plain function a test can call.
 *
 * `index.ts` is the adapter Cloudflare loads; this is the judgement. Split so
 * the three behaviours that have each broken a sibling's deploy are asserted in
 * the suite rather than remembered: every response carries the security
 * headers, an unknown `/api/*` path is a real 404, and a failed asset is never
 * cached.
 */

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/**
 * The OpenFreeMap origin. The map's vector tiles, glyphs and sprites all load
 * from here, directly and not through a relay (D17): relaying every tile would
 * cost a Worker request per tile for no privacy gain, since tile coordinates
 * reveal no more than the Overpass query the relay will already make.
 */
export const TILE_ORIGIN = 'https://tiles.openfreemap.org';

/**
 * The policy.
 *
 * Third-party origins, and the only ones: OpenFreeMap for the basemap, and
 * Cloudflare's Web Analytics beacon, which Cloudflare injects into the response
 * itself. Blocking the beacon did not disable analytics on a sibling — it made
 * analytics silently report nothing while logging a CSP error on every page.
 *
 * `style-src` has NO 'unsafe-inline'. React writes the style prop through the
 * CSSOM, which CSP does not govern, so inline style props hold; a literal
 * style="…" in emitted markup would be blocked.
 *
 * `worker-src blob:` is for MapLibre, which starts its tile workers from a blob
 * URL, and for the simulation worker from phase 02.
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
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...HEADERS,
      'Cache-Control': 'no-store',
    },
  });
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // No routes yet; the Overpass and weather relays arrive in phase 03. Until
  // then every /api/* path must 404 rather than fall through to the shell.
  if (url.pathname.startsWith('/api/')) return json({ message: 'Not found.' }, 404);

  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(HEADERS)) headers.set(key, value);

  // A FAILURE MUST NEVER INHERIT THE IMMUTABLE CACHE RULE. public/_headers
  // matches on the path, not the outcome, so a 404 under /assets/ would be
  // stamped "immutable" for a year — and a browser that loads the page in the
  // window between a new index.html and the new bundle reaching its edge shows
  // a blank page from then on. It took Heat Balance Studio down once.
  if (!response.ok) headers.set('Cache-Control', 'no-store');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
