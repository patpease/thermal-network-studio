# Thermal Network Studio — plan (draft 4)

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

The audience runs from engineers to citizens, so the same simulation has to
read two ways: a clear story on top, and the numbers one click down.

**The framing is ZEEL's:** the game conveys an idea and does not predict a
saving. It is not for feasibility studies or utility filings. The scope line
sits on the page and is burned into every export.

## Decisions

| # | Decision | What follows from it |
|---|---|---|
| D1 | **Ambient loop (5GDHC)** with a heat pump in every building | Loop temperature is the state. Heating and cooling rejection cancel out on the loop, and that sharing is the thing the game teaches. |
| D2 | **US first** | NREL EULP loads, ASHRAE climate zones, NREL Cambium grid carbon |
| D3 | **Sandbox + challenges** | Free play on any map, with scenario goals on the same engine |
| D4 | **Score = efficiency + carbon** | Cost is shown but not scored |
| D5 | **NREL ComStock/ResStock EULP, precomputed** | A build-time generator: archetype × climate zone → normalised 8760 shape, scaled by floor area. It is committed and never edited by hand. |
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
| D19 | **Labs added as archetype 16** | No EULP type exists, so it takes ZEEL's zone intensities with an EULP hospital/office shape. This is a borrowed profile and is labelled as one, as in heat-balance's Laboratory row. |
| D20 | **Score = 50% efficiency + 50% carbon** | Both components are always shown beside the blended number |
| D21 | **Baseline = regional existing stock** | BAU heating fuel mix and cooling from ComStock/ResStock per climate zone and archetype. Baked in by the same generator as D5. |

## Carried over from the sibling tools (copied, not a shared package)

| From | What |
|---|---|
| all three | Vite + React 19 + TS, vitest, Cloudflare **Worker** (not Pages), the three wrangler settings that fail quietly, CSP with no `unsafe-inline`, `strictPort` dev ports |
| heat-balance-studio | Relay pattern: one `relay.ts` with all the logic, thin adapters in the Worker and in the Vite dev server, an edge cache keyed on rounded coords + `DERIVATION_VERSION`, exact host pinning. Reused for **Overpass** and **Open-Meteo**. |
| heat-balance-studio | Open-Meteo archive with the UTC timezone fix, EPW upload, geocoder that shows alternatives |
| psychrometric-studio | Chrome, tokens, IP/SI at the edge, export rules (ADR 0004) |
| zeel | Sankey layout, palette validation, notes vs warnings, the "conveys an idea" framing |

## Pipeline

```
1 Neighbourhood  draw polygon -> Overpass relay -> footprints, levels, tags,
                 candidate sources -> player adds/removes buildings
2 Loads          classify archetype (tags -> landuse -> footprint heuristic ->
                 player override) -> floor area -> scale EULP shape for the
                 site's climate zone -> heating, cooling, DHW 8760 per building
3 Design         place and size: bore field, ASHP, cooling tower, sewer HX,
                 data-centre recovery
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
2. **Using EULP data.** The raw data is huge. The generator has to reduce it to
   something like 15 archetypes × 16 climate zones × 3 end uses, normalised per
   floor area and quantised, while keeping the bundle small.
3. **Dispatch.** Which source runs, and in what order, is the design choice the
   player is really making. It needs a simple, explainable rule set, not an
   optimiser.
4. **Honest score.** Show the observed range, never ± a tolerance. The
   baseline assumptions sit beside the score.
5. **A third-party tile origin in the CSP.** The sibling tools have none. We
   either allow OpenFreeMap explicitly or relay tiles through the Worker.

## Phases (draft)

- **00 Scaffold** — copied scaffold, new brand, Worker, CSP
- **01 EULP generator** — archetype × climate-zone shapes, golden tests
- **02 Engine, no map** — fixed demo neighbourhood → loads → loop sim →
  baseline → score, g-function drift. Pure functions, Web Worker.
- **03 Map** — MapLibre, polygon draw (mouse and touch), Overpass relay,
  classifier, guessed-building styling
- **04 Design UI** — source palette, placement, sizing
- **05 Results** — Sankey, loop temperature over the year, monthly
  heating/cooling sharing, 25-year bore drift, score breakdown
- **06 Challenges** — goal format, goal library, share links
- **07 Education, export, phone pass, deploy**

## Proposed archetypes (Q1 — for review)

Each maps to a ComStock or ResStock type. OSM tags go first, then landuse,
then footprint size.

| Archetype | EULP source | Typical OSM signal |
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
| Laboratory | borrowed (see D19) | `building=laboratory`, `amenity=research_institute` |
| Data centre (source *and* load) | none, rule-based | `telecom=data_center`, `building=data_center` |

Unknown `building=yes` → the most likely archetype from landuse and footprint,
**flagged as guessed**.

## Open questions

None blocking. Next step: create `patpease/thermal-network-studio` with this plan as the first commit, then start Phase 00.
