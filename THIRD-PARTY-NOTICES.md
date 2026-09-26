# Third-party notices

Runtime dependencies bundled into the site. Listed by hand until the notices
generator arrives with MapLibre in phase 03.

| Package | Licence |
|---|---|
| react, react-dom | MIT |
| @fontsource-variable/archivo (Archivo, Omnibus-Type) | SIL Open Font License 1.1 |
| @fontsource/ibm-plex-mono (IBM Plex Mono) | SIL Open Font License 1.1 |

## Data

| Source | Terms |
|---|---|
| ComStock™ 2025 R3 and ResStock™ 2025 R1, NLR (U.S. DOE) | Public data on OEDI. Attribution: "Data includes information from the ComStock™ and ResStock™ datasets developed by the National Laboratory of the Rockies (NLR) with funding from the U.S. Department of Energy (DOE)." Reduced to annual intensities in `data/calibration/targets.json`. |
| NLR AMY2018 county weather (ComStock 2025 R3) | As above. Fifteen counties in `data/calibration/weather.json.gz`. |
| PNNL prototype building scorecards, 90.1-2004 | Weekday schedule shapes in `src/loads/schedules.ts`, via Heat Balance Studio. |
