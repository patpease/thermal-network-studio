# Deploying

A Cloudflare **Worker** serving the built site as static assets, plus the relay
under `/api/*`. No database, no KV, no secrets, no environment variables:
nothing is kept, so there is nothing to configure beyond the Worker itself.

Target: **`https://thermal-network-studio.patpease0.workers.dev`** — the
Worker's `name` in `wrangler.jsonc` on the `patpease0` workers.dev subdomain
the sibling tools use. `BRAND.host` in `src/config/branding.ts` says the same
thing; they move together.

## Workers, not Pages

They are different products, and the difference has broken two sibling
deploys. A Pages-style `functions/` directory is ignored under Workers, and the
wrong `not_found_handling` answers `200` with the app shell for every unknown
path — including a relay route that was never deployed.

## Option A — Workers Builds from GitHub (how the siblings deploy)

In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**
→ `patpease/thermal-network-studio`.

| Setting | Value |
|---|---|
| Project name | `thermal-network-studio` (must match `name` in `wrangler.jsonc`) |
| Production branch | `main` |
| Root directory | *(blank — the repository root; `package.json` is there)* |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Environment variables | none |

**The root directory is the setting that has bitten a sibling.** Psychrometric
Studio keeps its app in `web/`; this repository does not. Leave it blank.

Workers Builds runs `npm ci` itself from the lockfile, on Node 22 (set
`NODE_VERSION=22` under build variables only if the build log shows an older
Node).

## Option B — from a terminal

```bash
npx wrangler login        # once, opens the browser
npm run deploy            # typecheck + build + wrangler deploy
```

## The three settings that fail quietly

All in `wrangler.jsonc`, each commented there:

- **`main: "worker/index.ts"`** — without a script every request is served
  from assets and `/api/*` answers `200 text/html`.
- **`run_worker_first: true`** — without it an asset never reaches the script
  and the security headers appear only on the 404.
- **`not_found_handling: "none"`** — no client-side router here; the SPA
  setting would turn every typo, and every missing bundle, into a `200`.

## What the Worker reaches

Exact hosts, pinned in `src/relay/relay.ts` (a suffix match would make the
relay an open proxy):

| Host | For | Limits to know |
|---|---|---|
| `overpass-api.de`, then `overpass.private.coffee`, then `overpass.kumi.systems` | buildings | Public, volunteer-run. The relay tries them in order when one is down, busy (429), failing (5xx, incl. Cloudflare's 521) or slower than 20 s; the answer's `servedBy` names which one replied. Sends a User-Agent; caches a boundary for 7 days |
| `archive-api.open-meteo.com` | a year of weather | 10,000 calls/day free; cached 30 days per ~1 km |
| `geocoding-api.open-meteo.com` | place search | cached 30 days |
| `geocoding.geo.census.gov` | point → county | cached a year |

The browser itself talks only to this Worker and to `tiles.openfreemap.org`
(the basemap, D17). Those, plus Cloudflare's analytics beacon, are the only
origins in the CSP.

## Before the first deploy

```bash
npm ci
npm run typecheck && npm test && npm run build
npx wrangler deploy --dry-run --outdir .wrangler/dry-run   # bundles the Worker
npm run preview:worker    # the real runtime, on :8790
```

In `preview:worker`, check by hand — none of this is covered by the suite:

- `/` returns `200` with `Content-Security-Policy`, `Strict-Transport-Security`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- `/api/nope` returns a JSON `404`, not the shell
- `/assets/nope.js` returns `404` with `Cache-Control: no-store`
- the console is clean of "Refused to …" CSP errors with the map loaded
- search a place, draw a boundary, and the panel fills — this is the only
  end-to-end check of Overpass, Open-Meteo and the Census geocoder together
- the Census lookup fills the town and state on the award card
- `POST /api/buildings` answers, and its `servedBy` is one of the three Overpass hosts (the mirrors could not be reached from the build sandbox; check them here)
- a chart's "Save as PNG" and the award's download both save a styled PNG
  with **no** "Refused to apply inline style" in the console. Both work only
  because they avoid `style` attributes (presentation attributes on the
  chart clone; a `<style>` element inside the award SVG). The dev server has
  no CSP and cannot show this failure.
- a share link opened in a new tab restores the boundary, design and
  challenge
- at 390 px wide: the tab bar reads Map · Site · Design · Results · Learn,
  drawing works by tap, and the page does not scroll sideways

All nine were checked on the production build in `wrangler dev` on
26 Sep 2026, against the live services.

## After the first deploy

Repeat the nine checks against `https://thermal-network-studio.patpease0.workers.dev`,
then:

- **Hard-refresh twice** after any later deploy and look for a blank page.
  Heat Balance Studio lost a deploy to a 404 cached as immutable; the Worker
  now sends `no-store` on every non-2xx, and this is how to see that it does.
- If the map is blank but the panel works, open the console: a CSP "Refused
  to connect" names the origin to add — and the change belongs in
  `worker/handler.ts` with a test in `tests/worker.test.ts`, never only in
  the dashboard.

## When the tool has its own address

Every award and LinkedIn post carries `AWARD_LINK_BASE`
(`src/config/branding.ts`), which is `https://` + `BRAND.host`. Change the
host in the same commit as the route (D18), and awards follow.

## A custom domain, later

When `peasestudio.com` serves: add
`"routes": [{ "pattern": "thermalnetwork.peasestudio.com", "custom_domain": true }]`
to `wrangler.jsonc` and change `BRAND.host` in the same commit (D18).
