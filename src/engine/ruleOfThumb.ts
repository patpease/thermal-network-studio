/**
 * A building's peak load against engineers' rules of thumb: ft²/ton for
 * cooling and Btu/h·ft² for heating. A check on the model, never an input to
 * it — nothing here reaches the network, the score or a challenge.
 *
 * Compared like with like:
 *
 *  - PEAK, not annual: the single largest hour of the simulated year, per m²
 *    of conditioned floor. A rule of thumb sizes equipment; an annual total is
 *    a different quantity.
 *  - SPACE heating and cooling only. Hot water and refrigeration are part of
 *    the building's load on the loop but not of what these rules describe.
 *  - AS BUILT: the vintage the building has, no retrofit, as the Site tab
 *    shows it.
 *
 * v1 holds one value for every building type (the owner's, 1 October 2026);
 * values per type are to follow.
 */
import { buildingLoads } from '../loads/building.ts';
import type { BuildingSpec } from '../loads/building.ts';
import type { WeatherYear } from '../loads/model.ts';
import { TON_W } from './scale.ts';

const M2_PER_FT2 = 0.09290304;
const W_PER_BTUH = 0.29307107;

/** The rules as engineers write them. */
export const RULE_OF_THUMB = Object.freeze({ coolingFt2PerTon: 400, heatingBtuhPerFt2: 30 });

/** The same rules in canonical W/m² of floor. */
export const RULE_OF_THUMB_W_PER_M2 = Object.freeze({
  cooling: TON_W / (RULE_OF_THUMB.coolingFt2PerTon * M2_PER_FT2),
  heating: (RULE_OF_THUMB.heatingBtuhPerFt2 * W_PER_BTUH) / M2_PER_FT2,
});

export interface PeakCheck {
  /** Peak hour's space heating, W per m² of conditioned floor. */
  readonly heatingWPerM2: number;
  /** Peak hour's space cooling, W per m² of conditioned floor. */
  readonly coolingWPerM2: number;
  /** Load against the rule's load: 1.2 is 20% above. Ratios of LOADS in both, never of ft²/ton. */
  readonly heatingRatio: number;
  readonly coolingRatio: number;
}

export function peakCheck(spec: Omit<BuildingSpec, 'floorArea' | 'retrofit'>, weather: WeatherYear): PeakCheck {
  // One square metre: the model runs per m², so the peak intensity does not
  // depend on the building's size.
  const loads = buildingLoads({ ...spec, floorArea: 1 }, weather);
  let heating = 0;
  let cooling = 0;
  for (let h = 0; h < loads.heating.length; h++) {
    if (loads.heating[h]! > heating) heating = loads.heating[h]!;
    if (loads.cooling[h]! > cooling) cooling = loads.cooling[h]!;
  }
  return {
    heatingWPerM2: heating,
    coolingWPerM2: cooling,
    heatingRatio: heating / RULE_OF_THUMB_W_PER_M2.heating,
    coolingRatio: cooling / RULE_OF_THUMB_W_PER_M2.cooling,
  };
}
