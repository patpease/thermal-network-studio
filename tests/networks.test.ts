import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseCsv } from '../scripts/lib/csv';
import { checkSources, COLUMNS, moduleText } from '../scripts/networks/lib';
import type { NetworkSource } from '../scripts/networks/lib';
import { REFERENCES } from '../src/education/learn';
import { EXISTING_NETWORKS, NETWORK_SOURCES } from '../src/site/generated/networks';
import { NEARBY_NETWORK_M, nearestNetwork, networksNear } from '../src/site/networks';
import { fromDisplay, LABELS, toDisplay } from '../src/units/units';

const dir = resolve(import.meta.dirname, '../data/networks');
const source: NetworkSource = {
  id: 'test',
  file: 'test.csv',
  short: 'Test',
  citation: 'Test (2026).',
  licence: 'CC BY 4.0',
  url: 'https://example.org',
  retrieved: '2026-09-27',
  maintained: true,
};
const row = (over: Record<string, string> = {}) => ({
  ...Object.fromEntries(COLUMNS.map((c) => [c, ''])),
  id: 'a',
  name: 'A campus',
  kind: 'geothermal-network',
  state: 'NY',
  latitude: '42.8',
  longitude: '-75.5',
  placement: 'site',
  ...over,
});

describe('importing existing networks', () => {
  it('accepts a good row and names it by source', () => {
    const r = checkSources([source], new Map([['test', [row()]]]));
    expect(r.errors).toEqual([]);
    expect(r.networks[0]).toMatchObject({ id: 'test:a', at: [-75.5, 42.8], kind: 'geothermal-network', placement: 'site' });
  });

  it('refuses rather than guesses: no point, an unknown kind, outside the US, a repeated id, a bad link', () => {
    const r = checkSources(
      [source],
      new Map([
        [
          'test',
          [
            row({ id: 'p', latitude: '' }),
            row({ id: 'k', kind: 'prospective' }),
            row({ id: 'o', latitude: '51.5', longitude: '-0.1' }),
            row({ id: 'd' }),
            row({ id: 'd' }),
            row({ id: 'l', link: 'www.example.org' }),
            row({ id: 't', placement: 'somewhere' }),
          ],
        ],
      ]),
    );
    expect(r.errors.join('\n')).toMatch(/no point/);
    expect(r.errors.join('\n')).toMatch(/kind "prospective"/);
    expect(r.errors.join('\n')).toMatch(/outside the United States/);
    expect(r.errors.join('\n')).toMatch(/used twice/);
    expect(r.errors.join('\n')).toMatch(/link is not a URL/);
    expect(r.errors.join('\n')).toMatch(/placement "somewhere"/);
  });

  it('refuses a source with no citation or no word on whether it is maintained', () => {
    const r = checkSources([{ ...source, citation: '', maintained: undefined as never }], new Map([['test', [row()]]]));
    expect(r.errors.join('\n')).toMatch(/no citation/);
    expect(r.errors.join('\n')).toMatch(/maintained/);
  });

  it('keeps notes and flags the same system from two sources, without dropping either', () => {
    const other = { ...source, id: 'other', file: 'other.csv' };
    const r = checkSources(
      [source, other],
      new Map([
        ['test', [row({ note: 'Labelled MI; the point is in NY.' })]],
        ['other', [row({ latitude: '42.8005' })]],
      ]),
    );
    expect(r.networks).toHaveLength(2);
    expect(r.notes.join('\n')).toMatch(/Labelled MI/);
    expect(r.notes.join('\n')).toMatch(/same system twice/);
  });
});

describe('the committed data', () => {
  const sources = JSON.parse(readFileSync(resolve(dir, 'sources.json'), 'utf8')) as NetworkSource[];

  it('the generated module is exactly what the CSVs produce', () => {
    const rows = new Map(sources.map((s) => [s.id, parseCsv(readFileSync(resolve(dir, s.file), 'utf8'))]));
    const r = checkSources(sources, rows);
    expect(r.errors).toEqual([]);
    expect(readFileSync(resolve(import.meta.dirname, '../src/site/generated/networks.ts'), 'utf8')).toBe(moduleText(sources, r.networks));
  });

  it('every network names a source with a full citation', () => {
    for (const n of EXISTING_NETWORKS) {
      const s = NETWORK_SOURCES.find((x) => x.id === n.source);
      expect(s?.citation.length).toBeGreaterThan(40);
    }
    expect(new Set(EXISTING_NETWORKS.map((n) => n.id)).size).toBe(EXISTING_NETWORKS.length);
  });

  it('NREL: 114 heat pump networks, 23 open district heating systems, 3 placed by town, no prospective projects', () => {
    const nrel = EXISTING_NETWORKS.filter((n) => n.source === 'nrel-gdr-1282');
    expect(nrel.filter((n) => n.kind === 'geothermal-network')).toHaveLength(114);
    expect(nrel.filter((n) => n.kind === 'geothermal-district-heating')).toHaveLength(23);
    expect(nrel.filter((n) => n.placement === 'town')).toHaveLength(3);
    expect(nrel.some((n) => /New Mexico State/.test(n.name))).toBe(false);
    expect(NETWORK_SOURCES.find((s) => s.id === 'nrel-gdr-1282')?.maintained).toBe(false);
  });
});

describe('networks near a place', () => {
  const boise: [number, number] = [-116.2, 43.615];

  it('lists those within 25 miles, nearest first', () => {
    const near = networksNear(boise);
    expect(near.length).toBeGreaterThanOrEqual(4);
    expect(near.every((n) => n.distanceM <= NEARBY_NETWORK_M)).toBe(true);
    for (let i = 1; i < near.length; i++) expect(near[i]!.distanceM).toBeGreaterThanOrEqual(near[i - 1]!.distanceM);
    expect(near.map((n) => n.network.name)).toContain('Idaho Capitol Mall');
  });

  it('far from any, names the nearest anywhere', () => {
    const middleOfNowhere: [number, number] = [-100.0, 31.0];
    expect(networksNear(middleOfNowhere)).toEqual([]);
    expect(nearestNetwork(middleOfNowhere)?.distanceM).toBeGreaterThan(NEARBY_NETWORK_M);
  });

  it('distances between places print in miles or kilometres, and convert back', () => {
    expect(LABELS.ip.distance).toBe('mi');
    expect(LABELS.si.distance).toBe('km');
    expect(toDisplay('distance', NEARBY_NETWORK_M, 'ip')).toBeCloseTo(25, 2);
    expect(toDisplay('distance', 40_000, 'si')).toBe(40);
    expect(fromDisplay('distance', 25, 'ip')).toBeCloseTo(40_233.6, 1);
  });
});

describe('the Learn tab', () => {
  it('cites NREL in full, with its DOI and licence, and links IDEA without its data', () => {
    expect(REFERENCES['nrel-gdr'].full).toContain('Kolker, A., Beckers, K., & Pauling, H. (2020)');
    expect(REFERENCES['nrel-gdr'].full).toContain('https://doi.org/10.15121/1764506');
    expect(REFERENCES['nrel-gdr'].full).toContain('CC BY 4.0');
    expect(REFERENCES.idea.url).toBe('https://www.districtenergy.org/resources/resources/system-maps');
    expect(REFERENCES.idea.full).toMatch(/not part of this tool/);
  });
});
