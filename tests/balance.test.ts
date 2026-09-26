import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { balanceOf } from '../src/engine/balance';
import { BOREHOLE_PEAK_W, EMPTY_DESIGN, toNetworkDesign } from '../src/engine/design';
import type { Design } from '../src/engine/design';
import { runScenario } from '../src/engine/scenario';
import { siteForCounty } from '../src/relay/relay';
import { classifySite } from '../src/site/classify';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';
import type { SiteData } from '../src/site/osm';

const site = classifySite(
  (JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/sites/mankato-downtown.json'), 'utf8')) as { data: SiteData }).data,
);
const where = siteForCounty('27013')!;
const weather = calibrationWeather(where.zone);
const n = toNeighbourhood(site, EMPTY_SELECTION, where.zone, where.region);
const run = (d: Design) => runScenario(n, toNetworkDesign(d, weather), weather);

describe('balancing the loop', () => {
  const empty = balanceOf(run(EMPTY_DESIGN), EMPTY_DESIGN);

  it('reports what the buildings take and give, and the net, before any plant', () => {
    expect(empty.takenKWh).toBeGreaterThan(0);
    expect(empty.givenKWh).toBeGreaterThan(0);
    expect(empty.netKWh).toBeCloseTo(empty.takenKWh - empty.givenKWh, 6);
    expect(empty.addCapacityW).toBe(0);
    expect(empty.removeCapacityW).toBe(0);
  });

  it('peaks are net: never more than what one side alone asks', () => {
    expect(empty.peakAddW).toBeGreaterThan(0);
    expect(empty.peakRemoveW).toBeGreaterThan(0);
    expect(empty.peakAddW).toBeLessThanOrEqual(run(EMPTY_DESIGN).site.peakHeatingW);
  });

  it('counts each kind of plant on the side it serves', () => {
    const d: Design = {
      ...EMPTY_DESIGN,
      sources: [
        { id: 'b', kind: 'bore-field', boreholes: 100 },
        { id: 'a', kind: 'air-source', capacityW: 1e6 },
        { id: 't', kind: 'cooling-tower', capacityW: 2e6 },
        { id: 'w', kind: 'waste-heat', label: 'x', capacityW: 3e5, temperature: 30 },
        { id: 'r', kind: 'water', label: 'river', capacityW: 5e5, water: 'surface' },
      ],
    };
    const b = balanceOf(run(d), d);
    expect(b.addCapacityW).toBe(100 * BOREHOLE_PEAK_W + 1e6 + 3e5 + 5e5);
    expect(b.removeCapacityW).toBe(100 * BOREHOLE_PEAK_W + 1e6 + 2e6 + 5e5);
  });
});

describe('design diversity', () => {
  it('sizes plant at 80% of the worst hour, as HEET reports', () => {
    const b = balanceOf(run(EMPTY_DESIGN), EMPTY_DESIGN);
    expect(b.designAddW).toBeCloseTo(0.8 * b.peakAddW, 6);
    expect(b.designRemoveW).toBeCloseTo(0.8 * b.peakRemoveW, 6);
  });
});
