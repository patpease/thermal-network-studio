/**
 * Climate zones, and the weather-year fixture the calibration was fitted on.
 *
 * ASHRAE/IECC zones as ComStock labels them (2006). ResStock's 2004 labels
 * split Alaska out (7AK, 8AK) and zone 7 into 7A/7B; `normaliseZone` folds
 * those into 7 and 8, which is all the resolution the stock supports there.
 */
export const ZONES = ['1A', '2A', '2B', '3A', '3B', '3C', '4A', '4B', '4C', '5A', '5B', '6A', '6B', '7', '8'] as const;

export type ClimateZone = (typeof ZONES)[number];

export function normaliseZone(label: string): ClimateZone | null {
  if (label.startsWith('7')) return '7';
  if (label.startsWith('8')) return '8';
  return (ZONES as readonly string[]).includes(label) ? (label as ClimateZone) : null;
}

export const VINTAGE_BANDS = ['pre-1950', '1950-1979', '1980-1999', '2000+'] as const;

export type VintageBand = (typeof VINTAGE_BANDS)[number];
