import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { buildingLoads } from '../src/loads/building';
import { peakCheck, RULE_OF_THUMB, RULE_OF_THUMB_W_PER_M2 } from '../src/engine/ruleOfThumb';
import { toDisplay } from '../src/units/units';

const weather = calibrationWeather('5A');

describe('the peak check against rules of thumb', () => {
  it('holds the rules as written and in canonical W/m²', () => {
    expect(RULE_OF_THUMB).toEqual({ coolingFt2PerTon: 400, heatingBtuhPerFt2: 30 });
    expect(toDisplay('coolingIntensity', RULE_OF_THUMB_W_PER_M2.cooling, 'ip')).toBeCloseTo(400, 6);
    expect(toDisplay('heatingIntensity', RULE_OF_THUMB_W_PER_M2.heating, 'ip')).toBeCloseTo(30, 6);
  });

  it('is the PEAK hour of space heating and cooling, not the annual sum and not hot water', () => {
    const spec = { archetype: 'office-small', zone: '5A', floorArea: 1000 } as const;
    const loads = buildingLoads(spec, weather);
    const check = peakCheck(spec, weather);
    expect(check.heatingWPerM2).toBeCloseTo(Math.max(...loads.heating) / 1000, 6);
    expect(check.coolingWPerM2).toBeCloseTo(Math.max(...loads.cooling) / 1000, 6);
    const annualPerM2 = loads.heating.reduce((s, v) => s + v, 0) / 1000;
    expect(check.heatingWPerM2).toBeLessThan(annualPerM2 / 100);
    const withDhw = Math.max(...loads.heating.map((v, h) => v + loads.dhw[h]!)) / 1000;
    expect(check.heatingWPerM2).toBeLessThan(withDhw);
  });

  it('ratios are of LOADS, so a cooling load above the rule reads above it in ft²/ton too', () => {
    const check = peakCheck({ archetype: 'office-large', zone: '5A' }, weather);
    expect(check.coolingRatio).toBeCloseTo(check.coolingWPerM2 / RULE_OF_THUMB_W_PER_M2.cooling, 9);
    if (check.coolingRatio > 1) expect(toDisplay('coolingIntensity', check.coolingWPerM2, 'ip')).toBeLessThan(400);
  });

  it('follows the vintage: an older building peaks higher than a newer one', () => {
    const old = peakCheck({ archetype: 'single-family', zone: '5A', vintage: 'pre-1950' }, weather);
    const recent = peakCheck({ archetype: 'single-family', zone: '5A', vintage: '2000+' }, weather);
    expect(old.heatingWPerM2).toBeGreaterThan(recent.heatingWPerM2);
  });
});
