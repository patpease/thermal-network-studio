/**
 * Existing thermal networks → src/site/generated/networks.ts.
 *
 *   npm run import:networks
 *
 * Reads data/networks/sources.json and each source's CSV (the shared columns
 * in lib.ts), validates everything, and writes the module the app imports.
 * Refuses to write if any row fails. Offline: the CSVs are committed.
 *
 * To add data: put a CSV in the shared columns in data/networks/, add its
 * entry to sources.json with the publisher's citation and licence, re-run,
 * and commit both. data/networks/README.md has the column rules.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv } from '../lib/csv.ts';
import { checkSources, moduleText } from './lib.ts';
import type { NetworkSource } from './lib.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '../../data/networks');
const out = resolve(here, '../../src/site/generated/networks.ts');

const sources = JSON.parse(readFileSync(resolve(dir, 'sources.json'), 'utf8')) as NetworkSource[];
const rows = new Map(sources.map((s) => [s.id, parseCsv(readFileSync(resolve(dir, s.file), 'utf8'))]));
const { networks, errors, notes } = checkSources(sources, rows);

for (const n of notes) console.log(`note: ${n}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\nNot written: ${errors.length} problem${errors.length === 1 ? '' : 's'}.`);
  process.exit(1);
}
writeFileSync(out, moduleText(sources, networks));
for (const s of sources) {
  const n = networks.filter((x) => x.source === s.id);
  console.log(`${s.id}: ${n.length} networks (${n.filter((x) => x.placement === 'town').length} placed by town)${s.maintained ? '' : ', not maintained by its publisher'}`);
}
console.log(`wrote src/site/generated/networks.ts: ${networks.length} networks`);
