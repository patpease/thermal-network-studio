/**
 * Heat pump performance, as a fraction of Carnot.
 *
 *     COP_heating = η · T_sink / (T_sink − T_source)      (kelvin)
 *     COP_cooling = η · T_evap / (T_cond − T_evap)
 *
 * One η for every machine and stated here, rather than a curve per product:
 * the game is about how the LOOP temperature moves the COP, and a Carnot
 * fraction gets that direction and rough size right. The lift is floored at
 * 5 K and the COP clamped, so a warm loop cannot promise a COP of 40.
 */

export const HEAT_PUMP = {
  /** Fraction of Carnot achieved. 0.5 is a good modern water-source machine. */
  efficiency: 0.5,
  /** Approach between the loop and the refrigerant, K. */
  approach: 3,
  /** Space heating supply, °C. Low enough for fan coils and floors. */
  spaceSupply: 45,
  /** Domestic hot water, °C. */
  dhwSupply: 60,
  /** Chilled supply for space cooling, °C. */
  coolingSupply: 7,
  /** Refrigeration evaporating temperature (medium-temperature cases), °C. */
  refrigerationEvaporator: -8,
  maxCop: 8,
} as const;

const K = 273.15;
const MIN_LIFT = 5;

function carnotHeating(sink: number, source: number, eta: number, min: number, max: number): number {
  const lift = Math.max(sink - source, MIN_LIFT);
  return Math.min(max, Math.max(min, (eta * (sink + K)) / lift));
}

function carnotCooling(evaporator: number, condenser: number, eta: number, max: number): number {
  const lift = Math.max(condenser - evaporator, MIN_LIFT);
  return Math.min(max, Math.max(1, (eta * (evaporator + K)) / lift));
}

/** A building heat pump heating from the loop. */
export function heatingCop(loop: number, supply: number = HEAT_PUMP.spaceSupply): number {
  return carnotHeating(supply, loop - HEAT_PUMP.approach, HEAT_PUMP.efficiency, 1.5, HEAT_PUMP.maxCop);
}

/** A building heat pump cooling, rejecting to the loop. */
export function coolingCop(loop: number): number {
  return carnotCooling(HEAT_PUMP.coolingSupply, loop + HEAT_PUMP.approach, HEAT_PUMP.efficiency, HEAT_PUMP.maxCop);
}

/** Refrigeration condensing to the loop instead of to outdoor air. */
export function refrigerationCop(loop: number): number {
  return carnotCooling(HEAT_PUMP.refrigerationEvaporator, loop + 5, 0.45, 6);
}

/**
 * An air-source heat pump warming the LOOP (a central plant item, D1): the
 * sink is only a few degrees above the loop, so it runs at a high COP until
 * the air gets very cold. Stops below −20 °C air.
 */
export function airSourceCop(air: number, loop: number): number {
  if (air < AIR_SOURCE_LIMITS.min) return 0;
  return carnotHeating(loop + HEAT_PUMP.approach, air - 5, 0.45, 1.5, 6);
}

/** Outdoor air, °C, outside which the air-source heat pump stops. */
export const AIR_SOURCE_LIMITS = { min: -20, max: 46 } as const;

/**
 * The same machine reversed: it cools the LOOP and rejects to outdoor air.
 * It heats or cools, never both in one hour — and the loop's net need has
 * one sign each hour, so that is all it is ever asked. Stops above 46 °C air.
 */
export function airSourceCoolingCop(air: number, loop: number): number {
  if (air > AIR_SOURCE_LIMITS.max) return 0;
  return carnotCooling(loop - HEAT_PUMP.approach, air + 5, 0.45, 6);
}
