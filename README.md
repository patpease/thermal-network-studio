# Thermal Network Studio

**Could this neighbourhood share its heat?**

A web game about thermal energy networks. Pick a neighbourhood on the map, see
every building's hourly heating and cooling demand, build an ambient-temperature
loop from bore fields, air-source heat pumps, cooling towers and waste heat from
data centres and sewers — and see how it scores on efficiency and carbon
against the buildings as they are today.

Part of [Pease Studio](https://peasestudio.com): free, lightweight tools for
building performance. Everything runs in your browser. No account, no upload,
nothing kept.

Use to explore how a shared thermal network could work in a neighborhood.
Uses first-principle physics and publicly accessible building data. Use it to
convey an idea, learn about thermal energy networks and your neighborhood.
**Not for a full feasibility study, to learn more find an expert and start a
dialog.**

Status: **phases 00–07 built** — map, loads, design, results, challenges and
awards, Learn, phone layout. See `PLAN.md` and `BACKLOG.md`.

## Sources

The tool's figures and its Learn tab cite their sources in the app (EPRI,
NLR, Cambium, EPA, OpenStreetMap). Two reports shaped the plan; full notes
with page numbers are in `docs/references.md`.

- **EPRI.** *Mapping Heating and Cooling Loads to Assess the Potential of
  Thermal Energy Networks.* Technical Update 3002029431, 2024. The load
  model's form, demand overlap, load balance and density.
- **Minnesota Department of Commerce.** *Thermal Energy Network Site
  Suitability Study.* Buro Happold with Building Decarbonization Coalition,
  Slipstream and Thermal Energy Insights, January 2026.
  <https://www.lrl.mn.gov/docs/2026/mandated/260051.pdf>. The site features
  the tool looks for — load balance, density, nearby thermal resources
  (data centres, ice rinks, breweries, wastewater plants, lakes, rivers),
  open ground for bore fields, dividing roads and rail, anchor buildings —
  follow the study's site-suitability criteria. Its sixteen Minnesota sites
  are test fixtures. The app does not reproduce the study's scores or
  weights.
- **Building Decarbonization Coalition**, *Thermal Energy Networks*
  (<https://buildingdecarb.org/initiatives/tens>), **HEET**'s *Networked
  Geothermal Toolkit*, and **Vermont Community Thermal Networks**' sheets
  within it — cited in the Learn tab.

## Development

```bash
npm install
npm run dev              # http://localhost:5186
npm test
npm run build
npm run preview:worker   # the built site in the real Workers runtime, :8790
npm run dev:fixtures     # offline: the relay answers from committed fixtures
```

## Licence

MIT. Map data © OpenStreetMap contributors, ODbL. Basemap © OpenFreeMap / OpenMapTiles. Load calibration from NLR ComStock™/ResStock™.
