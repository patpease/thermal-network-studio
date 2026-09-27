/**
 * Test fixtures: the federal structure sets for each committed site (phase 12).
 *
 *   npm run fixtures:structures
 *
 * Runs the relay's own `fetchStructures` (FEMA USA Structures and USACE NSI)
 * for each fixture's boundary and writes what it returned, so a fixture is
 * exactly what the relay would attach. Fixture mode and the tests read these;
 * neither touches the network.
 *
 * FEMA USA Structures: FEMA and ORNL, CC BY 4.0. NSI: USACE, public.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ATTRIBUTION, fetchStructures } from '../../src/relay/relay.ts';
import type { Fetcher } from '../../src/relay/relay.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sites = resolve(here, '../../tests/fixtures/sites');
const out = resolve(here, '../../tests/fixtures/structures');
const KEYS = ['mankato-downtown', 'highland-park', 'alexandria-city-hall'];

const fetcher: Fetcher = (url, init) =>
  fetch(url, {
    ...(init?.timeoutMs ? { signal: AbortSignal.timeout(60_000) } : {}),
    headers: { Accept: 'application/json', 'User-Agent': 'thermal-network-studio fixtures (github.com/patpease)' },
  });

mkdirSync(out, { recursive: true });
for (const key of KEYS) {
  const { data } = JSON.parse(readFileSync(resolve(sites, `${key}.json`), 'utf8')) as { data: { boundary: [number, number][] } };
  const structures = await fetchStructures(data.boundary, fetcher);
  if (!structures.fema || !structures.nsi) throw new Error(`${key}: ${!structures.fema ? 'FEMA' : 'NSI'} did not answer; not writing a partial fixture.`);
  writeFileSync(
    resolve(out, `${key}.json`),
    `${JSON.stringify({ attribution: ATTRIBUTION.structures, fetched: new Date().toISOString().slice(0, 10), structures })}\n`,
  );
  console.log(`${key}: FEMA ${structures.fema.length}${structures.femaTruncated ? ' (truncated)' : ''}, NSI ${structures.nsi.length}`);
}
