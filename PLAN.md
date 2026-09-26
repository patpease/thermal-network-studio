# Thermal Network Studio — plan (draft 7)

Repo: `patpease/thermal-network-studio`.
Status: **phase 00 done; next is 01.** Progress lives in `BACKLOG.md`.

## The pitch

Pick a neighbourhood on a real map. The game reads the buildings from
OpenStreetMap, gives each one an hourly heating and cooling load, and sums them
into the network's demand. The player then builds an ambient-loop thermal
network from bore fields, air-source heat pumps, cooling towers and waste heat
from data centres and sewers, and the game runs a year against it. The score
is how much more efficient and lower-carbon the network is than business as
usual.

Revised in draft 5 against two reports — EPRI's load-mapping method and
Minnesota's site suitability study. What each changed is in
**Revisions from the reports** below; the sources are in `docs/references.md`.

The audience runs from engineers to citizens, so the same simulation has to
read two ways: a clear story on top, and the numbers one click down.

**The framing is ZEEL's:** the game conveys an idea and does not predict a
saving. It is not for feasibility studies or utility filings. The scope line
sits on the page and is burned into every export.

## Decisions

| # | Decision | What follows from it |
|---|---|---|
| D1 | **Ambient loop (5GDHC)** with a heat pump in every building | Loop temperature is the state. Heating and cooling rejection cancel out on the loop, and that sharing is the thing the game teaches. |
| D2 | **US first** | ComStock/ResStock calibration targets, ASHRAE climate zones, NREL Cambium grid carbon |
| D3 | **Sandbox + challenges** | Free play on any map, with scenario goals on the same engine |
| D4 | **Score = efficiency + carbon** | Cost is shown but not scored |
| D5 | ~~NREL EULP shapes, precomputed~~ **Superseded by D22.** | |
| D6 | **Hourly 8760 in a Web Worker** | Budget: a sub-second re-run |
| D7 | **One UI, progressive depth** | Story first, then numbers, then assumptions |
| D8 | **Sources are found in OSM or placed by the player** | Overpass also pulls data centres, wastewater plants and similar. The player can add hypothetical sources. |
| D9 | **Score against business as usual** | Baseline defined in D21 |
| D10 | **Bore field drift via g-function** | One detailed year, then a 20–25 year projection of borehole wall temperature |
| D11 | **Draw a polygon, then add/remove buildings** | Capped at about 500 buildings |
| D12 | **No pipes modelled** | Buildings connect to the loop by rule. Distribution losses and pumping are a flat factor, stated openly. |
| D13 | **MapLibre GL + OpenFreeMap** vector tiles | No API key. Styled from suite tokens in both themes. ODbL attribution on the map and on every export. |
| D14 | **Full phone support** | Polygon drawing and source placement must work by touch, following the sibling tools' phone rules |
| D15 | **No thermal storage in v1** | The bore field is the only storage (seasonal) |
| D16 | **Challenges are generic goals on any map** | e.g. "Beat BAU carbon by 60% without a cooling tower". A goal is data: constraints + thresholds on engine outputs. |
| D17 | **CSP allows the OpenFreeMap origin explicitly** | The only third-party origins: OpenFreeMap + the Cloudflare beacon |
| D18 | **workers.dev for now** | `BRAND.host` follows whenever a domain is chosen |
| D19 | ~~Labs added as archetype 16~~ **Deferred** (decided in phase 02). ZEEL publishes energy, not load; revisit with the map, when real campuses appear. | |
| D20 | **Score = 50% efficiency + 50% carbon** | Efficiency = % less site energy than business as usual; carbon = % less CO₂. Each clamped 0–100 for the score, unclamped value always shown. (Phase 02.) |
| D21 | **Baseline = regional existing stock** | BAU heating fuel mix and cooling from ComStock/ResStock per climate zone and archetype. Aggregates only — no hourly shapes — baked in by the D22 calibration generator. |
| D22 | **Loads: hybrid 1R1C, per building, in the browser** (EPRI). *Built in phase 01: calibrated to ComStock 2025 R3 component loads and ResStock 2025 R1 delivered loads; two multipliers (loss, free gain) per archetype × zone.* | Space heating and cooling from a one-resistance, one-capacitance model per building, driven by the site's hourly weather — the method in EPRI 3002029431. **Plus** DHW and process loads (refrigeration, IT, ice) on schedules, which EPRI left out and warned about. Archetype parameters (U-values, mass, ventilation, gains, setpoints by vintage) are **calibrated** so each archetype's annual heating, cooling and DHW land on ComStock/ResStock per climate zone. Extends Heat Balance Studio's UA-and-gains engine rather than starting over. |
| D23 | **Envelope and vintage are player levers**. *Four vintage bands (pre-1950, 1950–79, 1980–99, 2000+), not EPRI's five: ComStock's bins straddle EPRI's boundaries.* | Because D22 is physical, a retrofit changes the load. Vintage comes from OSM `start_date` where tagged, else the archetype default, **flagged as guessed** like everything else inferred. |
| D24 | **Headline network metrics: DOC, LBI, density** (EPRI) | Demand overlap coefficient, load balance index, and thermal demand density, shown as soon as a neighbourhood is picked and before anything is built. They explain *why* a site shares heat well. Density is shown against EPRI's 50–150 GWh/km²·yr range; LBI against Minnesota's heating-dominance bands (≤80 %, 80–90 %, >90 %). Reference marks, not pass/fail. |
| D25 | **Site context panel: information only** (Minnesota) | Minnesota's eight criteria are listed with what the tool can actually know — load balance, load density, opportunistic resources, open space for a bore field, dividing barriers (highways, rivers), anchor tenants. **Anything it cannot know is left blank, never guessed**: bedrock, grid capacity, existing HVAC, ownership, environmental justice status, contamination. No weights, no 0–100 total, and it never touches the score (D4 and D20 stand). |
| D26 | **More sources, found in OSM** (Minnesota) | Adds lakes and rivers (surface water), ice rinks, supermarkets, breweries, food and industrial processing, alongside data centres, wastewater plants and sewers. |
| D27 | **Anchor tenants marked on the map** (Minnesota) | City hall, library, school, hospital, community centre, place of worship. Information, not score — Minnesota found them to be what makes a project happen. |
| D28 | **Minnesota's 16 sites: validation only** (moved to phase 03: the fixtures need each site's real buildings, which only the map can supply) | Not shipped as challenges (D16 stands). Used as test fixtures for what D24–D25 compute — e.g. a site Minnesota rated as >90 % heating-dominant must not come out balanced. Only indicators we can compute are compared; Minnesota's weighted total is not reproduced. |

| D29 | **Grid carbon: Cambium 2023 long-run marginal CO₂**, Mid-case, levelized 2025–2044 at 3% — the workbook's defaults | Month × hour × 18 GEA regions; county → region map generated alongside. Fuels at EPA factors, combustion CO₂ only on both sides. |
| D30 | **Dispatch order**: waste heat and water exchangers → bore field (to the loop band) → air-source heat pump / cooling tower → electric backup, counted as unmet | The order is the design the player is making. Default band 2–30 °C. |
| D31 | **Score is year 1; the 25-year drift is shown, never scored** (decided after phase 03) | A design can score well while its ground overheats; the drift chart and the fluid limits say so. Challenges (D16) may still demand balance. |
| D32 | **County decides zone and grid** (phase 03) | The relay turns a point into a county (Census geocoder), and the county into the ASHRAE zone the calibration used (NLR's own tract table) and the Cambium region. Both tables stay server-side. |
| D33 | **MapLibre GL 5.x** (phase 03) | 6.x exists; staying on 5 until phase 07, where the upgrade is a backlog item. |
| D34 | **An award for a met challenge, made to post on LinkedIn** (phase 06) | A 1080 × 1350 portrait medal graphic: the challenge's own icon (new, in Psychrometric Studio's line style) on a medal hung from a heat-and-cool ribbon, the challenge on a banner, the place (neighbourhood, town, state — editable), the carbon and energy reductions, the neighbourhood outline, the month, the link and the scope line. Challenges only; sandbox play earns none. Posting is download + copy + open LinkedIn's composer: LinkedIn will pre-fill text but not attach an image, and nothing is uploaded. The post text is shown in an editable box before copying. The link is a placeholder constant (`AWARD_LINK_BASE`) pointing at the live workers.dev route until the tool has its own address. |
| D35 | **A bore field must fit the site's open space for any challenge** (phase 06) | Not a warning, a failed goal, on every challenge whenever the design has a bore field: an award for boreholes under buildings would be a fiction. Open space is OSM parks, pitches and surface parking at a 6 m grid — an undercount, stated. On downtown Mankato it leaves Off the air unwinnable; Alexandria, with room, wins it. |
| D37 | **Help is statements of fact with references** (phase 07) | The Learn tab and the site facts state what is true and cite the source — EPRI, Minnesota, NLR, Cambium, EPA, OSM, or "this tool" for a modelling choice. No reasoning prose. Applies to every sentence the tool says: `tests/learn.test.ts` and `tests/wording.test.ts` reject "because", "so that", "which is why", "deliberately" and first person in the Learn content, in every string in `copy.ts`, and in every challenge's brief and idea. Includes that not every location suits a network, with figures, and facts about the drawn site beside each challenge. |
| D38 | **Phone: one screen at a time** (phase 07) | Below 860 px a tab bar at the foot: Map · Site · Design · Results · Learn. Drawing and placing switch to the map, which carries its own Finish/Undo/Cancel; finishing returns to the panel. |
| D36 | **Four challenges** (phase 06) | Half the carbon; Ground in balance (the drift may be demanded here though never scored, D31); Waste not (15% of the loop's heat from waste heat or water, with a 100-hour backup cap so a data centre plus backup cannot earn it); Off the air. Every challenge caps backup hours. |

## Carried over from the sibling tools (copied, not a shared package)

| From | What |
|---|---|
| all three | Vite + React 19 + TS, vitest, Cloudflare **Worker** (not Pages), the three wrangler settings that fail quietly, CSP with no `unsafe-inline`, `strictPort` dev ports |
| heat-balance-studio | Relay pattern: one `relay.ts` with all the logic, thin adapters in the Worker and in the Vite dev server, an edge cache keyed on rounded coords + `DERIVATION_VERSION`, exact host pinning. Reused for **Overpass** and **Open-Meteo**. |
| heat-balance-studio | Open-Meteo archive with the UTC timezone fix, EPW upload, geocoder that shows alternatives. Now drives the 1R1C model for a full year, not only a design day. |
| heat-balance-studio | UA, internal gains and schedules (`engine/ua.ts`, `gains.ts`, PNNL-derived schedules) — the starting point for D22 |
| psychrometric-studio | Chrome, tokens, IP/SI at the edge, export rules (ADR 0004) |
| zeel | Sankey layout, palette validation, notes vs warnings, the "conveys an idea" framing |

## Pipeline

```
1 Neighbourhood  draw polygon -> Overpass relay -> footprints, levels, tags,
                 candidate sources -> player adds/removes buildings
2 Loads          classify archetype (tags -> landuse -> footprint heuristic ->
                 player override) + vintage -> box geometry from footprint and
                 levels -> calibrated 1R1C + DHW + process -> heating, cooling
                 8760 per building, driven by the site's weather year
  Read the site  DOC, LBI, density; site context panel (information only)
3 Design         place and size: bore field, ASHP, cooling tower, surface
                 water, sewer/wastewater HX, waste heat (data centre, rink,
                 supermarket, brewery, process); retrofit envelopes
4 Simulate       hourly: net building load on the loop (building HP COP depends
                 on loop temp) -> dispatch sources to hold the loop within a
                 band -> loop temp, electricity, unmet hours; g-function drift
5 Score          efficiency (delivered thermal / electricity) and carbon
                 (hourly Cambium) against business as usual
```

## Hard problems, named rather than hidden

1. **OSM is thin.** Most buildings are just `building=yes` with no levels.
   The fallback chain has to show which buildings were **guessed**, and a
   guessed building must look different on the map.
2. **Calibrating 1R1C.** A gray-box model is only as good as its parameters.
   The generator fits each archetype × vintage to ComStock/ResStock annual
   end-use intensities per climate zone, and golden tests pin that the fit
   holds. Hourly *shape* is the model's own and is not checked against NREL —
   say so on the page.
3. **EPRI's warning.** Space conditioning alone made Framingham DOC 1.5 %,
   LBI 0.98 — every neighbourhood would look the same and the game would have
   one answer. DHW and process cooling are what create sharing, so they are
   in from the first engine commit and a test asserts a mixed-use fixture is
   not near LBI 1.
4. **Dispatch.** Which source runs, and in what order, is the design choice the
   player is really making. It needs a simple, explainable rule set, not an
   optimiser.
5. **Honest score.** Show the observed range, never ± a tolerance. The
   baseline assumptions sit beside the score.
6. **A third-party tile origin in the CSP.** The sibling tools have none. We
   either allow OpenFreeMap explicitly or relay tiles through the Worker.

## Phases (draft)

- **00 Scaffold** — copied scaffold, new brand, Worker, CSP
- **01 Load model + calibration** — 1R1C per building, DHW and process
  schedules, archetype × vintage parameter table fitted to ComStock/ResStock
  annual intensities by climate zone (a generator, committed output). A
  committed fixture weather year; no network in tests.
- **02 Engine, no map** — fixed demo neighbourhood → loads → DOC/LBI/density →
  loop sim → baseline → score, g-function drift. Pure functions, Web Worker.
  Minnesota fixtures (D28) for the site metrics.
- **03 Map** — MapLibre, polygon draw (mouse and touch), Overpass and weather
  relays, classifier, guessed-building styling, sources and anchor tenants,
  site context panel
- **04 Design UI** — source palette, placement, sizing
- **05 Results** — Sankey, loop temperature over the year, monthly
  heating/cooling sharing, 25-year bore drift, score breakdown
- **06 Challenges** — goal format, goal library, share links
- **07 Education, export, phone pass, deploy**

## Proposed archetypes (Q1 — for review)

Each is calibrated to a ComStock or ResStock type (D22). OSM tags go first, then landuse,
then footprint size.

| Archetype | Calibration target | Typical OSM signal |
|---|---|---|
| Single-family detached | ResStock | `building=house/detached`, small footprint in residential landuse |
| Small multifamily (2–4) | ResStock | `building=semidetached_house/terrace`, small `apartments` |
| Large multifamily (5+) | ResStock | `building=apartments`, `building:levels>=4` |
| Small office | ComStock SmallOffice | `office=*`, `building=office` under ~2,300 m² |
| Medium/large office | ComStock Medium/LargeOffice | `building=office` above that |
| Retail (standalone) | ComStock RetailStandalone | `shop=*`, `building=retail` |
| Strip mall | ComStock RetailStripmall | `building=retail`, long and low, `landuse=retail` |
| Restaurant | ComStock Full/QuickService | `amenity=restaurant/fast_food/cafe` |
| Primary school | ComStock PrimarySchool | `amenity=school` / `building=school` |
| Secondary school / university | ComStock SecondarySchool | `amenity=college/university`, `building=university` |
| Hospital | ComStock Hospital | `amenity=hospital`, `building=hospital` |
| Outpatient clinic | ComStock Outpatient | `amenity=clinic/doctors` |
| Hotel | ComStock Small/LargeHotel | `tourism=hotel` |
| Warehouse | ComStock Warehouse | `building=warehouse/industrial` |
| Laboratory | ZEEL intensities (D19) | `building=laboratory`, `amenity=research_institute` |
| Supermarket (added in phase 01) | ComStock Grocery | `shop=supermarket` |
| Data centre (source *and* load) | none, rule-based | `telecom=data_center`, `building=data_center` |

Unknown `building=yes` → the most likely archetype from landuse and footprint,
**flagged as guessed**.

## Revisions from the reports

**EPRI, *Mapping Heating and Cooling Loads to Assess the Potential of Thermal
Energy Networks* (3002029431, 2024)**

- Per-building 1R1C from footprints and a synthetic stock → **D22** replaces
  precomputed NREL shapes. It runs on any weather year, responds to retrofits,
  and is cheap: 500 buildings × 8760 hours is a few million steps.
- DOC and LBI → **D24**. DOC is computed from demand alone, before any design,
  so it says what sharing is *available*; the simulation says what the design
  *captured*. Showing both is the lesson.
- Their own caveat — space conditioning only reads as heating-dominated
  everywhere — is why DHW and process loads are not optional (hard problem 3).
- A number to be careful with: the report gives the minimum cluster as
  "800 billion BTU (100 GWh)", but 800 × 10⁹ Btu is 234 GWh. Quote the Btu
  figure, which is the one they applied, and note the discrepancy.

**Minnesota Department of Commerce, *Thermal Energy Network Site Suitability
Study* (Buro Happold et al., January 2026)**

- The weighted scorecard is **not** adopted as a score (D4 stands). Its
  criteria become the information-only context panel → **D25**, filled only
  where the tool genuinely knows the answer.
- Load-balance bands (≤80 / 80–90 / >90 % heating-dominant) → reference marks
  on LBI (**D24**).
- Opportunistic thermal resources — lakes and rivers, ice rinks, breweries,
  supermarkets, processing plants → **D26**. Barriers between a source and the
  buildings (a highway, a river) are named in the context panel, since D12
  models no pipes to feel them.
- Anchor tenants → **D27**. Single ownership, new development and anchor
  tenants recur in every high-scoring site; worth teaching, not scoring.
- The 16 scored sites → fixtures only (**D28**).

## Open questions

None blocking. Phases 00–07 are built. Next: deploy (`docs/deploying.md`), then the backlog.
