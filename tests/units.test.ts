import { describe, expect, it } from 'vitest';

import { DEFAULT_UNITS, fromDisplay, LABELS, toDisplay } from '../src/units/units';
import type { Quantity } from '../src/units/units';

const QUANTITIES: Quantity[] = ['temperature', 'temperatureDelta', 'power', 'energy', 'area', 'length', 'powerLarge', 'energyLarge', 'density', 'loadIntensity', 'coolingIntensity'];

describe('units', () => {
  it('defaults to IP, because the tool is US-first', () => {
    expect(DEFAULT_UNITS).toBe('ip');
  });

  it('SI is canonical: the engine value passes through unchanged', () => {
    for (const q of QUANTITIES) expect(toDisplay(q, 12.5, 'si')).toBe(12.5);
  });

  it('round-trips every quantity in both directions', () => {
    for (const q of QUANTITIES) {
      for (const v of [-40, 0, 18, 1234.5]) {
        expect(fromDisplay(q, toDisplay(q, v, 'ip'), 'ip')).toBeCloseTo(v, 9);
        expect(toDisplay(q, fromDisplay(q, v, 'ip'), 'ip')).toBeCloseTo(v, 9);
      }
    }
  });

  it('lands on known landmarks', () => {
    expect(toDisplay('temperature', 0, 'ip')).toBeCloseTo(32, 9);
    expect(toDisplay('temperature', -40, 'ip')).toBeCloseTo(-40, 9);
    expect(toDisplay('power', 1000, 'ip')).toBeCloseTo(3412.14, 1);
    expect(toDisplay('energy', 1, 'ip')).toBeCloseTo(3.41214, 4);
    expect(toDisplay('area', 1, 'ip')).toBeCloseTo(10.7639, 3);
    expect(toDisplay('length', 150, 'ip')).toBeCloseTo(492.1, 1);
  });

  it('density lands on EPRI’s own pairing: 50 GWh/km² ≈ 440 billion Btu/mi²', () => {
    // EPRI 3002029431 p. 13: "50 to 150 GWh/km²/year (approximately 400–1,300
    // billion BTU/mi²/year)".
    expect(toDisplay('density', 50, 'ip')).toBeGreaterThan(400);
    expect(toDisplay('density', 150, 'ip')).toBeLessThan(1_350);
  });

  it('a temperature DIFFERENCE is not a temperature', () => {
    // 10 K of difference is 18 °F of difference, not 50 °F. Converting a delta
    // as a temperature adds the 32 °F offset to it.
    expect(toDisplay('temperatureDelta', 10, 'ip')).toBeCloseTo(18, 9);
    expect(toDisplay('temperature', 10, 'ip')).toBeCloseTo(50, 9);
  });

  it('labels every quantity in both systems', () => {
    for (const q of QUANTITIES) {
      expect(LABELS.ip[q]).toBeTruthy();
      expect(LABELS.si[q]).toBeTruthy();
    }
    expect(LABELS.si.temperatureDelta).toBe('K');
  });
});

describe('peak load per floor area', () => {
  it('lands on the rules of thumb engineers write: 30 Btu/h·ft² and 400 ft²/ton', () => {
    // 30 Btu/h·ft² and 400 ft²/ton (12,000 Btu/h over 400 ft²) are both 94.64 W/m².
    expect(toDisplay('loadIntensity', 94.637, 'ip')).toBeCloseTo(30, 2);
    expect(toDisplay('coolingIntensity', 94.637, 'ip')).toBeCloseTo(400, 0);
    expect(LABELS.ip.coolingIntensity).toBe('ft²/ton');
    expect(LABELS.si.coolingIntensity).toBe('W/m²');
  });

  it('ft²/ton is a reciprocal: a bigger load prints a SMALLER number', () => {
    expect(toDisplay('coolingIntensity', 200, 'ip')).toBeLessThan(toDisplay('coolingIntensity', 100, 'ip'));
    expect(toDisplay('loadIntensity', 200, 'ip')).toBeGreaterThan(toDisplay('loadIntensity', 100, 'ip'));
  });
});
