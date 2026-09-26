/**
 * One building's hourly thermal loads, in watts.
 *
 * The unit model runs per m² of floor, so a building is its archetype's unit
 * result × its conditioned floor area. Unit results are cached by archetype,
 * zone and envelope factor: 500 buildings of 5 types cost 5 simulations.
 * The cache is keyed on the weather object's identity, so a new weather year
 * never reads a stale result.
 */
import { archetypeById } from './archetypes.ts';
import type { ArchetypeId } from './archetypes.ts';
import { CALIBRATION, VINTAGE_FACTORS } from './generated/calibration.ts';
import { dhwLoads, processCooling, spaceLoads } from './model.ts';
import type { UnitLoads, WeatherYear } from './model.ts';
import type { ClimateZone, VintageBand } from './zones.ts';

export interface BuildingSpec {
  readonly archetype: ArchetypeId;
  readonly zone: ClimateZone;
  /** Conditioned floor area, m². */
  readonly floorArea: number;
  /** Absent = the stock average for the archetype. */
  readonly vintage?: VintageBand;
  /**
   * A retrofit: multiplies envelope + infiltration conductance on top of the
   * vintage. 1 = as built; 0.6 = a deep envelope retrofit.
   */
  readonly retrofit?: number;
}

/** W, hourly, each ≥ 0. */
export interface BuildingLoads {
  readonly heating: Float64Array;
  readonly cooling: Float64Array;
  readonly dhw: Float64Array;
  readonly process: Float64Array;
}

interface UnitResult extends UnitLoads {
  readonly dhw: Float64Array;
  readonly process: Float64Array;
}

const cache = new WeakMap<WeatherYear, Map<string, UnitResult>>();

function unit(spec: BuildingSpec, weather: WeatherYear): UnitResult {
  const vintageFactor = spec.vintage ? VINTAGE_FACTORS[spec.archetype][spec.vintage] : 1;
  const envelopeFactor = vintageFactor * (spec.retrofit ?? 1);
  const key = `${spec.archetype}|${spec.zone}|${envelopeFactor}`;

  let byKey = cache.get(weather);
  if (!byKey) cache.set(weather, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;

  const archetype = archetypeById(spec.archetype);
  const calibration = CALIBRATION[spec.archetype][spec.zone];
  const result: UnitResult = {
    ...spaceLoads(archetype, calibration, weather, { envelopeFactor }),
    dhw: dhwLoads(archetype, calibration.targets.dhw),
    process: processCooling(calibration.targets.process),
  };
  byKey.set(key, result);
  return result;
}

const scale = (series: Float64Array, factor: number) => series.map((v) => v * factor);

export function buildingLoads(spec: BuildingSpec, weather: WeatherYear): BuildingLoads {
  if (!(spec.floorArea > 0)) throw new Error(`Floor area must be positive, got ${spec.floorArea}`);
  const u = unit(spec, weather);
  return {
    heating: scale(u.heating, spec.floorArea),
    cooling: scale(u.cooling, spec.floorArea),
    dhw: scale(u.dhw, spec.floorArea),
    process: scale(u.process, spec.floorArea),
  };
}
