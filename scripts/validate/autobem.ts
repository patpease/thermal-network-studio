/**
 * Check this tool's annual heating and cooling demand against ORNL AutoBEM.
 *
 *   npm run validate:autobem            download (once), run, write the report
 *   npm run validate:autobem -- --fresh re-download the inputs
 *
 * A back-end check only: not part of the app, the Worker or `npm test`.
 * Inputs are cached in data/validation/cache/ (gitignored); the report goes
 * to docs/validation/autobem.md and the numbers to docs/validation/autobem.json.
 * The pure half — parsing, mapping, weighting, the report — is in
 * autobem-lib.ts and tested by tests/validate.test.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildingLoads } from '../../src/loads/building.ts';
import { CALIBRATION } from '../../src/loads/generated/calibration.ts';
import type { WeatherYear } from '../../src/loads/model.ts';
import { autobemRows, compare, parseEpw, reportMarkdown, STATIONS, summarise, unzipOne, vintageOf, ZONES_CHECKED } from './autobem-lib.ts';
import type { AutobemRow, CheckedZone } from './autobem-lib.ts';
import { TYPE_MAP } from './autobem-lib.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const cache = resolve(root, 'data/validation/cache');
const outDir = resolve(root, 'docs/validation');
const fresh = process.argv.includes('--fresh');

const AUTOBEM = (zone: CheckedZone) => `https://zenodo.org/records/10393563/files/${zone}_Results.csv?download=1`;
const EPW = (station: string) =>
  `https://climate.onebuilding.org/WMO_Region_4_North_and_Central_America/USA_United_States_of_America/AZ_Arizona/${station}.zip`;

async function cached(name: string, url: string): Promise<Uint8Array> {
  const file = resolve(cache, name);
  if (!fresh && existsSync(file)) return new Uint8Array(readFileSync(file));
  const response = await fetch(url, { headers: { 'User-Agent': 'thermal-network-studio validation (github.com/patpease)' } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  writeFileSync(file, bytes);
  console.log(`fetched ${name} (${Math.round(bytes.length / 1024)} KB)`);
  return bytes;
}

mkdirSync(cache, { recursive: true });
mkdirSync(outDir, { recursive: true });

const rows: AutobemRow[] = [];
const weather = new Map<CheckedZone, WeatherYear>();
for (const zone of ZONES_CHECKED) {
  rows.push(...autobemRows(zone, new TextDecoder().decode(await cached(`autobem-${zone}.csv`, AUTOBEM(zone)))));
  const zip = await cached(`${STATIONS[zone]}.zip`, EPW(STATIONS[zone]));
  const epw = parseEpw(new TextDecoder().decode(await unzipOne(zip, '.epw')));
  weather.set(zone, epw);
  console.log(`${zone}: ${epw.location}`);
}

const unmapped = [...new Set(rows.filter((r) => !TYPE_MAP[r.type]).map((r) => r.type))];
if (unmapped.length) console.log(`not compared (no matching archetype): ${unmapped.join(', ')}`);

const annual = (series: Float64Array) => series.reduce((s, w) => s + w, 0) / 1000;
const tool = (r: AutobemRow) => {
  const vintage = vintageOf(r.standard);
  const loads = buildingLoads({ archetype: TYPE_MAP[r.type]!, zone: r.zone, floorArea: r.area, ...(vintage ? { vintage } : {}) }, weather.get(r.zone)!);
  return { heating: annual(loads.heating), cooling: annual(loads.cooling) };
};
const nlr = (archetype: keyof typeof CALIBRATION, zone: CheckedZone) => {
  const c = CALIBRATION[archetype]?.[zone];
  return c ? { heating: c.targets.heating, cooling: c.targets.cooling } : null;
};

const compared = compare(rows, tool, nlr);
const summary = summarise(compared);
const date = new Date().toISOString().slice(0, 10);

writeFileSync(resolve(outDir, 'autobem.md'), reportMarkdown({ date, rows: compared, summary, stations: STATIONS }));
writeFileSync(
  resolve(outDir, 'autobem.json'),
  `${JSON.stringify({ generated: date, source: 'ORNL AutoBEM, Zenodo 10393563', units: 'kWh/m2/yr; stockArea m2', summary, rows: compared }, null, 1)}\n`,
);

const all = summary.find((s) => s.zone === 'all')!;
const pct = (t: number, a: number) => `${Math.round((t / a - 1) * 100)}%`;
console.log(`\n${rows.length} AutoBEM archetypes, ${compared.length} zone × type groups`);
console.log(`heating demand: tool ${all.tool.heating.toFixed(1)} vs AutoBEM ${all.autobem.heating.toFixed(1)} kWh/m²·yr (${pct(all.tool.heating, all.autobem.heating)})`);
console.log(`cooling demand: tool ${all.tool.cooling.toFixed(1)} vs AutoBEM ${all.autobem.cooling.toFixed(1)} kWh/m²·yr (${pct(all.tool.cooling, all.autobem.cooling)})`);
console.log('report: docs/validation/autobem.md');
