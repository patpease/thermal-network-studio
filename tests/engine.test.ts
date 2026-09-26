import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
// @ts-expect-error — a plain .mjs build script, untyped on purpose.
import { levelizationWeights } from '../scripts/carbon/levelize.mjs';
import { FUEL_KG_PER_KWH, gridIntensity, monthOfHour } from '../src/engine/carbon';
import { minnesotaBalanceBand, neighbourhoodDemand, siteMetrics } from '../src/engine/demand';
import type { Demand } from '../src/engine/demand';
import { DEMO_DESIGN, DEMO_NEIGHBOURHOOD } from '../src/engine/demo';
import { COUNTY_REGION, GEA_REGIONS, LRMER_G_PER_KWH } from '../src/engine/generated/cambium';
import { airSourceCoolingCop, airSourceCop, coolingCop, heatingCop } from '../src/engine/heatpumps';
import { anchorDrift, simulateNetwork } from '../src/engine/network';
import { runScenario, scoreOf } from '../src/engine/scenario';
import { exchangerFraction, sewerTemperature, wetBulb } from '../src/engine/sources';

const weather = calibrationWeather('5A');

describe('grid carbon (Cambium 2023 LRMER)', () => {
  it('levelizes as the workbook does: CAISO 2025–2050 → 95.21 g/kWh', () => {
    // The published Mid-case CO₂ combustion values for CAISO, and the
    // workbook's own cached levelized result at its defaults.
    const published = [186.7, 140.2, 52.5, 29, 21.7, 16.9];
    const w: number[] = levelizationWeights();
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(published.reduce((s, v, k) => s + v * w[k]!, 0)).toBeCloseTo(95.209, 2);
  });

  it('has 18 regions, each a full month × hour table of plausible rates', () => {
    expect(GEA_REGIONS).toHaveLength(18);
    for (const r of GEA_REGIONS) {
      const flat = LRMER_G_PER_KWH[r].flat();
      expect(flat).toHaveLength(288);
      for (const v of flat) expect(v > 0 && v < 1500).toBe(true);
    }
  });

  it('maps counties to regions: Cook County IL is PJM West, Hennepin MN is MISO North', () => {
    expect(GEA_REGIONS[COUNTY_REGION['17031']!]).toBe('PJM_West');
    expect(GEA_REGIONS[COUNTY_REGION['27053']!]).toBe('MISO_North');
  });

  it('turns hours into months on a 365-day year', () => {
    expect(monthOfHour(0)).toBe(0);
    expect(monthOfHour(31 * 24 - 1)).toBe(0);
    expect(monthOfHour(31 * 24)).toBe(1);
    expect(monthOfHour(8759)).toBe(11);
    expect(gridIntensity('PJM_West')).toHaveLength(8760);
  });

  it('prices gas at EPA’s 53.06 kg/MMBtu', () => {
    expect(FUEL_KG_PER_KWH.natural_gas * 293.07107).toBeCloseTo(53.06, 6);
  });
});

describe('heat pumps', () => {
  it('heat better from a warmer loop, and cool better into a cooler one', () => {
    expect(heatingCop(20)).toBeGreaterThan(heatingCop(5));
    expect(coolingCop(15)).toBeGreaterThan(coolingCop(30));
  });

  it('never promise more than the clamp, or less than the floor', () => {
    expect(heatingCop(44)).toBeLessThanOrEqual(8);
    expect(heatingCop(-30)).toBeGreaterThanOrEqual(1.5);
    expect(airSourceCop(-25, 5)).toBe(0);
    expect(airSourceCoolingCop(50, 30)).toBe(0);
  });

  it('the air-source heat pump cools the loop better from cooler air', () => {
    expect(airSourceCoolingCop(20, 20)).toBeGreaterThan(airSourceCoolingCop(35, 20));
    expect(airSourceCoolingCop(35, 30)).toBeGreaterThanOrEqual(1);
  });
});

describe('sources', () => {
  it('wet bulb: Stull’s own check value, 20 °C at 50% → 13.7 °C', () => {
    expect(wetBulb(20, 50)).toBeCloseTo(13.7, 1);
    expect(wetBulb(30, undefined)).toBe(30);
  });

  it('an exchanger needs a temperature difference, and saturates', () => {
    expect(exchangerFraction(1)).toBe(0);
    expect(exchangerFraction(3.5)).toBeCloseTo(0.5, 9);
    expect(exchangerFraction(10)).toBe(1);
  });

  it('sewer water is coldest in February and warmest in August', () => {
    const t = sewerTemperature();
    expect(t[45 * 24]!).toBeLessThan(t[225 * 24]!);
    expect(Math.min(...t)).toBeGreaterThan(11);
  });
});

function synthetic(heat: number, cool: number): Demand {
  const f = (v: number) => new Float64Array(8760).fill(v);
  return { groups: [], heating: f(heat), dhw: f(0), cooling: f(cool), process: f(0), floorArea: 1 };
}

describe('site metrics (D24)', () => {
  it('DOC and LBI on demands that can be worked by hand', () => {
    const matched = siteMetrics(synthetic(1000, 1000), 1e6);
    expect(matched.doc).toBeCloseTo(1, 9);
    expect(matched.lbi).toBeCloseTo(0, 9);
    const heatingOnly = siteMetrics(synthetic(1000, 0), 1e6);
    expect(heatingOnly.doc).toBe(0);
    expect(heatingOnly.lbi).toBe(1);
  });

  it('density in GWh per km² per year', () => {
    // 1 MW all year = 8.76 GWh; over 1 km² → 8.76.
    expect(siteMetrics(synthetic(1e6, 0), 1e6).densityGWhPerKm2).toBeCloseTo(8.76, 6);
  });

  it('Minnesota’s bands, at their edges', () => {
    expect(minnesotaBalanceBand(0.8)).toBe('balanced');
    expect(minnesotaBalanceBand(0.85)).toBe('typical');
    expect(minnesotaBalanceBand(0.95)).toBe('heating-dominant');
  });

  it('a mixed-use quarter is not EPRI’s LBI 0.98: hot water and process cooling are in', () => {
    const m = siteMetrics(neighbourhoodDemand(DEMO_NEIGHBOURHOOD, weather), DEMO_NEIGHBOURHOOD.landArea);
    expect(m.lbi).toBeLessThan(0.5);
    expect(m.doc).toBeGreaterThan(0.1);
  });
});

describe('the network', () => {
  const demand = neighbourhoodDemand(DEMO_NEIGHBOURHOOD, weather);

  it('conserves energy: what the buildings need from the loop is what sources and backup supply', () => {
    const r = simulateNetwork(demand, DEMO_DESIGN, weather);
    const supplied = Object.values(r.sourceKWh).reduce((a, b) => a + b, 0);
    const needed = r.extractedKWh - r.rejectedKWh;
    expect(Math.abs(supplied - needed)).toBeLessThan(1e-6 * (r.extractedKWh + r.rejectedKWh));
  });

  it('with nothing built, every hour falls to backup', () => {
    const r = simulateNetwork(demand, { sources: [] }, weather);
    expect(r.unmetHours).toBe(8760);
    expect(r.systemCop).toBeLessThan(2);
  });

  it('the demo design meets almost every hour, and keeps the loop in its band', () => {
    const r = simulateNetwork(demand, DEMO_DESIGN, weather);
    expect(r.unmetHours).toBeLessThan(50);
    let inBand = 0;
    for (const t of r.loopTemperature) if (t >= 2 - 1e-9 && t <= 30 + 1e-9) inBand++;
    expect(inBand / 8760).toBeGreaterThan(0.99);
  });

  it('more boreholes never make the first year worse', () => {
    const small = simulateNetwork(demand, { sources: [{ kind: 'bore-field', id: 'b', spec: { boreholes: 200 } }] }, weather);
    const large = simulateNetwork(demand, { sources: [{ kind: 'bore-field', id: 'b', spec: { boreholes: 800 } }] }, weather);
    expect(large.unmetKWh).toBeLessThan(small.unmetKWh);
    expect(large.systemCop).toBeGreaterThan(small.systemCop);
  });

  it('an air-source heat pump alone both gives and takes heat, one or the other each hour', () => {
    const r = simulateNetwork(demand, { sources: [{ kind: 'air-source', id: 'a', capacityW: 1e8 }] }, weather);
    expect(r.sourceInKWh['a']).toBeGreaterThan(0);
    expect(r.sourceOutKWh['a']).toBeGreaterThan(0);
    expect(r.electricityKWh.airSource).toBeGreaterThan(0);
    const supplied = Object.values(r.sourceKWh).reduce((a, b) => a + b, 0);
    expect(Math.abs(supplied - (r.extractedKWh - r.rejectedKWh))).toBeLessThan(1e-6 * (r.extractedKWh + r.rejectedKWh));
    // Only the heating cutoff leaves anything to backup in this climate.
    const cold = Array.from(weather.temperature).filter((t) => t < -20).length;
    expect(r.unmetHours).toBeLessThanOrEqual(cold);
  });

  it('in cooling hours the tower goes first and the air-source heat pump takes the rest', () => {
    const tower = { kind: 'cooling-tower' as const, id: 't', capacityW: 1e8 };
    const air = { kind: 'air-source' as const, id: 'a', capacityW: 1e8 };
    const both = simulateNetwork(demand, { sources: [air, tower] }, weather);
    const towerOnly = simulateNetwork(demand, { sources: [tower] }, weather);
    expect(both.sourceOutKWh['t']).toBeCloseTo(towerOnly.sourceOutKWh['t']!, 3);
  });

  it('projects 25 years of drift whenever there is a bore field, and none without', () => {
    expect(simulateNetwork(demand, DEMO_DESIGN, weather).drift).toHaveLength(25);
    expect(simulateNetwork(demand, { sources: [] }, weather).drift).toBeNull();
  });
});

describe('the score (D4, D20)', () => {
  it('is the mean of two clamped percentages, and keeps the unclamped ones', () => {
    const s = scoreOf({ totalSiteKWh: 100, carbonKg: 100 }, { totalSiteKWh: 40, carbonKg: 130 });
    expect(s.energyReduction).toBeCloseTo(0.6, 9);
    expect(s.carbonReduction).toBeCloseTo(-0.3, 9);
    expect(s.efficiencyPoints).toBe(60);
    expect(s.carbonPoints).toBe(0);
    expect(s.total).toBe(30);
  });

  it('golden: the demo scores what it scored when this test was written', () => {
    // A change here means the physics or the data moved. Look at why before
    // updating the number.
    const r = runScenario(DEMO_NEIGHBOURHOOD, DEMO_DESIGN, weather);
    expect(r.score.total).toBeGreaterThanOrEqual(67);
    expect(r.score.total).toBeLessThanOrEqual(69);
    expect(r.network.systemCop).toBeGreaterThan(3.9);
  });

  it('business as usual in a 5A quarter burns mostly gas', () => {
    const r = runScenario(DEMO_NEIGHBOURHOOD, DEMO_DESIGN, weather);
    expect((r.baseline.siteKWh['natural_gas'] ?? 0) / r.baseline.totalSiteKWh).toBeGreaterThan(0.4);
    expect(r.network.carbonKg).toBeLessThan(r.baseline.carbonKg);
  });
});

describe('the drift, anchored to the simulated year', () => {
  const demand = neighbourhoodDemand(DEMO_NEIGHBOURHOOD, weather);
  it('year 1 is the hour-by-hour year exactly', () => {
    const r = simulateNetwork(demand, DEMO_DESIGN, weather);
    let min = Infinity;
    let max = -Infinity;
    for (const t of r.loopTemperature) {
      min = Math.min(min, t);
      max = Math.max(max, t);
    }
    expect(r.drift![0]!.minFluid).toBeCloseTo(min, 9);
    expect(r.drift![0]!.maxFluid).toBeCloseTo(max, 9);
  });

  it('later years keep the projection’s change from its own year 1', () => {
    const projected = [
      { year: 1, minFluid: 5, maxFluid: 20, meanWall: 10 },
      { year: 2, minFluid: 6, maxFluid: 22, meanWall: 11 },
    ];
    const loop = Float64Array.from([4, 27]);
    const a = anchorDrift(projected, loop);
    expect(a[0]).toMatchObject({ minFluid: 4, maxFluid: 27 });
    expect(a[1]).toMatchObject({ minFluid: 5, maxFluid: 29, meanWall: 11 });
  });
});
