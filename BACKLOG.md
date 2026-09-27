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
- [x] **05 Results** — a Results tab: score breakdown (today against the
      network, electricity by use), the loop's heat as a balanced Sankey,
      loop temperature through the year against its band, monthly heat
      shared between buildings, and the 25-year drift against the fluid
      limits. Hand-drawn SVG at the width shown, hover on every chart,
      hidden tables, validated chart palette in both themes. Fixed a lost
      fly-to when a place is picked before the map loads. 176 tests.
      Verified in Chromium: desk light and dark, phone width, no console
      errors.
- [x] **06 Challenges** — goals as data; four challenges (Half the carbon,
      Ground in balance, Waste not, Off the air) with a live checklist in the
      Design tab; every challenge fails a bore field that does not fit the
      open space (D35). The award (D34): a bold medal graphic with four new
      icons in Psychrometric Studio's style, downloaded as a 1080 × 1350 PNG
      with its fonts embedded; place names from the Census (town, state) and
      OSM (neighbourhood), editable; the post text editable before copying;
      LinkedIn's composer opened with it. Share links carry the boundary,
      the player's building changes, the design and the challenge;
      `?challenge=` opens a challenge. Verified in Chromium in fixture mode
      and on the production build in `wrangler dev` against live services:
      no CSP refusals.
- [x] **07 Education, export, phone pass, deploy prep** — a Learn tab of
      short statements of fact with references (D37), including where a
      network does not suit a site; facts about the drawn site, and one
      beside each challenge; "Save as PNG" on every results chart, drawn at
      desk width in the light theme with the scope line, sources, host and
      month printed on it; the phone tab bar with Map as a screen of its own
      (D38); deploy checks extended to nine. The wording of phases 03–06
      rewritten to the same rule, and `tests/wording.test.ts` holds every
      string in `copy.ts` and every challenge to it. Verified in Chromium in
      fixture mode and on the production build in `wrangler dev` against
      live services: no CSP refusals.

## Phases 08–10 (from the BDC/HEET/VCTN review)

- [x] **08 Loop and sizing** — default loop 40–90 °F (HEET); a "Needs
      glycol" flag whenever the loop goes below 40 °F, this year or in the
      25-year projection, linking to the Learn fact; balancing plant sized at
      80% of the worst hour (HEET); nearby sources within a quarter mile
      (VCTN); a supermarket outside the boundary counted as 25 homes of heat;
      Learn notes on the street loop and what the tool does not see.
- [x] **09 Scale** — network size (the larger of peak heating and peak
      cooling, in tons; MW in SI) against HEET's 300-ton economies-of-scale
      point, on the Site tab, the Design tab's balancing card, Site features
      and the Learn tab. Below it: how many more buildings like these would
      reach it, and an Edit boundary button.
- [x] **10 Grid impact** — the network's winter electric peak against the
      same buildings on building-level electrification (air-source heat pumps,
      BLE): a Results chart (winter peak, summer peak, the year; today as a
      rule), a Design tab stat, Learn facts, and the "Easy on the grid"
      challenge (winter peak ≥ 25% below BLE, ≤ 100 backup hours).
- [x] **12 More building data** — FEMA USA Structures fills footprints OSM
      lacks; USACE NSI fills use, storeys, unit counts and a block-median
      year. Fetched beside Overpass, attached to the site (and so to a saved
      file), flagged by source, attributed on the panel and every export.
      Verified through `preview:worker`: 1 OSM feature, 92 FEMA, 81 NSI on
      the Mankato block.
- [ ] **A guided example, from a header button** — as Psychrometric
      Studio's walkthrough does (`web/src/education/walkthrough.ts`,
      `ui/WalkthroughPanel.tsx`): a "Take the tour" action in the header opens
      a pre-loaded neighbourhood (a committed fixture, so it needs no
      network) and steps through every feature in the order a real study
      goes. Each step declares the complete state it wants (site, selection,
      design, challenge, tab), so going back restores it exactly; some steps
      ask a question whose answers each teach something; each links to its
      Learn facts. It snapshots the player's own work on entry and puts it
      back on exit, and on a phone it docks over the map as a card. Steps to
      cover: drawing and editing a boundary; buildings, guesses and federal
      data; site facts and scale; the suggestion; balancing (the Design
      tab's numbers); the loop band and glycol; bore field fit and the
      25-year drift; the reversible air-source heat pump; results and the
      Sankey; grid impact against BLE; a challenge and its award; save,
      open and share. Key lessons: not every site suits a network; loads
      cancelling is the point; the cold snap sets the winter peak; the
      ground must balance over years.
- [x] **Existing networks nearby** — 137 running networks from NREL's
      geothermal district heating and cooling data (CC BY 4.0), drawn as
      hollow rings on the map, listed within 25 miles on the Site tab (else
      the nearest anywhere), cited in full on Learn with IDEA's map linked.
      No prospective projects. More sources: a CSV in `data/networks/` and
      `npm run import:networks` (see its README).
- [x] **Validate against ORNL AutoBEM** — `npm run validate:autobem`, a
      back-end check outside the app and `npm test`; report in
      `docs/validation/autobem.md`. ANNUAL heating and cooling demand, not
      hourly: no AutoBEM release carries hourly profiles. First run (Arizona,
      527 archetypes, TMY3): heating −9%, cooling +8% overall, but 57% and
      48% type by type with nothing cancelling; the tool is within 2% of its
      NLR calibration there, so most of the gap is NLR against AutoBEM.
- [ ] **Hourly shape** — still unchecked. Needs a public hourly reference
      (AutoBEM's Chattanooga EPB work is not published hourly).
- [x] **11 Save and open** — a project file, as Psychrometric Studio has:
      Save file, Open file and Copy a link in one card on the Site and
      Design tabs; Ctrl/⌘+S; the building and weather snapshot opens with no
      network call; Re-read OpenStreetMap refreshes it. Not built: the
      localStorage rescue (item 5 below).
- **v2: building readiness** (steam heat, electrical panels) — deferred.

## Phase 11 plan: save and open a project file

What a player gets: **Save** downloads `<place>.thermal-network.json`;
**Open** reads one back and lands on the same neighbourhood, buildings,
design and challenge, ready to adjust. Nothing is uploaded; the file is the
only copy. Modelled on Psychrometric Studio's project file (its
`shared/schema/project.schema.json`, versioned with `MIGRATIONS`).

1. **Format** (`src/io/project.ts`, `schema/project.schema.json`):
   `{ format: "thermal-network-studio", version: 1, saved, place: {
   neighbourhood, town, state } (with the player's edits), boundary,
   selection: { excluded, overrides }, design: { sources, band, retrofit },
   challenge, units }`. Canonical SI throughout (rule 1); units is only the
   display the player left it in. The share link's body is the same data —
   one serialiser feeds both, so they cannot drift.
2. **The buildings: a snapshot, re-read on open.** The file keeps the
   normalised site the player saw (footprints, archetypes, levels, found
   sources). On open the tool shows the snapshot at once — no network call —
   and offers "Re-read OpenStreetMap" to refresh it, carrying overrides and
   design across by building id as Edit boundary does. A file still opens
   when Overpass is down, and a later OSM edit cannot quietly change a saved
   study.
3. **Refuse, never half-read**: a future version, a wrong `format`, or a
   malformed field is refused with one sentence; `MIGRATIONS` upgrades an
   older version. A schema test enforces the file against the JSON Schema.
4. **UI**: Save and Open in the header beside Share, and Open on the empty
   map. Opening over unsaved work asks first. Keyboard: Ctrl/⌘+S saves.
5. **Rescue** (from Psychrometric Studio's `rescue.ts`, optional): keep the
   last state in `localStorage` so a crash or a closed tab can be restored
   once. Its cleanup must not clear what the crash screen needs.
6. **Tests**: a round trip (save → open → same result to the watt), a v0 →
   v1 migration fixture, refusal cases, overrides that name a building
   missing after a re-read.

Built with the snapshot and a re-read button (about 350 KB for a Highland
Park block; the weather year is most of it).

Found in 08, fixed after 11:

- [x] **The drift chart's year 1 was the projection's** (daily means). The
      drift is now anchored to the simulated year (`anchorDrift`), so the
      chart, the glycol flag and "Ground in balance" all read the same year 1.

## After 07

- [x] Distances in IP (ft) as well as SI; a test holds the context panel to it.
- [x] The product mark: option C, "Under the ground" — two buildings on the
      ground line joined by a loop below grade. One source (`brand/mark.ts`)
      for the header, favicons and award.
- [x] Balancing card on the Design tab: annual take/give/net and the worst
      hour's net heat to add and remove against the plant connected.
- [x] The Minnesota study cited in the README only; the Site panel shows
      only what the tool finds.
- [x] Edit a drawn boundary: press and drag a corner (mouse or touch), Done
      re-reads the site and keeps the design; also works while drawing.

## Not done in 07, deliberately

- **MapLibre 6** (D33).
- **Drag to move a placed source.** Placing and moving are by tap. Boundary
  corners drag; the same handler could serve sources.
- **Adding or removing a corner while editing.** Corners move; their number
  is fixed until redrawn.
- **Per-chart hashtags, link previews, a report.** An exported chart and the
  award are the two things this tool hands out.

## Not done in 06, deliberately

- **Hashtags per challenge.** Two fixed tags; the player can edit the text.
- **The award is a PNG, not a link preview.** A LinkedIn link-preview card
  would need the Worker to render images and a URL that encodes the award.
- **Fixtures name no neighbourhood.** They were captured before the Overpass
  query asked for `place` nodes; re-capture them through `wrangler dev`.
- **Share links are not shortened.** About 1.3–1.5 k characters for a
  realistic design — under the 2,000 that breaks in mail clients.
- ~~**The award link is a placeholder**~~ — done: `AWARD_LINK_BASE` is
  `https://thermalnetwork.peasestudio.com` since 27 Sep 2026.

## Not done in 05, deliberately

- **Hourly detail.** The loop chart is daily (min, mean, max); an hour-level
  zoom on a chosen week is a later lever.
- **Keyboard focus on chart marks.** Hover shows a tooltip; the same values
  are reachable through each chart's hidden table, but marks take no focus.
- **Texture for print and forced colours.** Identity never rests on colour
  alone (labels, legends, tables), but no hatch fill exists yet.
- **Export.** PNG export of each chart, with the scope line burned in, is
  phase 07.

## Not done in 04, deliberately

- **Tower dispatch policy** ("run the tower to balance the ground") is still
  not a lever; the tower only runs when the bore field cannot hold the band.
- **Bore spacing is fixed at the default** in the UI; depth and count are
  editable. The engine takes spacing already.
- **Per-building retrofits.** One factor for every connected building; the
  engine already carries a factor per building.
- **Dragging a placed source.** Move is tap-to-place; drag waits for the
  phone pass.
- **The design is not kept.** A new boundary starts an empty design (no
  storage in v1; share links are phase 06).

## Not done in 03, deliberately

- **Microsoft US building footprints** where OSM has none. Residential
  blocks in Mankato return one building. A second footprint source would
  need its own relay and its own attribution.
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
- **No third-party notices generator.** The only runtime dependencies are
  React and two OFL fonts, listed by hand in `THIRD-PARTY-NOTICES.md`. Add the
  generator when MapLibre arrives.
- **Unit choice is not remembered** across visits.
