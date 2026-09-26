// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { EMPTY_DESIGN, suggestDesign, toNetworkDesign } from '../src/engine/design';
import { runScenario } from '../src/engine/scenario';
import { siteForCounty } from '../src/relay/relay';
import { boreholeRoom, classifySite } from '../src/site/classify';
import { centroid } from '../src/site/geometry';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';
import type { SiteData } from '../src/site/osm';
import { ResultsPanel } from '../src/ui/ResultsPanel';

afterEach(cleanup);

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

describe('ResultsPanel', () => {
  it('draws the score, the flow, the year, the months and the drift', () => {
    render(<ResultsPanel result={result} design={design} weather={weather} running={false} units="ip" hasSite />);
    for (const title of [/^Score \d+ of 100$/, /^Winter electric peak/, /Where the loop’s heat comes from/, /Loop temperature through the year/, /Heat shared between buildings/, /The ground over 25 years/]) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
  });

  it('gives every chart a table, in the displayed units', () => {
    const { container } = render(<ResultsPanel result={result} design={design} weather={weather} running={false} units="si" hasSite />);
    const tables = container.querySelectorAll('.visually-hidden table');
    expect(tables).toHaveLength(6);
    expect(container.textContent).toContain('MWh');
    expect(container.textContent).not.toContain('MMBtu');
    expect(container.textContent).not.toContain('°F');
  });

  it('never prints NaN or a stray undefined', () => {
    const { container } = render(<ResultsPanel result={result} design={design} weather={weather} running={false} units="ip" hasSite />);
    expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('asks for a design before drawing anything', () => {
    render(<ResultsPanel result={result} design={EMPTY_DESIGN} weather={weather} running={false} units="ip" hasSite />);
    expect(screen.getByText(/Add a source on the Design tab first/)).toBeTruthy();
  });
});
