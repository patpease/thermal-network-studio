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
- [x] **A guided example, from a header button** — "Take the tour": 13
      steps through downtown Mankato (a generated project file in
      `public/tour/`, no network), from the drawn site to Half the carbon
      and its award. Each step declares its tab, design and challenge;
      questions on four steps; Learn links; the player's work is saved on
      entry and restored on exit. `tests/tour.test.ts` checks every claim
      against the design the step shows.
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
- [x] **Peak check against rules of thumb** — the selected building card
      shows its peak hour of space heating and cooling per floor area
      against 400 ft²/ton and 30 Btu/h·ft² (`engine/ruleOfThumb.ts`). Peak,
      not annual; no hot water or refrigeration; as built. Never scored.
      Two charts below it draw the peak heating day and the peak cooling day
      hour by hour against the rule (`charts/PeakDay.tsx`).
- [ ] **Rules of thumb per building type** — the owner will supply them;
      v1 uses one pair for every type.
- [ ] **Morning start-up spike (found by the peak check)** — the 1R1C model
      recovers the night setback in ONE hour with unlimited capacity. In 5A a
      small office peaks at 105 Btu/h·ft² at 06:00 against about 20–33 the
      rest of that day, and pulls down to 150 ft²/ton on a summer morning
      against about 450. Every scheduled commercial type shows it; homes and
      hospitals (no deep setback) do not. Annual energy is unaffected, but
      the peaks feed the network size in tons, balancing plant sizing, the
      winter electric peak and the tour's claims. Candidate fix: spread the
      recovery over two to three hours (optimal start), or cap heating and
      cooling at a design-day capacity; then re-fit, rebuild the tour and
      re-pin the grid figures. Owner to decide.
- [x] **11 Save and open** — a project file, as Psychrometric Studio has:
      Save file, Open file and Copy a link in one card on the Site and
      Design tabs; Ctrl/⌘+S; the building and weather snapshot opens with no
      network call; Re-read OpenStreetMap refreshes it. Not built: the
      localStorage rescue (item 5 below).
- **v2: building readiness** (steam heat, electrical panels) — deferred.

## Phases 13–17 (data expansion) — planned, not started

Detail, sources, hosting and open questions for each: "Phases 13–17 plan"
below. Numbered after 12; 11 and 12 ran out of order.

- [x] **13 Anchor loads and more heat sources** (M, done 7 October 2026) —
      EPA CWNS 2022: 15,908 built treatment plants with a point and a design
      flow, in 56 state files under `public/data/cwns/` (`npm run
      import:cwns -- <zip>`), fetched only for the states a site's box
      touches; a plant within 150 m of OSM's enriches it, else it is a
      candidate of its own; heat = design flow × 3 K (1 MGD ≈ 0.55 MW).
      FEMA then NSI occupancy sets anchors where OSM names none (never over
      an OSM tag); federal "industrial" is listed as a possible process
      load, not modelled. **IM3 data centres dropped**: the atlas is derived
      from OpenStreetMap with the same data-centre tags the tool already
      queries live (footprint × 250 W/m²), and its files sit behind an
      MSD-LIVE login. **CWNS flows are DESIGN flows**, not measured; the
      tool says so.
- [x] **14 District steam connections** (S, done 7 October 2026) — the
      relay's `/api/steam` reads NYC LL84 (NYC Open Data) for a site's box,
      in New York City only; each property's latest year with district steam
      above zero flags the building it sits on, or the nearest heated one
      within 20 m of at least half LL84's floor threshold (LL84 points are
      address points on the frontage: 4–17 m off across Midtown). An orange
      outline on the map, a note on the building card, a Site features row.
      Never a load or the score. Midtown check: 18 buildings, none left
      unmatched. Measured vs modelled stays **on hold**.
- [ ] **FEMA occupancy in Manhattan (found in phase 14)** — FEMA USA
      Structures calls 102 Midtown buildings "Industrial — Light"; where OSM
      has no use tag (Bank of America Tower among them) they become
      warehouses, and Site features lists them as possible process loads.
      One tower also reads 114 storeys. Decide whether FEMA's industrial
      class should stand in dense downtowns, or yield to NSI or size.
- [x] **18 Grid nearby: substations** (S–M, approved and built 8 October
      2026) — after a boundary is drawn, never as a browse layer
      (users do not pick a site by its substation). OSM `power=substation`
      within 1 mile, read in the same Overpass request; transmission and
      distribution both shown and labelled (`substation=*`, else by voltage
      class, said so). Map: outline or marker with name and kV. Site tab
      "Grid nearby" card: nearest substations with distance, voltage, type,
      operator; the network's winter electric peak beside building-level
      electrification's; a link to the DOE atlas of utility hosting-capacity
      maps. A Site features row; Learn facts on substation types, hosting
      capacity and OSM coverage. No capacity figures (none are public in
      open data); no per-state utility link list (owner may split that out
      later). Never a load or the score. Checked live: Midtown Manhattan
      lists 12 within a mile (Con Edison, with kV where tagged, and subway
      traction substations); downtown Mankato has none mapped. When OSM
      does not answer the card says substations are unknown, never "none".
- [ ] **15 Existing district and thermal systems, partial** (M) — extend the
      existing-networks layer: ORNL Onsite Energy installations (terms
      permitting), OSM district heating plants, NYC steam users from 14.
      Labelled "Partial — no complete open US inventory exists".
- [ ] **16 EU and UK layers** (L) — **backlog, not scheduled** (owner, 30
      September 2026). Region detection; Hotmaps heat and floor area density
      as an overlay; DESNZ operational heat networks only, in the
      existing-networks importer. Ideally it also brings European weather
      and carbon modelling so the score runs there; low priority for now.
      Stretch: EUBUCCO, Peta/sEEnergies.
- [ ] **17 Learn tab reference links** (S) — link, don't ingest: Upgrade NY,
      NLR 2025 U.S. Geothermal Market Report, EIA 2018 district energy
      study, DOE district-scale geothermal pilots; BDC and IDEA already
      cited. Optional links by map region; citations for every 13–16 dataset.

Cross-cutting (before or with 13):

- [x] **One licence and attribution register** (done 7 October 2026:
      `src/config/sources.ts`, shown under "Data sources" in Learn's
      references card; Site panel, chart exports and the award read their
      lines from it; `tests/sources.test.ts`). Was: each dataset's licence,
      attribution text and share-alike duty, generated into the Learn tab and
      a footer link, with a test that every data source the app loads is in it.
- [ ] **A refresh schedule per source** — annual, quarterly, four-yearly or
      static, with the command that refreshes each.
- [x] **Data-vintage labels** (done with the register: every entry has a
      release, and every attribution line prints it) — every layer and card that shows a dataset
      says which release it is ("Hotmaps — static, 2015 base year").

## Phases 13–17 plan

Planning only (30 September 2026). Each phase extends a pattern the tool
already has; none adds a parallel system:

- **Live, through the relay** (`src/relay/relay.ts`): exact host pinning,
  a cache key with `RELAY_VERSION`, one attempt log per call, a failure that
  leaves the site usable. Results ride on `SiteData`, so a saved project file
  keeps them (FEMA and NSI do this today).
- **Generated, committed data** (`npm run import:*`): a source file, a
  generator that refuses to write what it cannot cite, a committed module or
  CSV, a drift test. Existing networks (`data/networks/`, D47) is the model
  for any point dataset.
- **Static files in `public/`**, fetched only when needed (the tour file).
- **Map overlays** live inside the MapLibre style as GeoJSON sources
  (`MapView.withOverlays`); a new layer is a source plus layers there.
- **Learn** holds every citation (`REFERENCES` in `education/learn.ts`);
  organisations are named only there (D37 and `tests/wording.test.ts`);
  data-licence attribution lines may appear on panels and exports.

### Hosting constraints (Cloudflare Workers, checked 30 September 2026)

| Limit | Free | Paid | Bearing on these phases |
|---|---|---|---|
| Worker script | 64 MiB uncompressed | same | Keep datasets out of the JS bundle; the app bundle is ~6.5 MB with source maps today |
| Static asset file | 25 MiB each; 20,000 files | 25 MiB; 100,000 files | Large rasters must be tiled or clipped; per-state or per-region files are fine |
| Subrequests per request | 50 | 10,000 | A site load already makes Overpass (1–2) + FEMA + NSI + weather + Census calls; adding LL84/DC/CWNS live calls must stay well under 50 |
| CPU per request | 10 ms | 30 s default | No raster processing in the Worker; filter pre-built data only |
| Memory | 128 MB | 128 MB | Same |
| Storage | no KV/R2 in use (docs/deploying.md) | | R2 for tiles would be a new infrastructure decision (open question, phase 16) |

Rule of thumb used below: under ~2 MB and national → one static file; per
state or region → one static file each; queryable by area with a public API
→ live through the relay; rasters → pre-built tiles, never served raw.

---

### Phase 13 — Anchor loads and more heat sources (M)

**Goal.** Know which buildings are anchor loads where OSM is silent, and find
two heat sources OSM under-reports: wastewater plants (with their flow) and
data centres (with their floor area). Both feed the existing source list,
suggestion and site facts.

**Already done (phase 12):** FEMA USA Structures is fetched live and its
occupancy already sets a building's use where OSM names none (`femaArchetype`).

**Data sources**

| Dataset | URL | Licence | Cadence | Hosting |
|---|---|---|---|---|
| FEMA / ORNL USA Structures (occupancy, primary occupancy) | https://gis-fema.hub.arcgis.com/pages/usa-structures | CC BY 4.0 | annual | live via relay (already) |
| EPA Clean Watersheds Needs Survey 2022 (facility location, existing/design flow, treatment level) | https://www.epa.gov/cwns — data download: https://sdwis.epa.gov/ords/sfdw_pub/r/sfdw/cwns_pub/data-download | US Government work, public domain | 4-yearly (2027 in preparation) | generated per-state static JSON |
| PNNL IM3 Open Source Data Center Atlas (point / building / campus, floor area ft²) | https://im3.pnnl.gov/datacenter-atlas — DOI 10.57931/3017294 | ODbL 1.0 (derived from OSM) | irregular releases | generated national static JSON (a few thousand points) |

**Tasks**

- *Pipeline.* `npm run import:cwns` reads the national CSV zip (facilities,
  locations, flow tables per the CWNS data dictionary), keeps treatment
  plants with a point and an existing flow, and writes
  `public/data/cwns/<ST>.json` (id, name, point, existing flow MGD,
  treatment level). `npm run import:datacentres` reads the IM3 GeoPackage
  or CSV and writes `public/data/datacentres.json` (id, name, operator,
  point, floor area). Both refuse rows with no point, print notes, and have
  drift tests, as `import:networks` does.
- *Site load.* The client fetches the state file(s) the boundary's quarter-
  mile search box touches (same origin; no CSP change) and hands them to
  `classifySite`, which already turns OSM `man_made=wastewater_plant` and
  `telecom=data_center` into candidates. A CWNS or IM3 record within 150 m of
  an OSM candidate enriches it (flow, floor area, name); one with no OSM
  match becomes a candidate of its own, flagged by source.
- *Model hooks.* Wastewater capacity from flow: 1 MGD ≈ 43.8 kg/s; at a
  3 K recoverable ΔT that is ≈ 0.55 MW of heat — replacing the flat
  2 MW default when a flow is known, and stated as an estimate the player can
  change. Data centres keep `DATA_CENTRE_W_PER_M2` (250 W/m², today's OSM
  proxy) applied to IM3's floor area.
- *Anchors.* FEMA primary occupancy (hospital, schools, colleges, government,
  emergency response) sets `SiteBuilding.anchor` where OSM gives none; an
  industrial occupancy is recorded as a possible process load, shown in Site
  features, not modelled (no exhaust model; the Heat Balance Studio lesson).
- *UI.* No new layer: the found-source markers and "Heat sources nearby" list
  gain a source line ("Flow from EPA CWNS 2022"). Anchor buildings get a
  marker in Site features.
- *Learn and attribution.* REFERENCES entries for CWNS and IM3; the IM3
  attribution line ("Data centres: PNNL IM3 Data Center Atlas, © OpenStreetMap
  contributors, ODbL") on the sources card and exports; the register (below).

**Acceptance criteria**

- A Mankato or Highland Park fixture site within a quarter mile of a CWNS
  plant shows it with a flow-based capacity; a test pins 1 MGD → 0.55 MW.
- An IM3 data centre with no OSM tag appears as a candidate with its floor
  area; one that OSM also has appears once, enriched, never twice.
- FEMA-flagged anchors appear on fixture sites where OSM tags none; a test
  holds that an OSM anchor tag is never overridden.
- No new third-party origin in the CSP; `tests/worker.test.ts` unchanged.

**Risks and open questions**

- CWNS points can be the facility address or "the area associated with the
  needs"; some are not the plant. Keep only treatment-plant facility types
  and flag `placement` as the existing-networks importer does.
- CWNS is four-yearly; flows are as reported for 2022.
- IM3 is ODbL: the derived file must stay ODbL and be attributed as such
  (the tool already carries OSM's ODbL duties).
- Recoverable ΔT (3 K) is a stated assumption; published ranges run 2–5 K.

**Depends on:** the licence register (cross-cutting). None of 14–17.

---

### Phase 14 — District steam connections (S)

**Goal.** Show which buildings in a study area are on district steam today,
so the player sees how they are heated and what a network connection would
replace. Thermal demand only: the tool's scope is heating, cooling and hot
water, and the flag is about how a building connects, not how much it uses.

**Data sources**

| Dataset | URL | Licence | Cadence | Hosting |
|---|---|---|---|---|
| NYC LL84 benchmarking, CY2024 (`district_steam_use_kbtu`, lat/long, BBL/BIN, property type) | https://data.cityofnewyork.us/Environment/NYC-Building-Energy-and-Water-Data-Disclosure-for-/5zyy-y8am (Socrata API) | NYC Open Data terms of use (free reuse, attribution requested) — confirm | annual | live via relay: SoQL `within_circle`, only the fields above, cached 30 days |

**Tasks**

- *Relay.* One handler (host pinned, `RELAY_VERSION` in the key) returning
  `{ id, at, propertyType, steam: boolean }` for records with
  `district_steam_use_kbtu > 0`. Results ride on `SiteData.steam`, so a
  saved file keeps them. Failure is `null`, never an error, as FEMA.
- *Matching.* A record joins the building whose footprint contains its point
  (OSM or FEMA); unmatched records are counted, not forced.
- *UI.* A steam marker on matched buildings, "on district steam" on the
  building card, and a count in Site features. A note that LL84 covers large
  buildings only (≥ 25,000 ft²).
- *Model hooks.* None. The flag never changes loads or the score.
- *Learn and attribution.* LL84 in REFERENCES and the register; the panel
  attribution names the dataset.

**Acceptance criteria**

- On a Manhattan test boundary steam buildings are flagged from a recorded
  fixture; outside NYC no request is made and nothing is shown.
- The score and loads are identical with and without the flag (a test).

**Risks and open questions**

- LL84 rows are self-reported; a building can be missed or mislabelled.
- One more live call per NYC site load (free-plan subrequest limit 50).

**On hold: measured vs modelled.** Comparing reported energy (LL84, DC
Building Energy Performance, DOE BPD peers) with the modelled loads waits
until the owner settles a comparison basis. The benchmarking adapter
registry is deferred with it. Reported data is site energy, including
lighting and plug loads, and the model is thermal demand; the two do not
compare directly.

**Depends on:** the licence register. Phase 15 uses the steam flag.

---

### Phase 15 — Existing district and thermal systems, partial (M)

**Goal.** Extend the existing-networks layer from geothermal systems to the
district and campus plants that already run near a study area — anchors,
possible interconnects or competitors — and say plainly that the inventory
is partial.

**Data sources**

| Dataset | URL | Licence | Cadence | Hosting |
|---|---|---|---|---|
| DOE / ORNL Onsite Energy Installation Database (CHP, geothermal, thermal storage; ≥ 1 MW at large users; downloadable spreadsheet) | https://onsite-energy-installations.ornl.gov | **No stated terms found** — confirm with ORNL/ICF before redistributing | quarterly | a CSV in `data/networks/` if permitted; otherwise links/counts only |
| OSM district heating (`plant:output:heat=*`, `power=plant`, `man_made=works` with `heat`, `pipeline=substance:heat`, `district_heating=*`) | https://www.openstreetmap.org | ODbL | live | extend the Overpass query already made |
| NYC district steam buildings | phase 14 | as phase 14 | annual | from phase 14 |
| NREL GDR 1282 (geothermal networks) | already imported (D47) | CC BY 4.0 | not maintained | already done |

**Tasks**

- *Pipeline.* If ORNL's terms allow: a one-off converter writing
  `data/networks/ornl-onsite.csv` in the shared columns with a new `kind`
  (`chp`, `thermal-storage`, `district-energy`) and `sources.json` entry;
  `npm run import:networks` as today. If not: a Learn link and, per state, a
  count typed from the published totals, labelled as such.
- *OSM.* Add the district-heating tags to the Overpass query (within the
  quarter-mile box already fetched); classify them as existing systems, not
  connectable sources.
- *Steam.* Buildings flagged in phase 14 draw a steam marker in NYC.
- *UI.* The existing hollow-ring layer and "Existing networks nearby" card,
  renamed "Existing systems nearby — partial", with a tooltip naming what is
  in it and what is missing. Kinds get distinct ring styles (ink, dashed,
  double) — never heat/cool colours, which mean physics.
- *Learn.* A fact that no complete open US inventory exists, with the sources
  in it and IDEA's 2015 map as the further link (already cited).

**Acceptance criteria**

- The layer and card say "Partial" wherever shown; a test holds the label.
- ORNL rows appear only if a recorded permission is in `sources.json`.
- OSM district-heating features within the search box appear on fixture
  sites that have them, and never as connectable sources.

**Risks and open questions**

- ORNL terms (above) decide half of this phase.
- OSM tagging of heat plants is sparse and inconsistent in the US.
- "Competitor" framing: the tool states facts; the card lists systems and
  distances, and says nothing about competition.

**Depends on:** 14 (steam flag), the register. The existing-networks importer.

---

### Phase 16 — EU and UK layers (L) — backlog, not scheduled

**Goal.** Let a player looking at a European or UK site see heat density and
the heat networks operating there, with the right layers chosen by where the
map is. Ideally it later brings European weather and carbon modelling so the
score runs outside the US; the owner rates that low priority for now.

**Data sources**

| Dataset | URL | Licence | Cadence | Hosting |
|---|---|---|---|---|
| Hotmaps heat density (total, residential, non-residential) and gross floor area density, 100 m, EU28 | https://wiki.hotmaps.eu (GitLab repositories) | CC BY 4.0 | static (base year ~2015) | pre-built tiles (see risks); never raw GeoTIFF |
| UK DESNZ Heat Networks Planning Database (status inception → decommissioning; OS grid coordinates) | https://www.data.gov.uk/dataset/065d267f-23bc-4d0e-9a56-52d388d5835c/desnz-heat-networks-planning-database | Open Government Licence v3.0 | quarterly | a CSV in `data/networks/` via a converter (BNG → WGS 84); operational rows only |
| Stretch: EUBUCCO (building age, height) | https://eubucco.com | mostly ODbL, some sources CC BY — per-country check | versioned | per-country static files if adopted |
| Stretch: Peta / sEEnergies excess heat | https://s-eenergies.eu | to confirm | static | as for Hotmaps |

**Tasks**

- *Region detection.* A small committed table of simplified region polygons
  (US, UK, EU27+EFTA) and `regionOf(point)`; the relay and client pick
  layers and the unit default by region. Outside the US the Census, FEMA,
  NSI, Cambium and ComStock/ResStock paths are skipped, and the panel says so.
- *Hotmaps.* A pipeline that clips each country's 100 m rasters, builds
  raster (or quantised vector) tiles to a fixed zoom range, and publishes
  them in files under 25 MiB each; the map adds them as a raster source
  with a legend in GWh/km²·yr (the unit EPRI's density bands already use),
  so the same density guidance applies.
- *UK networks.* Extend the networks importer with region-aware bounds in
  place of "inside the United States". The converter keeps **operational
  networks only**; planned, in-construction and decommissioned rows are
  dropped and counted, as D47 requires. No `status` column.
- *Model hooks.* None by default: the load model and score are calibrated to
  the US stock. Hotmaps density feeds the Site features density row as an
  alternative source, flagged.
- *Learn and attribution.* Hotmaps citation (the wiki's form), DESNZ OGL
  attribution ("Contains public sector information licensed under the Open
  Government Licence v3.0"), region notes.

**Acceptance criteria**

- Panning to Copenhagen shows the Hotmaps overlay and no US-only cards;
  panning to Manchester also shows DESNZ networks; panning to Boston
  changes nothing from today.
- No tile file over 25 MiB; total tile files within the static-asset limit,
  or on R2 if that is decided.
- Every overlay shows its vintage label.

**Risks and open questions**

- **Scope (decided 30 September 2026):** map layers first; European weather
  and carbon modelling ideally follow as a separate, larger phase. Both stay
  on the backlog.
- **Tile hosting:** EU-wide 100 m tiles may exceed the static-asset file
  count; R2 (new infrastructure) or a zoom cap may be needed.
- Hotmaps base year is old; say so on the legend.
- EUBUCCO and Peta licences vary by source; stretch only after checking.

**Depends on:** the register, vintage labels. The networks importer (UK).

---

### Phase 17 — Learn tab reference links (S)

**Goal.** Point players to the best external maps and reports on thermal
networks without ingesting data whose licences do not allow it, and cite
every dataset phases 13–16 add.

**Links (no data ingested)**

| Resource | URL | Licence / note |
|---|---|---|
| BDC Neighborhood-Scale Projects Map | https://buildingdecarb.org/neighborhood-scale-projects-map | © All rights reserved — link only (BDC is already a cited reference) |
| IDEA District Energy System Maps | https://www.districtenergy.org/resources/resources/system-maps | no licence; 2015 data — already linked (D47) |
| Upgrade NY (NY utility TEN pilots) | https://www.upgradeny.org | link only |
| NLR 2025 U.S. Geothermal Market Report | URL to confirm on nlr.gov | link only |
| EIA U.S. District Energy Services Market Characterization (2018) | https://www.eia.gov/analysis/studies/buildings/districtservices | US Government, public domain — link and cite |
| DOE District-Scale Geothermal Pilots (GDR) | https://gdr.openei.org/commGeo | link only; these are planned projects, so not drawn (D47) |

**Tasks**

- A "Further reading" section in `education/learn.ts` with these as
  REFERENCES and one fact each, held to the wording rules.
- Optional: region-aware lines on Learn only (Upgrade NY when the site is in
  New York; DESNZ when in the UK) — the organisations-only-on-Learn rule
  still holds.
- The data-sources section lists every dataset from 13–16 with full
  citation, licence and vintage, generated from the register.

**Acceptance criteria**

- Every link resolves (a checked list in the PR); no data from a
  link-only source is in the repo; `tests/wording.test.ts` passes with the
  new names only on Learn.

**Risks and open questions**

- Link rot: a yearly link check in the refresh schedule.
- The NLR report's canonical URL needs confirming.

**Depends on:** 13–16 for their citations (can ship first with the links alone).

---

### Cross-cutting

- **Licence and attribution register.** `data/sources/register.json` (or a
  typed module): dataset, publisher, URL, licence, attribution text,
  share-alike (ODbL: OpenStreetMap, IM3; EUBUCCO and Overture if ever
  adopted), where it appears, vintage, refresh cadence. The Learn data-sources
  section, the footer's "Data sources" link and every panel attribution line
  read from it; a test fails if a relay host or generated dataset has no
  entry. Do first, with 13.
- **Refresh schedule.** In the register: FEMA USA Structures annual (live);
  NSI irregular (live); OSM live; Open-Meteo live; ComStock/ResStock per
  release (`calibrate:extract`); Cambium annual (`carbon:extract`); CWNS
  four-yearly; IM3 per release; LL84 annual (live);
  ORNL Onsite quarterly; DESNZ quarterly; Hotmaps static; NREL GDR not
  maintained.
- **Vintage labels.** Each layer legend, source card and export line names the
  release ("CWNS 2022", "LL84 CY2024", "Hotmaps — static, 2015 base year").

### Decisions and open questions

Decided 30 September 2026:

- International scope (16): stays on the backlog. Ideally it includes
  European weather and carbon modelling; low priority.
- UK networks (16): operational only. Planned systems are not shown (D47).
- Measured vs modelled (14): on hold until a comparison basis is found.
  Phase 14 is the district-steam connection flag alone, thermal demand only.

Still open:

1. Tile hosting (16): accept R2 as new infrastructure, or cap zoom to stay
   within static assets?
2. ORNL Onsite terms (15): contact ORNL/ICF before building, or plan the
   links-only fallback from the start?

Order: 13 → 14 → 15 → 17. 16 waits on the backlog.

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
