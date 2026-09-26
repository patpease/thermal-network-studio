import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { neighbourhoodDemand } from '../src/engine/demand';
import { DEMO_DESIGN, DEMO_NEIGHBOURHOOD } from '../src/engine/demo';
import { BLE, bleCoolingCop, bleElectricity, bleHeatingCop, gridImpact } from '../src/engine/grid';
import { runScenario } from '../src/engine/scenario';
import { toDisplay, LABELS } from '../src/units/units';

const weather = calibrationWeather('5A');

describe('building-level electrification', () => {
  it('heats better in milder air, and falls to resistance in the deep cold', () => {
    expect(bleHeatingCop(8)).toBeGreaterThan(bleHeatingCop(-15));
    expect(bleHeatingCop(BLE.resistanceBelow - 1)).toBe(1);
    expect(bleHeatingCop(-15)).toBeGreaterThan(1.5);
  });

  it('cools better in milder air', () => {
    expect(bleCoolingCop(25)).toBeGreaterThan(bleCoolingCop(38));
  });

  it('serves every hour of the same loads', () => {
    const demand = neighbourhoodDemand(DEMO_NEIGHBOURHOOD, weather);
    const e = bleElectricity(demand, weather);
    let heat = 0;
    let elec = 0;
    for (let h = 0; h < 8760; h++) {
      heat += demand.heating[h]! + demand.dhw[h]!;
      elec += e[h]!;
    }
    expect(elec).toBeGreaterThan(0);
    expect(elec).toBeLessThan(heat);
  });
});

describe('grid impact', () => {
  it('takes the largest hour in each season, and the reduction against BLE', () => {
    const flat = new Float64Array(8760).fill(100);
    const spike = new Float64Array(8760).fill(100);
    spike[10] = 400; // 10 January
    spike[4400] = 300; // early July
    const g = gridImpact(flat, spike, flat);
    expect(g.ble.winterW).toBe(400);
    expect(g.ble.summerW).toBe(300);
    expect(g.winterReduction).toBeCloseTo(0.75, 9);
    expect(g.summerReduction).toBeCloseTo(2 / 3, 9);
    expect(g.today.annualKWh).toBeCloseTo(876, 9);
  });

  it('is on every scenario result', () => {
    const r = runScenario(DEMO_NEIGHBOURHOOD, DEMO_DESIGN, weather);
    expect(r.grid.ble.winterW).toBeGreaterThan(r.grid.today.winterW);
    expect(Number.isFinite(r.grid.winterReduction)).toBe(true);
  });

  it('prints electric demand in kW in both unit systems', () => {
    expect(LABELS.ip.electricPower).toBe('kW');
    expect(LABELS.si.electricPower).toBe('kW');
    expect(toDisplay('electricPower', 250_000, 'ip')).toBe(250);
    expect(toDisplay('electricPower', 250_000, 'si')).toBe(250);
  });
});
