# Existing thermal networks

The map and Site tab show thermal networks that already run. Every row here
comes from a published source with its own citation; nothing is typed from
memory.

```
data/networks/sources.json   one entry per source
data/networks/<source>.csv   its rows, in the shared columns below
        --npm run import:networks-->  src/site/generated/networks.ts (GENERATED)
```

## Adding a source

1. Put its rows in a CSV here, in the columns below — by hand, with a
   spreadsheet, or with a converter of your own. How the CSV was made is that
   source's business; `scripts/networks/from-nrel-gdr-1282.ts` is kept as the
   record for NREL's, not as a pattern to follow.
2. Add an entry to `sources.json`: `id` (lower-case, hyphens), `file`,
   `short` (the attribution line on the panel), `citation` (exactly as the
   publisher asks), `licence`, `url`, `retrieved` (ISO date), `maintained`
   (whether the publisher still updates it).
3. `npm run import:networks`. It refuses to write if any row fails, and lists
   every problem. Notes — such as a possible duplicate of a system another
   source already has — are printed and kept, never corrected.
4. Commit the CSV, `sources.json` and the generated file together.

Only add data the licence allows. A map with no stated licence (IDEA's
system map, for one) is linked and cited on Learn, not copied here.

## Columns

| Column | Required | Meaning |
|---|---|---|
| `id` | yes | Unique within the source. Becomes `<source>:<id>`. |
| `name` | yes | As published. |
| `kind` | yes | `geothermal-network` (a shared ground loop with heat pumps), `geothermal-district-heating` (hot geothermal water piped to buildings), `district-energy` (steam, hot or chilled water), `thermal-network` (an ambient loop). |
| `state` | no | Two letters, as published. |
| `latitude`, `longitude` | yes | WGS 84 degrees, inside the United States. |
| `placement` | yes | `site` if the point is the system; `town` if it is only the town. A town point is never drawn as the system's location. |
| `year_opened` | no | Four digits. |
| `capacity_mwt` | no | Thermal capacity, MW. |
| `link` | no | The publisher's or the system's page. |
| `note` | no | Anything a reader should know: a label that disagrees with the point, how a town was chosen. Printed on import. |

## Sources so far

- **nrel-gdr-1282** — NREL's *U.S. Geothermal District Heating and Cooling
  Systems Data* (CC BY 4.0), retrieved 27 September 2026 and not expected to
  be updated. 114 current geothermal heat pump networks and 23 open
  direct-use geothermal district heating systems. Not taken: the prospective
  projects, and one closed system (New Mexico State University). Three
  direct-use systems had no point and are placed at their town. One label
  disagrees with its point: Monroe Community College, labelled MI, is in
  Rochester, NY.
