import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { challengeById } from '../src/challenges/challenges';
import { challengeSiteFact, REFERENCES, sections, siteFacts } from '../src/education/learn';
import type { Formatters } from '../src/education/learn';
import { runScenario } from '../src/engine/scenario';
import { siteForCounty } from '../src/relay/relay';
import { classifySite } from '../src/site/classify';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';
import type { SiteData } from '../src/site/osm';
import { networkSize, rangeWithUnit, withUnit } from '../src/ui/format';
import type { UnitSystem } from '../src/units/units';

const fmt = (units: UnitSystem): Formatters => ({
  temperature: (c) => withUnit('temperature', c, units, 3),
  density: (d) => withUnit('density', d, units),
  densityRange: (lo, hi) => rangeWithUnit('density', lo, hi, units),
  distance: (m) => withUnit('distance', m, units, 2),
  area: (m2) => withUnit('area', m2, units),
  length: (m) => withUnit('length', m, units, 3),
  power: (w) => withUnit('power', w, units, 2),
  delta: (k) => withUnit('temperatureDelta', k, units, 2),
  size: (tons) => networkSize(tons, units),
});

const site = classifySite(
  (JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/sites/mankato-downtown.json'), 'utf8')) as { data: SiteData }).data,
);
const where = siteForCounty('27013')!;
const weather = calibrationWeather(where.zone);
const metrics = runScenario(toNeighbourhood(site, EMPTY_SELECTION, where.zone, where.region), { sources: [] }, weather).site;

const ft = (d: number) => withUnit('length', d, 'ip');
const m = (d: number) => withUnit('length', d, 'si');

const all = (units: UnitSystem) => [...sections(fmt(units)).flatMap((s) => s.facts), ...siteFacts(site, metrics, fmt(units))];

describe('Learn content', () => {
  it('gives every statement at least one known source', () => {
    for (const f of all('ip')) {
      expect(f.refs.length).toBeGreaterThan(0);
      for (const r of f.refs) expect(REFERENCES[r]).toBeDefined();
    }
  });

  it('states facts; it does not argue (no "because", "so that", "which is why", no first person)', () => {
    for (const f of all('ip')) expect(f.text).not.toMatch(/\b(because|so that|which is why|that is why|this means|we|our|I)\b/i);
  });

  it('converts every figure with the unit system and prints no NaN', () => {
    const ip = all('ip').map((f) => f.text).join(' ');
    const si = all('si').map((f) => f.text).join(' ');
    expect(ip).toContain('°F');
    expect(ip).not.toContain('°C');
    expect(si).toContain('°C');
    expect(si).not.toContain('°F');
    expect(ip + si).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('names no study but EPRI, NLR and the others in the app (Minnesota lives in the README)', () => {
    expect(all('si').map((f) => f.text).join(' ')).not.toMatch(/Minnesota/);
  });

  it('says plainly that not every site suits a network, with EPRI’s figures', () => {
    const s = sections(fmt('si')).find((x) => x.id === 'suitability')!;
    const text = s.facts.map((f) => f.text).join(' ');
    expect(text).toContain('50–150 GWh/km²·yr');
    expect(text).toMatch(/challenge can be impossible/);
  });
});

describe('facts about the drawn site', () => {
  it('compares Mankato’s open space with what its peak would need', () => {
    const f = siteFacts(site, metrics, fmt('si')).find((x) => x.text.startsWith('Open space'))!;
    expect(f.text).toMatch(/room for about [\d,]+ boreholes\. A field for the whole peak heat extraction would need about [\d,]+\./);
  });

  it('puts the right fact beside each challenge', () => {
    expect(challengeSiteFact(challengeById('ground-balance')!, site, metrics, ft)).toMatch(/^This site: open space for about/);
    expect(challengeSiteFact(challengeById('off-the-air')!, site, metrics, ft)).toMatch(/^This site: open space for about/);
    expect(challengeSiteFact(challengeById('waste-not')!, site, metrics, ft)).toMatch(/^This site: \d+ waste heat or water sources? within 1,320 ft\.$/);
    expect(challengeSiteFact(challengeById('waste-not')!, site, metrics, m)).toMatch(/within 402 m\.$/);
    expect(challengeSiteFact(challengeById('half-carbon')!, site, metrics, ft)).toBeNull();
  });
});
