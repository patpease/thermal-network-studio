/**
 * Units. The engine works in canonical SI and never learns which system is on
 * screen: watts, kilowatt-hours, °C, kelvin for differences, square metres.
 * Converted on the way in from a user and on the way out to a screen, nowhere
 * else. An IP branch inside the engine is the version of this that rots.
 *
 * Default display is IP (D2: the tool is US-first).
 *
 * Two traps the siblings paid for:
 *
 *  - A temperature and a temperature DIFFERENCE convert differently. 10 K is
 *    18 °F of difference, not 50 °F. They are separate quantities here so the
 *    type of the call says which is meant.
 *  - Unit switching that relabels without converting. Everything that prints
 *    a unit reads it from `LABELS[units]`.
 */

export type UnitSystem = 'ip' | 'si';

export const DEFAULT_UNITS: UnitSystem = 'ip';

export type Quantity =
  | 'temperature'
  | 'temperatureDelta'
  | 'power'
  | 'energy'
  | 'area'
  | 'length'
  | 'powerLarge'
  | 'energyLarge'
  | 'density'
  /** Electric demand. kW in both systems: US utilities bill and plan in kW. */
  | 'electricPower'
  /** Distances between places, canonical m: miles or kilometres. */
  | 'distance'
  /**
   * A heating or cooling load per floor area, canonical W/m²: Btu/h·ft² in
   * IP, the unit the heating rule of thumb is written in. Bars are drawn in
   * this for BOTH heating and cooling, so a taller bar is always more load.
   */
  | 'loadIntensity'
  /**
   * Peak cooling per floor area, canonical W/m². IP prints it as ft²/ton, a
   * RECIPROCAL: a bigger number is a smaller load. Converted here and nowhere
   * else, so nothing can compare a ft²/ton figure as if it were a load.
   */
  | 'coolingIntensity';

/** Watts in one Btu per hour. */
const W_PER_BTUH = 0.29307107;
/** Kilowatt-hours in one kBtu. */
const KWH_PER_KBTU = 0.29307107;
/** Square metres in one square foot. */
const M2_PER_FT2 = 0.09290304;
const M_PER_FT = 0.3048;
/** One ton of refrigeration, W (12,000 Btu/h); `engine/scale.ts` holds the same. */
const W_PER_TON = 3_516.85;
/**
 * Canonical SI for the big quantities: MW, MWh, GWh/km²·yr. IP: million
 * Btu/h, MMBtu, and billion Btu/mi²·yr — the unit EPRI's density thresholds
 * are written in (400 billion Btu/mi² ≈ 45 GWh/km²).
 */
const MMBTU_PER_MWH = 3.4121416;
const KM2_PER_MI2 = 2.58998811;
const BILLION_BTU_PER_GWH = 3.4121416;

export const LABELS: Record<UnitSystem, Record<Quantity, string>> = {
  ip: {
    temperature: '°F',
    temperatureDelta: '°F',
    power: 'Btu/h',
    energy: 'kBtu',
    area: 'ft²',
    length: 'ft',
    powerLarge: 'MMBtu/h',
    energyLarge: 'MMBtu',
    density: 'billion Btu/mi²·yr',
    electricPower: 'kW',
    distance: 'mi',
    loadIntensity: 'Btu/h·ft²',
    coolingIntensity: 'ft²/ton',
  },
  si: {
    temperature: '°C',
    temperatureDelta: 'K',
    power: 'W',
    energy: 'kWh',
    area: 'm²',
    length: 'm',
    powerLarge: 'MW',
    energyLarge: 'MWh',
    density: 'GWh/km²·yr',
    electricPower: 'kW',
    distance: 'km',
    loadIntensity: 'W/m²',
    coolingIntensity: 'W/m²',
  },
};

/** Canonical SI value → the number shown in `units`. */
export function toDisplay(quantity: Quantity, si: number, units: UnitSystem): number {
  if (quantity === 'electricPower') return si / 1000;
  if (quantity === 'distance') return units === 'si' ? si / 1000 : si / 1609.344;
  if (units === 'si') return si;
  switch (quantity) {
    case 'temperature':
      return si * 1.8 + 32;
    case 'temperatureDelta':
      return si * 1.8;
    case 'power':
      return si / W_PER_BTUH;
    case 'energy':
      return si / KWH_PER_KBTU;
    case 'area':
      return si / M2_PER_FT2;
    case 'length':
      return si / M_PER_FT;
    case 'powerLarge':
    case 'energyLarge':
      return si * MMBTU_PER_MWH;
    case 'density':
      return si * BILLION_BTU_PER_GWH * KM2_PER_MI2;
    case 'loadIntensity':
      return (si * M2_PER_FT2) / W_PER_BTUH;
    case 'coolingIntensity':
      return W_PER_TON / (si * M2_PER_FT2);
  }
}

/** A number typed in `units` → canonical SI. The exact inverse of `toDisplay`. */
export function fromDisplay(quantity: Quantity, shown: number, units: UnitSystem): number {
  if (quantity === 'electricPower') return shown * 1000;
  if (quantity === 'distance') return units === 'si' ? shown * 1000 : shown * 1609.344;
  if (units === 'si') return shown;
  switch (quantity) {
    case 'temperature':
      return (shown - 32) / 1.8;
    case 'temperatureDelta':
      return shown / 1.8;
    case 'power':
      return shown * W_PER_BTUH;
    case 'energy':
      return shown * KWH_PER_KBTU;
    case 'area':
      return shown * M2_PER_FT2;
    case 'length':
      return shown * M_PER_FT;
    case 'powerLarge':
    case 'energyLarge':
      return shown / MMBTU_PER_MWH;
    case 'density':
      return shown / (BILLION_BTU_PER_GWH * KM2_PER_MI2);
    case 'loadIntensity':
      return (shown * W_PER_BTUH) / M2_PER_FT2;
    case 'coolingIntensity':
      // The reciprocal is its own inverse.
      return W_PER_TON / (shown * M2_PER_FT2);
  }
}
