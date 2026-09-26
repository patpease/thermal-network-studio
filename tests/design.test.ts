import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { boreFieldArea, EMPTY_DESIGN, fromCandidate, nextId, suggestDesign, toNetworkDesign } from '../src/engine/design';
import type { Design } from '../src/engine/design';
import { runScenario } from '../src/engine/scenario';
import { siteForCounty } from '../src/relay/relay';
import { boreholeRoom, classifySite } from '../src/site/classify';
import { centroid } from '../src/site/geometry';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';
import type { SiteData } from '../src/site/osm';

const load = (key: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `fixtures/sites/${key}.json`), 'utf8')) as { data: SiteData };

const site = classifySite(load('mankato-downtown').data);
const { zone, region } = siteForCounty('27013')!;
const weather = calibrationWeather(zone);
const neighbourhood = toNeighbourhood(site, EMPTY_SELECTION, zone, region);
const asIs = runScenario(neighbourhood, { sources: [] }, weather);

function suggestion(): Design {
  return suggestDesign({
    peakHeatingW: asIs.site.peakHeatingW,
    peakCoolingW: asIs.site.peakCoolingW,
    sources: site.sources,
    centre: centroid(site.boundary),
    boreholeRoom: boreholeRoom(site.openSpaceM2),
  });
}

describe('toNetworkDesign', () => {
  it('builds each water temperature from the weather, once per kind', () => {
    const d: Design = {
      ...EMPTY_DESIGN,
      sources: [
        { id: 'a', kind: 'water', label: 'River', capacityW: 1e6, water: 'surface' },
        { id: 'b', kind: 'water', label: 'Lake', capacityW: 1e6, water: 'surface' },
        { id: 'c', kind: 'water', label: 'Sewer', capacityW: 1e6, water: 'sewer' },
      ],
    };
    const n = toNetworkDesign(d, weather);
    const [a, b, c] = n.sources;
    if (a?.kind !== 'water' || b?.kind !== 'water' || c?.kind !== 'water') throw new Error('kinds');
    expect(a.temperature).toHaveLength(8760);
    expect(a.temperature).toBe(b.temperature);
    expect(Math.min(...Array.from(c.temperature))).toBeGreaterThan(10);
  });

  it('carries the band and the retrofit through', () => {
    const n = toNetworkDesign({ ...EMPTY_DESIGN, band: { min: 4, max: 28 }, retrofit: 0.6 }, weather);
    expect(n.band).toEqual({ min: 4, max: 28 });
    expect(n.retrofit).toBe(0.6);
  });
});

describe('retrofit', () => {
  it('lowers the network case and leaves business as usual alone', () => {
    const design = toNetworkDesign(suggestion(), weather);
    const plain = runScenario(neighbourhood, design, weather);
    const deep = runScenario(neighbourhood, { ...design, retrofit: 0.6 }, weather);
    expect(deep.baseline.totalSiteKWh).toBe(plain.baseline.totalSiteKWh);
    expect(deep.site).toEqual(plain.site);
    expect(deep.network.totalSiteKWh).toBeLessThan(plain.network.totalSiteKWh);
    expect(deep.score.energyReduction).toBeGreaterThan(plain.score.energyReduction);
  });
});

describe('suggestDesign', () => {
  const design = suggestion();

  it('connects what was found, never what is already in a load', () => {
    const origins = new Set(design.sources.flatMap((s) => ('origin' in s && s.origin ? [s.origin] : [])));
    for (const s of site.sources) expect(origins.has(s.id)).toBe(s.exchange !== 'in-load');
  });

  it('keeps the bore field inside the open space', () => {
    const bores = design.sources.find((s) => s.kind === 'bore-field');
    if (bores?.kind === 'bore-field') expect(bores.boreholes).toBeLessThanOrEqual(boreholeRoom(site.openSpaceM2));
  });

  it('meets almost every hour and beats business as usual on Mankato', () => {
    const r = runScenario(neighbourhood, toNetworkDesign(design, weather), weather);
    expect(r.network.unmetHours).toBeLessThan(200);
    expect(r.score.total).toBeGreaterThan(20);
  });

  it('places every source it adds', () => {
    for (const s of design.sources) expect(s.at).toBeDefined();
  });
});

describe('helpers', () => {
  it('sizes a bore field footprint as a square grid', () => {
    expect(boreFieldArea({ boreholes: 100 })).toBe(3600);
    expect(boreFieldArea({ boreholes: 100, spacing: 5 })).toBe(2500);
  });

  it('never reuses an id', () => {
    const d: Design = { ...EMPTY_DESIGN, sources: [{ id: 'air-source-1', kind: 'air-source', capacityW: 1 }] };
    expect(nextId(d, 'air-source')).toBe('air-source-2');
  });

  it('turns a wastewater plant into a sewer exchanger', () => {
    const d = fromCandidate({ id: 'w', kind: 'wastewater', name: null, at: [0, 0], exchange: 'water', estimatedCapacityW: 1e6, temperature: null }, 'x');
    expect(d).toMatchObject({ kind: 'water', water: 'sewer', label: 'Wastewater' });
  });
});
