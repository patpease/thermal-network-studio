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
const limits = { boreholeRoom: boreholeRoom(site.openSpaceM2) };
const check = (id: string, d: Design) => evaluate(c(id), run(d), d, limits);
const withWater = (d: Design, w: number): Design => ({ ...d, sources: d.sources.map((s) => (s.kind === 'water' ? { ...s, capacityW: w } : s)) });
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
    for (const x of CHALLENGES) expect(evaluate(x, r, suggestion, limits).met).toBe(false);
  });

  it('Half the carbon and Waste not: let the loop run down to −3 °C', () => {
    const d = { ...suggestion, band: { min: -3, max: 30 } };
    expect(check('half-carbon', d).met).toBe(true);
    const w = check('waste-not', d);
    expect(w.met).toBe(true);
    expect(w.goals[0]!.now).toMatch(/^\d+%$/);
  });

  it('Ground in balance: a colder loop and more river heat keep the field inside its limits', () => {
    const d = { ...withWater(suggestion, 8e6), band: { min: -3, max: 30 } };
    expect(check('ground-balance', d).met).toBe(true);
  });

  it('a bore field larger than the open space fails every challenge, and says so', () => {
    const d = { ...withWater(withBores(suggestion, 3000), 8e6), band: { min: -3, max: 30 } };
    for (const x of CHALLENGES) {
      const e = evaluate(x, run(d), d, limits);
      expect(e.met).toBe(false);
      const fit = e.goals.find((g) => g.goal.kind === 'bores-fit')!;
      expect(fit.met).toBe(false);
      expect(fit.now).toBe('3,000 boreholes');
    }
  });

  it('with no bore field the fit rule does not appear', () => {
    const d = offAir({ ...suggestion, sources: suggestion.sources.filter((s) => s.kind !== 'bore-field') });
    expect(check('half-carbon', d).goals.some((g) => g.goal.kind === 'bores-fit')).toBe(false);
  });

  it('Ground in balance fails, and says when, if the field drifts out', () => {
    const d = { ...suggestion, band: { min: -3, max: 30 } };
    const g = check('ground-balance', d).goals.find((x) => x.goal.kind === 'ground-holds')!;
    expect(g.met).toBe(false);
    expect(g.now).toMatch(/^leaves them in year \d+$/);
  });

  it('Off the air names what is in the way', () => {
    expect(check('off-the-air', suggestion).goals[0]!.now).toBe('has air-source heat pump and cooling tower');
  });
});

describe('on Alexandria, where there is room', () => {
  const alex = classifySite(
    (JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/sites/alexandria-city-hall.json'), 'utf8')) as { data: SiteData }).data,
  );
  const where = siteForCounty('27041')!;
  const w = calibrationWeather(where.zone);
  const n = toNeighbourhood(alex, EMPTY_SELECTION, where.zone, where.region);
  const a = runScenario(n, { sources: [] }, w);
  const room = boreholeRoom(alex.openSpaceM2);
  const base = suggestDesign({ peakHeatingW: a.site.peakHeatingW, peakCoolingW: a.site.peakCoolingW, sources: alex.sources, centre: centroid(alex.boundary), boreholeRoom: room });

  it('Off the air: ground, water and waste heat alone, a deep retrofit, a colder loop', () => {
    const d: Design = { ...withWater(offAir(base), 10e6), band: { min: -3, max: 33 }, retrofit: 0.6 };
    expect(evaluate(c('off-the-air'), runScenario(n, toNetworkDesign(d, w), w), d, { boreholeRoom: room }).met).toBe(true);
  });
});
