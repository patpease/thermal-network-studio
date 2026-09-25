import { describe, expect, it } from 'vitest';

import { handle, HEADERS, TILE_ORIGIN } from '../worker/handler';
import type { Env } from '../worker/handler';

/**
 * The three deploy failures the siblings shipped, asserted rather than
 * remembered. `preview:worker` is still the only place the real runtime is
 * true; this catches the logic before it gets there.
 */

const assets = (status: number, body = 'x', headers: Record<string, string> = {}): Env => ({
  ASSETS: { fetch: async () => new Response(body, { status, headers }) },
});

const get = (path: string) => new Request(`https://example.test${path}`);

describe('the Worker', () => {
  it('puts the security headers on assets, not only on the 404', async () => {
    const response = await handle(get('/'), assets(200, '<html>'));
    expect(response.status).toBe(200);
    for (const [key, value] of Object.entries(HEADERS)) {
      expect(response.headers.get(key)).toBe(value);
    }
  });

  it('answers an unknown /api/ path with a real 404, not the shell', async () => {
    const response = await handle(get('/api/nothing'), assets(200, '<html>'));
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('never lets a failed asset inherit the immutable cache rule', async () => {
    const env = assets(404, 'missing', { 'Cache-Control': 'public, max-age=31536000, immutable' });
    const response = await handle(get('/assets/index-abc123.js'), env);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps the asset cache rule on success', async () => {
    const env = assets(200, 'js', { 'Cache-Control': 'public, max-age=31536000, immutable' });
    const response = await handle(get('/assets/index-abc123.js'), env);
    expect(response.headers.get('Cache-Control')).toContain('immutable');
  });
});

describe('the content security policy', () => {
  const csp = HEADERS['Content-Security-Policy']!;
  const directive = (name: string) =>
    csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

  it('never allows unsafe-inline or unsafe-eval', () => {
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('allows the tile origin where MapLibre needs it, and nowhere else', () => {
    expect(directive('connect-src')).toContain(TILE_ORIGIN);
    expect(directive('img-src')).toContain(TILE_ORIGIN);
    expect(directive('script-src')).not.toContain(TILE_ORIGIN);
    expect(directive('style-src')).not.toContain(TILE_ORIGIN);
  });

  it('names exactly the third-party origins the plan allows', () => {
    const origins = new Set(csp.match(/https:\/\/[a-z0-9.-]+/g));
    expect([...origins].sort()).toEqual([
      'https://cloudflareinsights.com',
      'https://static.cloudflareinsights.com',
      TILE_ORIGIN,
    ]);
  });

  it('lets workers start from blob: URLs, which MapLibre needs', () => {
    expect(directive('worker-src')).toContain('blob:');
  });
});
