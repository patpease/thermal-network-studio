# Backlog

The decisions and their reasons are in `PLAN.md`. This is the checklist.

## v1, by phase

- [x] **00 Scaffold** — Vite + React 19 + TS, vitest, Worker with the three
      quiet-failure settings, CSP with no `unsafe-inline` and the OpenFreeMap
      origin, tokens and chrome from the suite, theme toggle, IP/SI, the
      placeholder mark. 32 tests. Verified in `wrangler dev` (headers on
      assets, real 404s, `no-store` on a failed asset) and in Chromium (no
      console or CSP errors, fonts load, no sideways scroll at 360 px, pinned
      light on a dark OS holds).
- [x] **Plan draft 5** — revised against EPRI 3002029431 and the Minnesota
      site suitability study (Jan 2026). Loads move from NREL shapes to a
      calibrated 1R1C (D22); DOC/LBI/density become headline metrics (D24);
      Minnesota's criteria become an information-only panel (D25). See
      `docs/references.md`.
- [ ] **01 Load model + calibration** — 1R1C per building plus DHW and
      process loads; archetype × vintage parameters fitted to ComStock/ResStock
      annual intensities by climate zone; BAU fuel mix (D21). First: confirm
      the data release, licence, and which aggregate tables to fit to.
- [ ] **02 Engine, no map** — demo neighbourhood → loads → DOC/LBI/density →
      loop sim → BAU → score, g-function drift. Pure functions in a Web
      Worker; measure the 8760 on the production build. Minnesota fixtures.
- [ ] **03 Map** — MapLibre + OpenFreeMap, polygon draw (mouse and touch),
      Overpass and weather relays (heat-balance's relay pattern), classifier,
      guessed buildings styled apart, sources and anchor tenants, site context
      panel.
- [ ] **04 Design UI** — source palette, placement, sizing, envelope retrofits.
- [ ] **05 Results** — Sankey, loop temperature over the year, monthly
      sharing, 25-year bore drift, score breakdown.
- [ ] **06 Challenges** — goal format, goal library, share links.
- [ ] **07 Education, export, phone pass, deploy.**

## Not done in 00, deliberately

- **No `docs/design-system.md` yet.** There is one screen of chrome; the
  document starts when the map gives it something to say.
- **The mark is a placeholder** (`BRAND.markIsPlaceholder`).
- **No third-party notices generator.** The only runtime dependencies are
  React and two OFL fonts, listed by hand in `THIRD-PARTY-NOTICES.md`. Add the
  generator when MapLibre arrives.
- **Unit choice is not remembered** across visits.
