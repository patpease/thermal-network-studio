import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { dailyLoop, dayLabel, loopFlows, monthly, ticks } from '../src/charts/data';
import { layoutSankey } from '../src/charts/sankey';
import { suggestDesign, toNetworkDesign } from '../src/engine/design';
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
const design = suggestDesign({
  peakHeatingW: asIs.site.peakHeatingW,
  peakCoolingW: asIs.site.peakCoolingW,
  sources: site.sources,
  centre: centroid(site.boundary),
  boreholeRoom: boreholeRoom(site.openSpaceM2),
});
const result = runScenario(neighbourhood, toNetworkDesign(design, weather), weather);

const total = (xs: readonly { kWh: number }[]) => xs.reduce((a, x) => a + x.kWh, 0);

describe('loop flows', () => {
  const f = loopFlows(result, design);

  it('balances: heat into the loop equals heat out, to 0.01%', () => {
    expect(Math.abs(total(f.into) - total(f.out)) / total(f.into)).toBeLessThan(1e-4);
  });

  it('shows the bore field on both sides, gross, not netted away', () => {
    const bore = design.sources.find((s) => s.kind === 'bore-field')!;
    expect(f.into.some((x) => x.id === bore.id)).toBe(true);
    expect(f.out.some((x) => x.id === bore.id)).toBe(true);
  });

  it('names sources by the design, and backup plainly', () => {
    expect(f.into.find((x) => x.id.startsWith('ashp'))?.label).toBe('Air-source heat pump');
    const backup = [...f.into, ...f.out].find((x) => x.id === 'backup');
    if (backup) expect(backup).toMatchObject({ label: 'Electric backup', role: 'neutral' });
  });

  it('lays out with the loop as tall as what passes through it', () => {
    const nodes = [
      ...f.into.map((x) => ({ id: `in:${x.id}`, label: x.label, column: 0, colour: '' })),
      { id: 'loop', label: 'Loop', column: 1, colour: '' },
      ...f.out.map((x) => ({ id: `out:${x.id}`, label: x.label, column: 2, colour: '' })),
    ];
    const links = [
      ...f.into.map((x) => ({ source: `in:${x.id}`, target: 'loop', value: x.kWh, colour: '' })),
      ...f.out.map((x) => ({ source: 'loop', target: `out:${x.id}`, value: x.kWh, colour: '' })),
    ];
    const l = layoutSankey(nodes, links, { columnX: [0, 100, 200], nodeWidth: 10, height: 300, gap: 6 });
    const loop = l.nodes.find((n) => n.id === 'loop')!;
    expect(loop.value).toBeCloseTo(Math.max(total(f.into), total(f.out)), 0);
    expect(loop.y1 - loop.y0).toBeLessThanOrEqual(300);
  });
});

describe('daily loop and months', () => {
  it('turns 8,760 hours into 365 ordered days', () => {
    const d = dailyLoop(result.network.loopTemperature, weather.temperature);
    expect(d).toHaveLength(365);
    for (const x of d) expect(x.min).toBeLessThanOrEqual(x.mean + 1e-9);
    for (const x of d) expect(x.mean).toBeLessThanOrEqual(x.max + 1e-9);
  });

  it('shares no more in a month than either side offers', () => {
    const m = monthly(result);
    expect(m).toHaveLength(12);
    for (const x of m) expect(x.shared).toBeLessThanOrEqual(Math.min(x.extracted, x.rejected) + 1e-6);
    expect(m.reduce((a, x) => a + x.extracted, 0)).toBeCloseTo(result.network.extractedKWh, 0);
  });
});

describe('helpers', () => {
  it('labels days of a 365-day year', () => {
    expect(dayLabel(0)).toBe('1 Jan');
    expect(dayLabel(59)).toBe('1 Mar');
    expect(dayLabel(364)).toBe('31 Dec');
  });

  it('picks round ticks', () => {
    expect(ticks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(ticks(-3.2, 31.7)).toEqual([0, 10, 20, 30]);
  });
});
