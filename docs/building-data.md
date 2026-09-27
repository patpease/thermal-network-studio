# More building data: the review (after phase 11)

OSM is thin in places. Mankato's residential blocks south of downtown return
about one building. Four sources were checked against the SAME 300 × 330 m box
there (−93.9990, 44.1620 to −93.9950, 44.1650) on 26 September 2026, each
fetched live from this sandbox.

| Source | What came back | Shape | Use / type | Storeys / height | Licence | Access |
|---|---|---|---|---|---|---|
| OpenStreetMap (today) | ~1 building | polygon | tags, often none | tags, often none | ODbL | Overpass |
| **FEMA USA Structures** | **92** | **polygon** | **88 residential (57 single-family, 30 multifamily), 3 schools, 1 industrial** | HEIGHT empty here | CC BY 4.0 (FEMA, ORNL) | ArcGIS FeatureServer, one query by envelope, `f=geojson` |
| **USACE National Structure Inventory (NSI)** | **81** | point | Hazus occupancy: 51 RES1 (houses, by storeys), 27 RES3A–D (multifamily by unit count), EDU1, REL1 | `num_story`, `sqft`, `ftprntsqft`, `resunits`, `bldheight` | public (federal) | REST API, `?bbox=` or POST polygon |
| Overture Maps buildings | 66 | polygon | none here | ML height on all 66, no floors | ODbL | PMTiles on S3 by range request (z14); GeoParquet |
| Microsoft US Building Footprints (direct) | — | polygon | none | none in the US set | ODbL | per-state files, hundreds of MB |

Not checked: Google Open Buildings (no US coverage), county assessor parcels
(year built and use codes, but one source per county; Regrid's national set is
paid).

Also reviewed, not measured:

- **ORNL AutoBEM / Model America** — an EnergyPlus model of 122.9 M US
  buildings, as per-county model files through Globus only; the attribute
  table it was built from is not published with it, and results exist only
  for a few regions. Not usable live. Its regional results are a validation
  set for the hourly shape (BACKLOG).
- **OSM-derived building classification for the US** (de Arruda et al.,
  *Scientific Data* 11, 1210, 2024) — 67.7 M footprints labelled residential
  or non-residential from OSM tags and land use. Two classes, from the same OSM
  data this tool already reads and classifies more finely (tags → land use →
  footprint). USA Structures' occupancy (single-family, multifamily, school…)
  and NSI's Hazus codes say more, and answer per site. Useful at most as a
  cross-check of the classifier's residential share on a county.

## What each is good for

- **USA Structures fills the gap.** Polygons, so they draw and measure like
  OSM footprints, with an occupancy class that maps to archetypes
  (single-family, multifamily, school…). Structures under 450 ft² are left out;
  `OUTBLDG` marks sheds and garages to drop. Footprints are ORNL's, from 2019
  imagery here.
- **NSI enriches.** Storeys, floor area and residential units per structure —
  exactly what the load model guesses today. `occtype` separates houses from
  2-, 3–4, 5–9, 10–19 and 20+ unit buildings, which is ResStock's own split.
  `med_yr_blt` is a **census-block-group median**, not the building's year:
  59 of 81 read 1974. Usable only as a guessed vintage.
- **Overture** is OSM plus Microsoft's footprints, conflated, with ML heights.
  Here it was all Microsoft, heights only. Heavier to read (PMTiles and vector
  tile decoding in the Worker) for less than the two federal sources give.
- **Microsoft direct** is superseded: its footprints reach us through Overture,
  and ORNL's through USA Structures and NSI (`ftprntsrc: "Bing"` on 60 of 81).

## Recommendation (phase 12)

OSM stays first: its tags name uses the federal sets do not (a rink, a
supermarket, a data centre), and they are what find heat sources. Then:

1. **USA Structures fills footprints OSM does not have.** A federal polygon that
   overlaps no OSM building (less than 30% of its area) is added, with its
   archetype from `PRIM_OCC`. One that does overlap lends its occupancy to an
   OSM building with no use tag.
2. **NSI fills storeys and floor area.** NSI points inside a footprint give
   `num_story` (when OSM has no levels or height) and sum `sqft` for floor
   area; `resunits` picks single-family, small or large multifamily.
3. **Every filled value is flagged with its source** — "FEMA" or "NSI", drawn
   like a guess (faint, dashed) and correctable like one. Nothing becomes
   OSM's.
4. **Relay**: two more upstream calls per site, in parallel with Overpass,
   host-pinned, edge-cached by boundary like the Overpass call (NSI asks not to
   be called repeatedly for the same area). Either failing leaves OSM alone and
   says so; neither blocks the site.
5. **Attribution** on the Site panel, the map and exports: "Structures: FEMA
   USA Structures (CC BY 4.0), USACE National Structure Inventory."
6. **Verify from `preview:worker`**: both answered from this sandbox with curl,
   but the Workers runtime egresses differently (see Overpass).

Open points: Hazus → archetype table (RES1, RES3A–F, COM1–10, EDU1–2, …) needs
writing and a test per code; the D11 cap of 500 buildings will bind sooner
once the gaps are filled.
