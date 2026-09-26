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

**It conveys an idea; it does not predict a saving.** Not for feasibility
studies, utility filings or design submissions.

Status: **phase 03 — the map.** Draw a neighbourhood and read its demand. See `PLAN.md` and `BACKLOG.md`.

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
