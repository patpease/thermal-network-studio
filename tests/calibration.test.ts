import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { ARCHETYPES, archetypeById } from '../src/loads/archetypes';
import { buildingLoads } from '../src/loads/building';
import { BASELINE, CALIBRATION, CALIBRATION_DECISIONS, VINTAGE_FACTORS } from '../src/loads/generated/calibration';
import { annualKWhPerM2, spaceLoads } from '../src/loads/model';
import { VINTAGE_BANDS, ZONES } from '../src/loads/zones';

/**
 * The golden tests for D22: the committed calibration table must still be what
 * the committed model produces on the committed weather. A change to the model
 * or the priors without `npm run calibrate:fit` fails here, which is the point
 * — a table fitted to a model that no longer exists is the silent version of
 * this bug.
 */

const targets = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../data/calibration/targets.json'), 'utf8'),
) as { attribution: string; groups: { source: string; zone: string; floorAreaM2: number; dhwFloorAreaM2: number }[] };

describe('the generated table matches the model', () => {
  for (const archetype of ARCHETYPES) {
    it(`${archetype.id}: every zone re-simulates to the fitted loads`, () => {
      for (const zone of ZONES) {
        const c = CALIBRATION[archetype.id][zone];
        const loads = spaceLoads(archetype, c, calibrationWeather(zone));
        // The table rounds to 4 significant figures; 0.5% covers that and
        // nothing else.
        const near = (actual: number, expected: number) =>
          expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(0.005 * expected, 0.01));
        near(annualKWhPerM2(loads.heating), c.fitted.heating);
        near(annualKWhPerM2(loads.cooling), c.fitted.cooling);
      }
    });
  }
});

describe('the fit reproduces the stock', () => {
  it('every archetype × zone is exact to 2% or 1 kWh/m²', () => {
    for (const archetype of ARCHETYPES) {
      for (const zone of ZONES) {
        const c = CALIBRATION[archetype.id][zone];
        expect(c.exact, `${archetype.id} ${zone}`).toBe(true);
      }
    }
  });

  it('every multiplier is positive and finite, and every target non-negative', () => {
    for (const archetype of ARCHETYPES) {
      for (const zone of ZONES) {
        const c = CALIBRATION[archetype.id][zone];
        for (const v of [c.loss, c.gain]) expect(Number.isFinite(v) && v > 0).toBe(true);
        for (const v of Object.values(c.targets)) expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('a borrowed zone says where from, and the decision is recorded', () => {
    for (const archetype of ARCHETYPES) {
      for (const zone of ZONES) {
        const { borrowedFrom } = CALIBRATION[archetype.id][zone];
        if (borrowedFrom) {
          expect(CALIBRATION_DECISIONS.some((d) => d.startsWith(`${archetype.id} ${zone}:`))).toBe(true);
        }
      }
    }
  });
});

describe('what the stock says, kept honest', () => {
  it('homes in a cold zone still carry real cooling — not EPRI’s near-zero', () => {
    // EPRI's Framingham run found LBI 0.98 from space loads alone. Calibrated to
    // ResStock, a 5A single-family home cools about a quarter as much as it heats.
    // If this ever reads near zero, the calibration has been lost, not improved.
    const { heating, cooling } = CALIBRATION['single-family']['5A'].targets;
    expect(cooling / heating).toBeGreaterThan(0.1);
  });

  it('supermarkets carry refrigeration; offices do not', () => {
    expect(CALIBRATION.supermarket['5A'].targets.process).toBeGreaterThan(100);
    expect(CALIBRATION['office-small']['5A'].targets.process).toBeLessThan(10);
  });

  it('residential hot water is in, from ResStock’s delivered load', () => {
    for (const zone of ZONES) expect(CALIBRATION['single-family'][zone].targets.dhw).toBeGreaterThan(5);
  });

  it('California ComStock rows are excluded from DHW, per the release’s known issue', () => {
    const californian = targets.groups.filter((g) => g.source === 'comstock' && g.zone === '3C');
    expect(californian.length).toBeGreaterThan(0);
    // 3C is almost all California: its DHW denominator must be far smaller.
    const all = californian.reduce((s, g) => s + g.floorAreaM2, 0);
    const dhw = californian.reduce((s, g) => s + g.dhwFloorAreaM2, 0);
    expect(dhw / all).toBeLessThan(0.5);
  });

  it('carries the attribution NLR asks for', () => {
    expect(targets.attribution).toContain('National Laboratory of the Rockies');
  });
});

describe('vintage (D23)', () => {
  it('every factor sits inside the clamp', () => {
    for (const archetype of ARCHETYPES) {
      for (const band of VINTAGE_BANDS) {
        const f = VINTAGE_FACTORS[archetype.id][band];
        expect(f).toBeGreaterThanOrEqual(0.5);
        expect(f).toBeLessThanOrEqual(2);
      }
    }
  });

  it('newer homes lose less heat than older ones', () => {
    for (const id of ['single-family', 'small-multifamily', 'large-multifamily'] as const) {
      const f = VINTAGE_FACTORS[id];
      expect(f['pre-1950']).toBeGreaterThan(f['1950-1979']);
      expect(f['1950-1979']).toBeGreaterThan(f['1980-1999']);
      expect(f['1980-1999']).toBeGreaterThan(f['2000+']);
    }
  });
});

describe('business as usual (D21)', () => {
  it('heating fuel shares sum to one wherever there is heating fuel', () => {
    for (const archetype of ARCHETYPES) {
      for (const zone of ZONES) {
        const shares = Object.values(BASELINE[archetype.id][zone].heatingFuelShare);
        if (shares.length === 0) continue;
        expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
      }
    }
  });

  it('gas dominates heating in cold-climate homes', () => {
    const shares = BASELINE['single-family']['5A'].heatingFuelShare;
    expect(shares['natural_gas'] ?? 0).toBeGreaterThan(0.5);
  });
});

describe('a building', () => {
  const weather = calibrationWeather('5A');

  it('is its unit loads times its floor area', () => {
    const small = buildingLoads({ archetype: 'office-small', zone: '5A', floorArea: 500 }, weather);
    const large = buildingLoads({ archetype: 'office-small', zone: '5A', floorArea: 1500 }, weather);
    expect(annualKWhPerM2(large.heating) / annualKWhPerM2(small.heating)).toBeCloseTo(3, 9);
  });

  it('at stock-average vintage lands on the stock intensity', () => {
    const b = buildingLoads({ archetype: 'single-family', zone: '5A', floorArea: 1 }, weather);
    expect(annualKWhPerM2(b.heating)).toBeCloseTo(CALIBRATION['single-family']['5A'].fitted.heating, 0);
    expect(annualKWhPerM2(b.dhw)).toBeCloseTo(CALIBRATION['single-family']['5A'].targets.dhw, 6);
  });

  it('a pre-1950 home heats more than a new one, and a retrofit closes the gap', () => {
    const at = (vintage: '2000+' | 'pre-1950', retrofit = 1) =>
      annualKWhPerM2(
        buildingLoads({ archetype: 'single-family', zone: '5A', floorArea: 1, vintage, retrofit }, weather).heating,
      );
    expect(at('pre-1950')).toBeGreaterThan(at('2000+'));
    expect(at('pre-1950', 0.6)).toBeLessThan(at('pre-1950'));
  });

  it('refuses a building with no floor', () => {
    expect(() => buildingLoads({ archetype: 'hotel', zone: '5A', floorArea: 0 }, weather)).toThrow();
  });

  it('knows every archetype it was handed', () => {
    for (const a of ARCHETYPES) expect(archetypeById(a.id)).toBe(a);
  });
});
