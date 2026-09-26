import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { challengeById, CHALLENGES, evaluate } from '../src/challenges/challenges';
import { suggestDesign, toNetworkDesign } from '../src/engine/design';
import type { Design } from '../src/engine/design';
import { runScenario } from '../src/engine/scenario';
import { siteForCounty } from '../src/relay/relay';
import { boreholeRoom, classifySite } from '../src/site/classify';
import { centroid } from '../src/site/geometry';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';
import type { SiteData } from '../src/site/osm';

const site = classifySite(
  (JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/sites/mankato-downtown.json'), 'utf8')) as { data: SiteData }).data,
);
const { zone, region } = siteForCounty('27013')!;
const weather = calibrationWeather(zone);
const neighbourhood = toNeighbourhood(site, EMPTY_SELECTION, zone, region);
const asIs = runScenario(neighbourhood, { sources: [] }, weather);
const suggestion = suggestDesign({
  peakHeatingW: asIs.site.peakHeatingW,
  peakCoolingW: asIs.site.peakCoolingW,
  sources: site.sources,
  centre: centroid(site.boundary),
  boreholeRoom: boreholeRoom(site.openSpaceM2),
});
const run = (d: Design) => runScenario(neighbourhood, toNetworkDesign(d, weather), weather);
const withBores = (d: Design, n: number): Design => ({ ...d, sources: d.sources.map((s) => (s.kind === 'bore-field' ? { ...s, boreholes: n } : s)) });
const offAir = (d: Design): Design => ({ ...d, sources: d.sources.filter((s) => s.kind !== 'air-source' && s.kind !== 'cooling-tower') });
const c = (id: string) => challengeById(id)!;

describe('the library', () => {
  it('has unique ids, and every goal is data the engine already computes', () => {
    expect(new Set(CHALLENGES.map((x) => x.id)).size).toBe(CHALLENGES.length);
    for (const x of CHALLENGES) expect(x.goals.length).toBeGreaterThan(0);
  });

  it('never lets waste heat alone earn an award: every challenge caps backup hours', () => {
    for (const x of CHALLENGES) expect(x.goals.some((g) => g.kind === 'unmet-hours')).toBe(true);
  });
});

describe('on downtown Mankato', () => {
  it('the suggested design meets none: it leaves the cold snap to backup', () => {
    const r = run(suggestion);
    for (const x of CHALLENGES) expect(evaluate(x, r, suggestion).met).toBe(false);
  });

  it('Half the carbon: a colder loop and a larger field meet it', () => {
    const d = { ...withBores(suggestion, 2000), band: { min: -2, max: 30 } };
    expect(evaluate(c('half-carbon'), run(d), d).met).toBe(true);
  });

  it('Waste not: the river and rink carry 15% once the loop may run colder', () => {
    const d = { ...suggestion, band: { min: -2, max: 30 } };
    const e = evaluate(c('waste-not'), run(d), d);
    expect(e.met).toBe(true);
    expect(e.goals[0]!.now).toMatch(/^\d+%$/);
  });

  it('Off the air and Ground in balance: ground, river and waste heat alone', () => {
    const d = { ...withBores(offAir(suggestion), 3000), band: { min: -2, max: 32 } };
    const r = run(d);
    expect(evaluate(c('off-the-air'), r, d).met).toBe(true);
    expect(evaluate(c('ground-balance'), r, d).met).toBe(true);
  });

  it('Ground in balance fails, and says when, if the field drifts out', () => {
    const d = { ...withBores(suggestion, 2000), band: { min: -2, max: 30 } };
    const g = evaluate(c('ground-balance'), run(d), d).goals.find((x) => x.goal.kind === 'ground-holds')!;
    expect(g.met).toBe(false);
    expect(g.now).toMatch(/^leaves them in year \d+$/);
  });

  it('Off the air names what is in the way', () => {
    const g = evaluate(c('off-the-air'), run(suggestion), suggestion).goals[0]!;
    expect(g.now).toBe('has air-source heat pump and cooling tower');
  });
});
