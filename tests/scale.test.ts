import { describe, expect, it } from 'vitest';

import { SCALE_POINT_TONS, scaleOf, TON_W } from '../src/engine/scale';
import { networkSize } from '../src/ui/format';

describe('network scale against HEET’s 300-ton point', () => {
  it('measures the larger of peak heating and peak cooling, in tons', () => {
    expect(scaleOf({ peakHeatingW: 600 * TON_W, peakCoolingW: 200 * TON_W }, 10).tons).toBeCloseTo(600, 6);
    expect(scaleOf({ peakHeatingW: 100 * TON_W, peakCoolingW: 150 * TON_W }, 10).tons).toBeCloseTo(150, 6);
  });

  it('below the point, estimates how many more buildings like these would reach it', () => {
    const s = scaleOf({ peakHeatingW: 120 * TON_W, peakCoolingW: 0 }, 40); // 3 tons each
    expect(s.belowPoint).toBe(true);
    expect(s.shortTons).toBeCloseTo(180, 6);
    expect(s.moreBuildings).toBe(60);
  });

  it('at or above the point, asks for nothing', () => {
    const s = scaleOf({ peakHeatingW: SCALE_POINT_TONS * TON_W, peakCoolingW: 0 }, 5);
    expect(s).toMatchObject({ belowPoint: false, shortTons: 0, moreBuildings: 0 });
  });

  it('with nothing connected, gives no estimate rather than a division by zero', () => {
    expect(scaleOf({ peakHeatingW: 0, peakCoolingW: 0 }, 0).moreBuildings).toBeNull();
  });

  it('prints tons in IP and MW in SI', () => {
    expect(networkSize(300, 'ip')).toBe('300 tons');
    expect(networkSize(300, 'si')).toBe('1.06 MW');
  });
});
