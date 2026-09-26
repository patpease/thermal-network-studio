// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { suggestDesign, toNetworkDesign } from '../src/engine/design';
import type { Design } from '../src/engine/design';
import { coldestLoop, DEFAULT_BAND, GLYCOL_BELOW_C } from '../src/engine/network';
import { runScenario } from '../src/engine/scenario';
import { siteForCounty } from '../src/relay/relay';
import { boreholeRoom, classifySite, HOME_AVERAGE_HEAT_W, SUPERMARKET_HOMES } from '../src/site/classify';
import { centroid } from '../src/site/geometry';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';
import type { SiteData } from '../src/site/osm';
import { DesignPanel } from '../src/ui/DesignPanel';

afterEach(cleanup);

const site = classifySite(
  (JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/sites/mankato-downtown.json'), 'utf8')) as { data: SiteData }).data,
);
const where = siteForCounty('27013')!;
const weather = calibrationWeather(where.zone);
const n = toNeighbourhood(site, EMPTY_SELECTION, where.zone, where.region);
const asIs = runScenario(n, { sources: [] }, weather);
const base = suggestDesign({
  peakHeatingW: asIs.site.peakHeatingW,
  peakCoolingW: asIs.site.peakCoolingW,
  sources: site.sources,
  centre: centroid(site.boundary),
  boreholeRoom: boreholeRoom(site.openSpaceM2),
});
const run = (d: Design) => runScenario(n, toNetworkDesign(d, weather), weather);

describe('the loop band', () => {
  it('defaults to 40–90 °F, HEET’s range', () => {
    expect(DEFAULT_BAND.min * 1.8 + 32).toBeCloseTo(40, 9);
    expect(DEFAULT_BAND.max * 1.8 + 32).toBeCloseTo(90, 9);
    expect(GLYCOL_BELOW_C * 1.8 + 32).toBeCloseTo(40, 9);
  });
});

describe('the glycol flag', () => {
  it('a loop held at the default band holds 40 °F in year one; its bore field can still drift below later', () => {
    const c = coldestLoop(run(base).network);
    expect(c.firstBelowYear === null || c.firstBelowYear > 1).toBe(true);
  });

  it('shows when the loop goes below 40 °F, and links to the Learn tab', () => {
    const cold: Design = { ...base, band: { min: -3, max: 30 } };
    const r = run(cold);
    expect(coldestLoop(r.network)).toMatchObject({ firstBelowYear: 1 });
    const onLearn = vi.fn();
    render(<DesignPanel site={site} design={cold} result={r} running={false} placing={null} units="ip" onUpdate={() => {}} onPlace={() => {}} onSuggest={() => {}} onLearn={onLearn} />);
    expect(screen.getAllByText(/Needs glycol\. The loop reaches .* °F, below 40 °F\./).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'About glycol' })[0]!);
    expect(onLearn).toHaveBeenCalledWith('learn-glycol');
  });

  it('stays silent on a loop that holds 40 °F in every year (no bore field: the loop sits at its band)', () => {
    const noField: Design = { ...base, sources: base.sources.filter((s) => s.kind !== 'bore-field') };
    expect(coldestLoop(run(noField).network).firstBelowYear).toBeNull();
    render(<DesignPanel site={site} design={noField} result={run(noField)} running={false} placing={null} units="ip" onUpdate={() => {}} onPlace={() => {}} onSuggest={() => {}} onLearn={() => {}} />);
    expect(screen.queryByText(/Needs glycol/)).toBeNull();
  });
});

describe('a supermarket outside the boundary', () => {
  it('is a heat source sized at 25 homes; one inside is part of its own load', () => {
    const [lon, lat] = [-93.2, 45];
    const d = 0.002;
    const ring: [number, number][] = [
      [lon, lat],
      [lon + d, lat],
      [lon + d, lat + d],
      [lon, lat + d],
      [lon, lat],
    ];
    const shop = (id: string, at: [number, number]) => ({ id, tags: { shop: 'supermarket', name: id }, geometry: { type: 'point' as const, at } });
    const s = classifySite({ version: 1, boundary: ring, skipped: 0, features: [shop('inside', [lon + d / 2, lat + d / 2]), shop('outside', [lon + d + 0.0015, lat + d / 2])] });
    expect(s.sources.find((x) => x.id === 'outside')).toMatchObject({ exchange: 'waste-heat', estimatedCapacityW: SUPERMARKET_HOMES * HOME_AVERAGE_HEAT_W });
    expect(s.sources.find((x) => x.id === 'inside')?.exchange).toBe('in-load');
    expect(SUPERMARKET_HOMES * HOME_AVERAGE_HEAT_W).toBe(80_000);
  });
});
