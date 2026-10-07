import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EXPORT_SOURCES } from '../src/charts/exportChart';
import { DATA_SOURCES, sourceById, sourceLine } from '../src/config/sources';
import { TILES } from '../src/map/style';
import { ALLOWED_HOSTS, ATTRIBUTION } from '../src/relay/relay';
import { NETWORK_SOURCES } from '../src/site/generated/networks';

const root = resolve(import.meta.dirname, '..');

/** Every file under a `generated/` directory in src. */
function generatedFiles(dir = join(root, 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return generatedFiles(p);
    return p.includes(`${'/'}generated${'/'}`) ? [relative(root, p)] : [];
  });
}

describe('the data source register', () => {
  it('names every host the relay or the map can reach', () => {
    const named = new Set(DATA_SOURCES.flatMap((s) => s.hosts ?? []));
    for (const host of [...ALLOWED_HOSTS, new URL(TILES).hostname]) expect(named, host).toContain(host);
  });

  it('names every generated file in src, and every file it names exists', () => {
    const named = new Set(DATA_SOURCES.flatMap((s) => s.files ?? []));
    for (const f of generatedFiles()) expect(named, f).toContain(f);
    for (const f of named) expect(existsSync(join(root, f)), f).toBe(true);
  });

  it('carries every existing-networks source', () => {
    for (const n of NETWORK_SOURCES) expect(sourceById(n.id).licence).toBe(n.licence);
  });

  it('gives every entry a licence, a credit, a release and an update schedule', () => {
    const ids = new Set<string>();
    for (const s of DATA_SOURCES) {
      expect(ids.has(s.id), s.id).toBe(false);
      ids.add(s.id);
      for (const field of [s.name, s.publisher, s.use, s.licence, s.attribution, s.vintage, s.refresh, s.short]) expect(field.trim(), s.id).not.toBe('');
      expect(s.url, s.id).toMatch(/^https:\/\//);
      if (s.delivery === 'live') expect(s.hosts?.length, s.id).toBeGreaterThan(0);
    }
  });

  it('marks the ODbL sources share-alike', () => {
    for (const s of DATA_SOURCES) expect(s.shareAlike, s.id).toBe(/ODbL/.test(s.licence));
  });

  it('carries the credits the licences ask for', () => {
    // NLR's requested sentence, verbatim; Cambium's licence asks for DOE/NREL/ALLIANCE.
    expect(sourceById('nlr-stock').attribution).toContain('developed by the National Laboratory of the Rockies (NLR) with funding from the U.S. Department of Energy (DOE)');
    expect(sourceById('cambium').attribution).toContain('DOE/NREL/ALLIANCE');
    expect(sourceById('open-meteo-weather').attribution).toContain('Copernicus');
    expect(ATTRIBUTION.weather).toMatch(/Open-Meteo.*Copernicus/);
  });

  it('prints a release on every attribution line', () => {
    const line = sourceLine(EXPORT_SOURCES);
    expect(line).toContain('2025 R3');
    expect(line).toContain('Cambium 2023');
    expect(sourceLine(NETWORK_SOURCES.map((n) => n.id))).toMatch(/\d{4}/);
  });

  it('refuses an unknown id', () => {
    expect(() => sourceById('nope')).toThrow();
  });
});
