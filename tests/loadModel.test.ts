import { describe, expect, it } from 'vitest';

import { archetypeById } from '../src/loads/archetypes';
import { annualKWhPerM2, dhwLoads, HOURS, processCooling, spaceLoads } from '../src/loads/model';
import type { WeatherYear } from '../src/loads/model';

/**
 * The 1R1C model's physics, on synthetic weather where the right answer can
 * be worked by hand. Calibration is tested separately; nothing here depends
 * on the generated table.
 */

const constant = (celsius: number, ghi = 0): WeatherYear => ({
  temperature: new Float64Array(HOURS).fill(celsius),
  ghi: new Float64Array(HOURS).fill(ghi),
  firstWeekday: 0,
});

const hospital = archetypeById('hospital'); // occupied around the clock
const office = archetypeById('office-small'); // weekday hours, weekend setback
const NO_GAIN = { loss: 1, gain: 0 };

describe('steady state', () => {
  it('heating is exactly H·ΔT with no gains, once the mass has settled', () => {
    const { heating, cooling } = spaceLoads(hospital, NO_GAIN, constant(0));
    const H = hospital.envelopeUA + hospital.infiltrationUA + hospital.ventilationUA;
    expect(heating[4000]).toBeCloseTo(H * (hospital.setpoints.heatOccupied - 0), 9);
    expect(cooling[4000]).toBe(0);
  });

  it('the loss multiplier scales the load linearly', () => {
    const one = spaceLoads(hospital, NO_GAIN, constant(0)).heating[4000]!;
    const two = spaceLoads(hospital, { loss: 2, gain: 0 }, constant(0)).heating[4000]!;
    expect(two / one).toBeCloseTo(2, 9);
  });

  it('asks for nothing while the building floats inside the setpoint band', () => {
    const { heating, cooling } = spaceLoads(hospital, NO_GAIN, constant(22.5));
    expect(annualKWhPerM2(heating)).toBe(0);
    expect(annualKWhPerM2(cooling)).toBe(0);
  });

  it('cools against outdoor heat and gain, and never heats and cools in one hour', () => {
    const { heating, cooling } = spaceLoads(hospital, { loss: 1, gain: 1 }, constant(32, 400));
    expect(annualKWhPerM2(cooling)).toBeGreaterThan(0);
    for (let h = 0; h < HOURS; h++) expect(heating[h]! > 0 && cooling[h]! > 0).toBe(false);
  });
});

describe('schedules and mass', () => {
  it('sets back at the weekend: a cold Saturday needs less heat than a cold Wednesday', () => {
    const { heating } = spaceLoads(office, NO_GAIN, constant(-10));
    const day = (d: number) => heating.slice(d * 24, d * 24 + 24).reduce((a, b) => a + b, 0);
    // 1 January 2018 = Monday, so day 2 is a Wednesday and day 5 a Saturday.
    expect(day(5)).toBeLessThan(day(2));
  });

  it('pays the setback back on Monday morning: the recovery hour peaks', () => {
    const { heating } = spaceLoads(office, NO_GAIN, constant(-10));
    // Monday of week 2 is day 7; occupied from 06:00.
    const recovery = heating[7 * 24 + 6]!;
    const steadyOccupied = heating[2 * 24 + 12]!;
    expect(recovery).toBeGreaterThan(steadyOccupied);
  });

  it('a tighter envelope needs less heat', () => {
    const base = annualKWhPerM2(spaceLoads(office, NO_GAIN, constant(0)).heating);
    const tight = annualKWhPerM2(spaceLoads(office, NO_GAIN, constant(0), { envelopeFactor: 0.6 }).heating);
    expect(tight).toBeLessThan(base);
  });
});

describe('hot water and process', () => {
  it('DHW sums to its annual intensity whatever the profile', () => {
    for (const id of ['single-family', 'restaurant', 'hospital', 'office-small'] as const) {
      expect(annualKWhPerM2(dhwLoads(archetypeById(id), 25))).toBeCloseTo(25, 9);
    }
  });

  it('the residential draw peaks in the morning, not overnight', () => {
    const dhw = dhwLoads(archetypeById('single-family'), 20);
    expect(dhw[7]!).toBeGreaterThan(dhw[3]! * 5);
  });

  it('refrigeration is flat and sums to its intensity', () => {
    const p = processCooling(400);
    expect(annualKWhPerM2(p)).toBeCloseTo(400, 9);
    expect(p[0]).toBe(p[5000]);
  });
});
