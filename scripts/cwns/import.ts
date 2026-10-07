/**
 * EPA Clean Watersheds Needs Survey 2022 → public/data/cwns/.
 *
 *   npm run import:cwns -- <path to 2022CWNS_NATIONAL_*.zip>
 *
 * The zip comes from https://sdwis.epa.gov/ords/sfdw_pub/r/sfdw/cwns_pub/data-download
 * ("National" → Download CSVs). EPA's page asks who is downloading and
 * serves the file through a session, so it is fetched by hand, not here.
 * It is not committed (7.5 MB); the files written from it are.
 *
 * Writes, all GENERATED:
 *   public/data/cwns/<ST>.json   one state's treatment plants
 *   public/data/cwns/index.json  the release, and each state's count and box,
 *                                so the browser fetches only the states a
 *                                site's search box touches.
 * Refuses to write if the tables are missing or no plant survives.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv } from '../lib/csv.ts';
import { readZipEntry, zipEntries } from '../lib/zip.ts';
import { byState, selectPlants } from './lib.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../public/data/cwns');

const path = process.argv[2];
if (!path) {
  console.error('Usage: npm run import:cwns -- <path to 2022CWNS_NATIONAL_*.zip>');
  process.exit(1);
}
const zip = new Uint8Array(readFileSync(path));
const names = zipEntries(zip);
const table = (name: string) => {
  const entry = names.find((n) => n.endsWith(`/${name}.csv`) || n === `${name}.csv`);
  if (!entry) throw new Error(`${name}.csv is not in ${basename(path)}`);
  // EPA's CSVs carry a byte-order mark.
  return parseCsv(new TextDecoder().decode(readZipEntry(zip, (n) => n === entry)).replace(/^﻿/, ''));
};

const { plants, dropped } = selectPlants({
  facilities: table('FACILITIES'),
  facilityTypes: table('FACILITY_TYPES'),
  locations: table('PHYSICAL_LOCATION'),
  flow: table('FLOW'),
  effluent: table('EFFLUENT'),
});
if (plants.length === 0) throw new Error('No treatment plant survived. Nothing written.');

const release = basename(path).replace(/\.zip$/i, '');
const groups = byState(plants);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [state, g] of groups) {
  writeFileSync(resolve(out, `${state}.json`), JSON.stringify({ release, plants: g.plants.map(({ state: _s, ...p }) => p) }));
}
writeFileSync(
  resolve(out, 'index.json'),
  JSON.stringify(
    {
      release,
      retrieved: new Date().toISOString().slice(0, 10),
      states: Object.fromEntries([...groups].map(([s, g]) => [s, { count: g.plants.length, bbox: g.bbox }])),
    },
    null,
    1,
  ),
);
const bytes = readdirSync(out).reduce((a, f) => a + readFileSync(resolve(out, f)).length, 0);
console.log(`cwns: ${plants.length} treatment plants in ${groups.size} files, ${(bytes / 1e6).toFixed(1)} MB (${release})`);
console.log(`dropped: ${dropped.notBuilt} new or abandoned, ${dropped.noPoint} with no point, ${dropped.noFlow} with no design flow`);
