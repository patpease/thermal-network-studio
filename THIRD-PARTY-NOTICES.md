# Third-party notices

Runtime dependencies bundled into the site. Listed by hand; a generator is a backlog item.

| Package | Licence |
|---|---|
| react, react-dom | MIT |
| maplibre-gl | BSD-3-Clause |
| @fontsource-variable/archivo (Archivo, Omnibus-Type) | SIL Open Font License 1.1 |
| @fontsource/ibm-plex-mono (IBM Plex Mono) | SIL Open Font License 1.1 |

## Data

| Source | Terms |
|---|---|
| ComStock™ 2025 R3 and ResStock™ 2025 R1, NLR (U.S. DOE) | Public data on OEDI. Attribution: "Data includes information from the ComStock™ and ResStock™ datasets developed by the National Laboratory of the Rockies (NLR) with funding from the U.S. Department of Energy (DOE)." Reduced to annual intensities in `data/calibration/targets.json`. |
| NLR AMY2018 county weather (ComStock 2025 R3) | As above. Fifteen counties in `data/calibration/weather.json.gz`. |
| Cambium 2023 LRMER workbook, NLR (U.S. DOE) | Public data, data.nlr.gov submission 230. Levelized month × hour rates in `src/engine/generated/cambium.ts`. |
| PNNL prototype building scorecards, 90.1-2004 | Weekday schedule shapes in `src/loads/schedules.ts`, via Heat Balance Studio. |
| OpenStreetMap | © OpenStreetMap contributors, ODbL 1.0. Buildings and features at run time via Overpass; three Minnesota sites in `tests/fixtures/sites/` (derived data, attributed in each file). |
| OpenFreeMap / OpenMapTiles | Basemap tiles and glyphs, loaded by the browser. "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" on the map. |
| U.S. Census Bureau geocoder | Point → county at run time. Public. |
| NLR spatial tract lookup (ComStock 2025 R3) | County → climate zone, `src/engine/generated/counties.ts`. |
