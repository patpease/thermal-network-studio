/**
 * What balancing the loop asks of the plant, beside what the design has.
 *
 * The buildings' heat pumps take heat from the loop and put heat into it.
 * Whatever does not cancel hour by hour is the plant's job: the net heat to
 * add or remove in the worst hour, and the net over the year. A bore field
 * counts on both sides at its rule-of-thumb peak rate, the same one the
 * suggestion uses.
 */
import type { Design } from './design.ts';
import { BOREHOLE_PEAK_W } from './design.ts';
import type { ScenarioResult } from './scenario.ts';

/**
 * Design diversity: plant sized at 80% of the combined peak, as HEET reports
 * for networks where loads cancel (Definition of Geothermal Networks, 2023).
 * Applied to the worst hour's NET need, which already carries the hour-by-hour
 * cancelling the simulation sees.
 */
export const DESIGN_DIVERSITY = 0.8;

export interface Balance {
  /** kWh/yr the buildings take from, and put into, the loop. */
  readonly takenKWh: number;
  readonly givenKWh: number;
  /** Taken − given, kWh/yr. Positive: the plant must add heat over the year. */
  readonly netKWh: number;
  /** Heat passed between buildings with no plant, kWh/yr. */
  readonly sharedKWh: number;
  /** The worst hour's net need, W. */
  readonly peakAddW: number;
  readonly peakRemoveW: number;
  /** What the plant is sized against: DESIGN_DIVERSITY × the worst hour, W. */
  readonly designAddW: number;
  readonly designRemoveW: number;
  /** Plant in the design that can add, and remove, heat at peak, W. */
  readonly addCapacityW: number;
  readonly removeCapacityW: number;
}

export function balanceOf(result: ScenarioResult, design: Design): Balance {
  const n = result.network;
  let add = 0;
  let remove = 0;
  for (const s of design.sources) {
    if (s.kind === 'bore-field') {
      add += s.boreholes * BOREHOLE_PEAK_W;
      remove += s.boreholes * BOREHOLE_PEAK_W;
    } else if (s.kind === 'air-source' || s.kind === 'waste-heat') add += s.capacityW;
    else if (s.kind === 'cooling-tower') remove += s.capacityW;
    else {
      add += s.capacityW;
      remove += s.capacityW;
    }
  }
  return {
    takenKWh: n.extractedKWh,
    givenKWh: n.rejectedKWh,
    netKWh: n.extractedKWh - n.rejectedKWh,
    sharedKWh: n.sharedKWh,
    peakAddW: n.peakHeatToAddW,
    peakRemoveW: n.peakHeatToRemoveW,
    designAddW: DESIGN_DIVERSITY * n.peakHeatToAddW,
    designRemoveW: DESIGN_DIVERSITY * n.peakHeatToRemoveW,
    addCapacityW: add,
    removeCapacityW: remove,
  };
}
