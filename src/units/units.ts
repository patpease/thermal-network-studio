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

export type Quantity = 'temperature' | 'temperatureDelta' | 'power' | 'energy' | 'area';

/** Watts in one Btu per hour. */
const W_PER_BTUH = 0.29307107;
/** Kilowatt-hours in one kBtu. */
const KWH_PER_KBTU = 0.29307107;
/** Square metres in one square foot. */
const M2_PER_FT2 = 0.09290304;

export const LABELS: Record<UnitSystem, Record<Quantity, string>> = {
  ip: {
    temperature: '°F',
    temperatureDelta: '°F',
    power: 'Btu/h',
    energy: 'kBtu',
    area: 'ft²',
  },
  si: {
    temperature: '°C',
    temperatureDelta: 'K',
    power: 'W',
    energy: 'kWh',
    area: 'm²',
  },
};

/** Canonical SI value → the number shown in `units`. */
export function toDisplay(quantity: Quantity, si: number, units: UnitSystem): number {
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
  }
}

/** A number typed in `units` → canonical SI. The exact inverse of `toDisplay`. */
export function fromDisplay(quantity: Quantity, shown: number, units: UnitSystem): number {
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
  }
}
