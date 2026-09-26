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
- [x] **01 Load model + calibration** — 1R1C per building (`src/loads/`)
      with DHW and refrigeration; 15 archetypes × 15 climate zones fitted to
      ComStock 2025 R3 component loads and ResStock 2025 R1 delivered loads
      (163,751 + 549,971 models), 225/225 exact to 2% or 1 kWh/m². Vintage
      envelope factors (D23) and BAU fuel mix and efficiency (D21) generated
      alongside. 74 tests. A unit simulation is 0.23 ms in Node.
- [x] **02 Engine, no map** — `src/engine/`: demand and site metrics (DOC,
      LBI, density, Minnesota bands), business as usual from the stock's own
      fuel mix, the ambient loop with fixed dispatch, a finite-line-source
      bore field with a 25-year drift projection, Cambium LRMER carbon, the
      score, a demo quarter, and the Web Worker with a latest-wins client.
      105 tests. Verified in Chromium on a production build behind the real
      Worker and CSP: demo scores 68, 59 ms per run in the worker, ~300 ms on
      the first run while the g-function is tabulated.
- [x] **03 Map** — MapLibre + OpenFreeMap with a token-built style in both
      themes; polygon draw by mouse and touch; the relay (place, site,
      weather, buildings) with exact host pinning and edge caching; the OSM
      classifier with guessed flags; sources, anchors, barriers, open space;
      the information-only context panel; building selection and override;
      the engine run on every change. Minnesota fixtures from OSM (D28):
      Highland Park comes out more residential and more heating-dominated
      than downtown Mankato, as the report says. 146 tests. Verified in
      Chromium in fixture mode, and on the production build through
      `wrangler dev` against LIVE Open-Meteo, Census and Overpass — no CSP
      violations.
- [x] **04 Design UI** — a Design tab beside Site: connect found sources,
      add bore fields, air-source heat pumps, towers, sewer, lake/river and
      waste heat; size them in display units; place and move them on the
      map (bore field at its true footprint); loop band; envelope retrofit
      on the network case only; a suggested starting design; live score,
      energy and carbon reductions, system COP, unmet hours, heat shared, and
      the 25-year drift shown but not scored. Mankato's suggestion scores 69
      (80 with a deep retrofit). 164 tests. Verified in Chromium, fixture
      mode, desk light/dark and phone width.
- [ ] **05 Results** — Sankey, loop temperature over the year, monthly
      sharing, 25-year bore drift, score breakdown.
- [ ] **06 Challenges** — goal format, goal library, share links.
- [ ] **07 Education, export, phone pass, deploy.**

## Not done in 04, deliberately

- **Tower dispatch policy** ("run the tower to balance the ground") is still
  not a lever; the tower only runs when the bore field cannot hold the band.
- **Bore spacing is fixed at the default** in the UI; depth and count are
  editable. The engine takes spacing already.
- **Per-building retrofits.** One factor for every connected building; the
  engine already carries a factor per building.
- **Dragging a placed source.** Move is tap-to-place; drag waits for the
  phone pass.
- **Results charts** — phase 05. The summary is numbers only.
- **The design is not kept.** A new boundary starts an empty design (no
  storage in v1; share links are phase 06).

## Not done in 03, deliberately

- **Microsoft US building footprints** where OSM has none. Residential
  blocks in Mankato return one building. A second footprint source would
  need its own relay and its own attribution.
- **Phone layout is stacked, not tabbed.** Map, then panel, scrolling. The
  sibling tools' tab bar is the phase 07 phone pass.
- **Levels cannot be overridden** in the UI yet — archetype and inclusion
  can. `BuildingOverride` already carries `levels`.
- **Minnesota fixtures cover three sites.** The report's data centres
  (Mankato, Alexandria, St. Cloud) are not tagged in OSM; the fixtures record
  what OSM has, and the tests check only that.
- **MapLibre 6** (D33).

## Not done in 02, deliberately

- **Minnesota fixtures (D28)** need each site's buildings — phase 03.
- **Laboratories (D19)** deferred by decision.
- **The score ignores drift (D31)** — decided: drift is information, not score.
- **No thermal mass in the loop itself.** Without a bore field the loop sits
  at a band edge; with one, the ground is the only storage (D15).
- **Tower dispatch is last-resort.** It runs only once the bore field has
  reached the band's upper limit, which is why the demo's ground warms. A
  "run the tower to balance the ground" policy is a design lever for phase 04.
- **One g-function geometry per network.** Several bore fields add their
  boreholes into one field with the first's spacing and depth.
- **Business as usual uses the stock's annual average efficiency every
  hour**, which flattens the seasonal swing of heat pumps and chillers.
- **Wet bulb from Stull (2011)** off dry bulb and RH; Open-Meteo supplies RH,
  so the phase 03 weather path must carry it or towers read dry bulb.

## Not done in 01, deliberately

- **Laboratory (D19) is not an archetype yet.** ComStock has no lab type, and
  ZEEL's intensities are energy by end use, not loads. Needs a decision on how
  to turn ZEEL's fuel into a load before it can be calibrated. Phase 02.
- **Data centres are not an archetype.** They are a source with a load of
  their own, and belong with the sources in phase 02/04.
- **Weekend schedules** use the weekday overnight value (office, school,
  outpatient, warehouse) or repeat the weekday (everything else). PNNL
  publishes Saturday and Sunday profiles; import them with the same script
  Heat Balance Studio uses.
- **DHW is the same every day of the year.** Mains temperature swings DHW
  load ±10–15% seasonally, and in the direction that worsens winter
  imbalance. Worth adding when the engine can show it.
- **Hourly shape is unvalidated.** Annual totals are fitted; peaks and daily
  shape are the model's own. ComStock/ResStock publish hourly aggregates by
  type and state — compare peak-hour and monthly shape against those.
- **One county per zone.** The fit weather is one representative county per
  zone, not the stock's own spread of counties.

## Not done in 00, deliberately

- **No `docs/design-system.md` yet.** There is one screen of chrome; the
  document starts when the map gives it something to say.
- **The mark is a placeholder** (`BRAND.markIsPlaceholder`).
- **No third-party notices generator.** The only runtime dependencies are
  React and two OFL fonts, listed by hand in `THIRD-PARTY-NOTICES.md`. Add the
  generator when MapLibre arrives.
- **Unit choice is not remembered** across visits.
