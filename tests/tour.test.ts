/**
 * The guided tour: every step's state is real, and every claim a step makes
 * is true of the design it shows, on the tour's own neighbourhood (the same
 * file the browser opens). If the engine or the data move, the tour's words
 * fail here before a player reads something false.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CHALLENGES, challengeById, evaluate } from '../src/challenges/challenges';
import { TOUR_DESIGNS, TOUR_FILE } from '../src/education/generated/tourDesigns';
import { sections } from '../src/education/learn';
import { TOUR_STEPS } from '../src/education/tour';
import { balanceOf } from '../src/engine/balance';
import { toNetworkDesign } from '../src/engine/design';
import type { Design } from '../src/engine/design';
import { FLUID_LIMITS } from '../src/engine/ground';
import { coldestLoop } from '../src/engine/network';
import { runScenario } from '../src/engine/scenario';
import { openProject } from '../src/io/project';
import { boreholeRoom, classifySite } from '../src/site/classify';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';

const opened = openProject(readFileSync(resolve(import.meta.dirname, `../public${TOUR_FILE}`), 'utf8'));
if (!opened.ok) throw new Error(`tour file refused: ${opened.reason}`);
const p = opened.project;
const site = classifySite({ ...p.snapshot.buildings, boundary: p.boundary });
const wx = p.snapshot.weather;
const weather = { temperature: Float64Array.from(wx.temperature), ghi: Float64Array.from(wx.ghi), relativeHumidity: Float64Array.from(wx.relativeHumidity), firstWeekday: wx.firstWeekday };
const neighbourhood = toNeighbourhood(site, EMPTY_SELECTION, p.snapshot.place.zone, p.snapshot.place.region);
const results = new Map<string, ReturnType<typeof runScenario>>();
const run = (id: keyof typeof TOUR_DESIGNS) => {
  if (!results.has(id)) results.set(id, runScenario(neighbourhood, toNetworkDesign(TOUR_DESIGNS[id], weather), weather));
  return results.get(id)!;
};
const meets = (challenge: string, id: keyof typeof TOUR_DESIGNS) =>
  evaluate(challengeById(challenge)!, run(id), TOUR_DESIGNS[id] as Design, { boreholeRoom: boreholeRoom(site.openSpaceM2) });

describe('the tour is well formed', () => {
  it('opens as a project file, with place names, and names only designs and challenges that exist', () => {
    expect(p.placeEdits).toEqual({ neighbourhood: 'Downtown', town: 'Mankato', state: 'MN' });
    for (const s of TOUR_STEPS) {
      expect(TOUR_DESIGNS[s.design]).toBeTruthy();
      if (s.challenge) expect(CHALLENGES.some((c) => c.id === s.challenge)).toBe(true);
      expect(['site', 'design', 'results', 'learn']).toContain(s.tab);
    }
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
  });

  it('every question has exactly one right answer, and every answer says something', () => {
    for (const s of TOUR_STEPS.filter((x) => x.question)) {
      expect(s.question!.options.filter((o) => o.correct)).toHaveLength(1);
      for (const o of s.question!.options) expect(o.response.length).toBeGreaterThan(20);
    }
  });

  it('every element a step brings into view, and every Learn section it offers, exists', () => {
    const source = ['src/ui', 'src/charts']
      .flatMap((d) => readdirSync(resolve(import.meta.dirname, '..', d)).map((f) => readFileSync(resolve(import.meta.dirname, '..', d, f), 'utf8')))
      .join('\n');
    for (const s of TOUR_STEPS) {
      if (s.focus) {
        const chart = /^(.*)-title$/.exec(s.focus)?.[1];
        expect(source.includes(`id="${s.focus}"`) || (chart !== undefined && source.includes(`id="${chart}"`))).toBe(true);
      }
      if (s.learn) expect(sections({ temperature: String, density: String, densityRange: String, area: String, length: String, power: String, delta: String, size: String, distance: String } as never).some((x) => x.id === s.learn)).toBe(true);
    }
  });

  it('the site fits one network (under the 500-building cap)', () => {
    expect(site.buildings.filter((b) => b.archetype).length).toBeLessThanOrEqual(500);
  });
});

describe('what each step says is true', () => {
  it('buildings: most come from FEMA USA Structures, not OpenStreetMap', () => {
    const heated = site.buildings.filter((b) => b.archetype);
    expect(heated.filter((b) => b.origin === 'fema').length).toBeGreaterThan(heated.length / 2);
  });

  it('suitability: heating is most of the demand, rarely in the same hours as cooling; the plant adds heat over the year', () => {
    const r = run('suggestion');
    expect(r.site.heatingShare).toBeGreaterThan(0.6);
    expect(r.site.doc).toBeLessThan(0.2);
    expect(balanceOf(r, TOUR_DESIGNS.suggestion as Design).netKWh).toBeGreaterThan(0);
  });

  it('nearby: a river, an ice rink and a brewery', () => {
    const kinds = site.sources.map((s) => s.kind);
    for (const k of ['river', 'ice-rink', 'brewery']) expect(kinds).toContain(k);
  });

  it('the suggestion holds 40 °F, but its field warms past its upper limit over 25 years', () => {
    const r = run('suggestion');
    expect(coldestLoop(r.network).firstBelowYear).toBeNull();
    expect(r.network.drift![24]!.maxFluid).toBeGreaterThan(FLUID_LIMITS.max);
  });

  it('a colder loop runs the field far cooler over 25 years, and needs glycol', () => {
    const cold = run('colder');
    expect(coldestLoop(cold.network).firstBelowYear).not.toBeNull();
    expect(cold.network.drift![24]!.maxFluid).toBeLessThan(run('suggestion').network.drift![24]!.maxFluid - 10);
  });

  it('river heat meets Waste not', () => {
    expect(meets('waste-not', 'river').met).toBe(true);
  });

  it('river heat lowers the winter peak against the suggestion', () => {
    expect(run('river').grid.winterReduction).toBeGreaterThan(run('suggestion').grid.winterReduction);
  });

  it('the retrofit and a colder loop meet Half the carbon, and the suggestion does not', () => {
    expect(meets('half-carbon', 'final').met).toBe(true);
    expect(meets('half-carbon', 'suggestion').met).toBe(false);
  });
});
