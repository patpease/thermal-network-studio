import { describe, expect, it } from 'vitest';

import { erf, fieldG, flsResponse, gAt, tabulate } from '../src/engine/gfunction';
import { boreField, layout, projectDrift, yearStepper } from '../src/engine/ground';

const ALPHA = 1e-6;
const DAY = 86400;
const YEAR = 365 * DAY;

/** E₁ by its series, good for small arguments. */
function E1(x: number): number {
  let sum = -0.5772156649 - Math.log(x);
  let term = 1;
  for (let k = 1; k < 80; k++) {
    term *= -x / k;
    sum -= term / k;
  }
  return sum;
}

describe('erf', () => {
  it('matches known values to 1e-6', () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(0.5)).toBeCloseTo(0.5204999, 6);
    expect(erf(1)).toBeCloseTo(0.8427008, 6);
    expect(erf(-1)).toBeCloseTo(-0.8427008, 6);
    expect(erf(3)).toBeCloseTo(0.9999779, 6);
  });
});

describe('the finite line source', () => {
  it('is the infinite line source before the borehole ends matter', () => {
    // At a day and a month the FLS and ILS must agree: heat has not yet
    // reached either end of a 150 m borehole.
    for (const days of [1, 30]) {
      const t = days * DAY;
      const ils = 0.5 * E1((0.075 * 0.075) / (4 * ALPHA * t));
      expect(flsResponse(0.075, t, ALPHA, 150, 2) / ils).toBeCloseTo(1, 2);
    }
  });

  it('levels off at long times, below ln(H/2r_b)', () => {
    const late = flsResponse(0.075, 1000 * YEAR, ALPHA, 150, 2);
    const later = flsResponse(0.075, 10_000 * YEAR, ALPHA, 150, 2);
    expect(later - late).toBeLessThan(0.05);
    expect(later).toBeLessThan(Math.log(150 / (2 * 0.075)));
  });

  it('a field responds more than one borehole, and more with time', () => {
    const one = { nx: 1, ny: 1, spacing: 6, depth: 150, buried: 2, radius: 0.075 };
    const grid = { ...one, nx: 8, ny: 8 };
    expect(fieldG(grid, YEAR, ALPHA)).toBeGreaterThan(fieldG(one, YEAR, ALPHA));
    expect(fieldG(grid, 25 * YEAR, ALPHA)).toBeGreaterThan(fieldG(grid, YEAR, ALPHA));
  });

  it('the tabulated g interpolates the direct value to within 2%', () => {
    const f = { nx: 6, ny: 6, spacing: 6, depth: 150, buried: 2, radius: 0.075 };
    const table = tabulate(f, ALPHA, 3600, 30 * YEAR);
    for (const t of [3 * DAY, 200 * DAY, 7.3 * YEAR]) {
      expect(gAt(table, t) / fieldG(f, t, ALPHA)).toBeCloseTo(1, 1);
    }
  });
});

describe('the bore field', () => {
  it('lays out the squarest grid that holds the count', () => {
    expect(layout(100)).toEqual({ nx: 10, ny: 10 });
    expect(layout(101)).toEqual({ nx: 11, ny: 10 });
    expect(layout(1)).toEqual({ nx: 1, ny: 1 });
  });

  it('with no load, the fluid sits at the undisturbed ground temperature', () => {
    const field = boreField({ boreholes: 16 }, 11);
    const s = yearStepper(field);
    for (let d = 0; d < 30; d++) {
      s.beginDay(d);
      for (let h = 0; h < 24; h++) {
        const { A } = s.coefficients(h);
        expect(A).toBeCloseTo(11, 9);
        s.record(0);
      }
    }
  });

  it('steady extraction cools the fluid, and keeps cooling it', () => {
    const field = boreField({ boreholes: 16 }, 11);
    const s = yearStepper(field);
    const Q = 16 * 150 * 30; // 30 W/m
    const fluidAt: number[] = [];
    for (let d = 0; d < 365; d++) {
      s.beginDay(d);
      for (let h = 0; h < 24; h++) {
        const { A, B } = s.coefficients(h);
        if (h === 12) fluidAt.push(A - B * Q);
        s.record(Q);
      }
    }
    expect(fluidAt[0]!).toBeLessThan(11);
    expect(fluidAt[364]!).toBeLessThan(fluidAt[30]!);
    expect(fluidAt[30]!).toBeLessThan(fluidAt[1]!);
  });

  it('a balanced year does not drift; an unbalanced one does', () => {
    const field = boreField({ boreholes: 25 }, 10);
    const balanced = Float64Array.from({ length: 365 }, (_, d) => 25 * Math.cos((2 * Math.PI * d) / 365));
    const unbalanced = balanced.map((q) => q + 10); // net 10 W/m extracted
    const b = projectDrift(field, balanced);
    const u = projectDrift(field, unbalanced);
    expect(Math.abs(b[24]!.meanWall - b[2]!.meanWall)).toBeLessThan(0.1);
    expect(u[24]!.meanWall).toBeLessThan(u[2]!.meanWall - 0.5);
    expect(u[24]!.minFluid).toBeLessThan(b[24]!.minFluid);
  });
});
