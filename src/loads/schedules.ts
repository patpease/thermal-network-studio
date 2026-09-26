/**
 * Daily profiles, 24 fractions each, hour 0 = 00:00–01:00 local standard time.
 *
 * Weekday profiles are the PNNL prototype scorecard values (90.1-2004
 * models), as imported by Heat Balance Studio's `import:pnnl`. Copied rather
 * than shared, per the suite's rule. Weekends are a stated simplification:
 * `weekend: 'setback'` uses the profile's own overnight value all day,
 * `weekend: 'same'` repeats the weekday. PNNL publishes weekend profiles; they
 * are not imported yet (BACKLOG).
 *
 * `gain` is a composite of occupancy, lighting and equipment weighted by their
 * densities. The 1R1C model has one gain term, and calibration scales it, so
 * the shape is what matters here, not the absolute density.
 */

export type Profile = readonly number[];

export interface ScheduleFamily {
  readonly id: string;
  /** Composite internal gain, 0–1 of peak. */
  readonly gain: Profile;
  /** HVAC occupied: 1 = occupied setpoints and ventilation, 0 = setback. */
  readonly hvac: Profile;
  readonly weekend: 'same' | 'setback';
  readonly source: string;
}

/** Composite of the three PNNL profiles, weighted by W/m² density. */
function composite(parts: readonly (readonly [Profile, number])[]): Profile {
  const total = parts.reduce((sum, [, weight]) => sum + weight, 0);
  const out: number[] = [];
  for (let h = 0; h < 24; h++) {
    let value = 0;
    for (const [profile, weight] of parts) value += (profile[h] ?? 0) * weight;
    out.push(Number((value / total).toFixed(4)));
  }
  return out;
}

const hours = (from: number, to: number): Profile =>
  Array.from({ length: 24 }, (_, h) => (h >= from && h < to ? 1 : 0));

const ALWAYS: Profile = Array.from({ length: 24 }, () => 1);

// PNNL weekday profiles (occupancy, lighting, equipment), 90.1-2004 models.
const OFFICE_OCC = [0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.95, 0.95, 0.9757, 0.95, 0.5135, 0.95, 0.9757, 0.95, 0.95, 0.3, 0.1, 0.1, 0.1, 0.1, 0.05, 0.05];
const OFFICE_LIGHT = [0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.1, 0.3, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.5, 0.3, 0.3, 0.2, 0.2, 0.1, 0.05];
const OFFICE_EQUIP = [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.9, 0.9, 0.9, 0.9, 0.8, 0.9, 0.9, 0.9, 0.9, 0.5, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4];

const RETAIL_OCC = [0, 0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.5, 0.5, 0.7, 0.7, 0.7, 0.7, 0.8, 0.7, 0.5, 0.5, 0.3, 0.3, 0, 0, 0];
const RETAIL_LIGHT = [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.2, 0.4, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.5, 0.5, 0.5, 0.2, 0.05, 0.05];
const RETAIL_EQUIP = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.4, 0.6, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.7, 0.7, 0.2, 0.2, 0.2];

const SCHOOL_OCC = [0, 0, 0, 0, 0, 0, 0, 0, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0, 0, 0];
const SCHOOL_LIGHT = [0.1773, 0.1773, 0.1773, 0.1773, 0.1773, 0.1773, 0.1773, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.1773, 0.1773, 0.1773];
const SCHOOL_EQUIP = [0.3419, 0.3419, 0.3419, 0.3419, 0.3419, 0.3419, 0.3419, 0.3419, 0.9242, 0.9242, 0.9275, 0.9275, 0.9275, 0.9242, 0.9242, 0.9226, 0.9226, 0.3419, 0.3419, 0.3419, 0.3419, 0.3419, 0.3419, 0.3419];

const HOSPITAL_OCC = [0.1621, 0.1621, 0.1621, 0.1621, 0.1621, 0.1621, 0.1621, 0.2621, 0.5405, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.5405, 0.3811, 0.3811, 0.2811, 0.2811, 0.1621, 0.1621];
const HOSPITAL_LIGHT = [0.2942, 0.2942, 0.2942, 0.2942, 0.2942, 0.2942, 0.2942, 0.5, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.3971, 0.3971, 0.3971, 0.3971, 0.3971, 0.3971, 0.3971, 0.2942];
const HOSPITAL_EQUIP = [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.7, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.4];

const HOTEL_OCC = [0.9417, 0.9417, 0.9417, 0.9417, 0.9417, 0.9417, 0.7292, 0.4125, 0.4125, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.3042, 0.5167, 0.5167, 0.5167, 0.7292, 0.7292, 0.8375, 0.9417, 0.9417];
const HOTEL_LIGHT = [0.2083, 0.1583, 0.1042, 0.1042, 0.1042, 0.2083, 0.4167, 0.525, 0.4167, 0.4167, 0.2625, 0.2625, 0.2625, 0.2625, 0.2625, 0.2625, 0.2625, 0.2625, 0.6292, 0.8375, 0.9417, 0.8375, 0.6292, 0.3125];
const HOTEL_EQUIP = [0.2465, 0.2203, 0.1941, 0.1941, 0.1941, 0.2465, 0.5351, 0.7072, 0.459, 0.459, 0.3095, 0.3095, 0.3095, 0.3095, 0.3095, 0.3095, 0.3095, 0.4137, 0.5971, 0.6935, 0.7906, 0.781, 0.5304, 0.3107];

const RESTAURANT_OCC = [0.05, 0, 0, 0, 0, 0.05, 0.1, 0.4, 0.4, 0.4, 0.2, 0.5, 0.8, 0.7, 0.4, 0.2, 0.25, 0.5, 0.8, 0.8, 0.8, 0.5, 0.35, 0.2];
const RESTAURANT_LIGHT = [0.15, 0.15, 0.15, 0.15, 0.15, 0.2, 0.4, 0.4, 0.6, 0.6, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.5, 0.3];
const RESTAURANT_EQUIP = [0.03, 0.02, 0.03, 0.02, 0.05, 0.12, 0.13, 0.15, 0.18, 0.21, 0.26, 0.29, 0.27, 0.25, 0.23, 0.23, 0.26, 0.26, 0.24, 0.22, 0.2, 0.18, 0.09, 0.03];

const WAREHOUSE_OCC = [0, 0, 0, 0, 0, 0, 0.11, 0.21, 1, 1, 1, 1, 0.53, 1, 1, 1, 1, 0.32, 0, 0, 0, 0, 0, 0];
const WAREHOUSE_LIGHT = [0.1039, 0.1039, 0.1039, 0.1039, 0.1039, 0.1039, 0.1064, 0.5912, 0.751, 0.8461, 0.8461, 0.8461, 0.8417, 0.8461, 0.8461, 0.8461, 0.751, 0.6005, 0.1039, 0.1039, 0.1039, 0.1039, 0.1039, 0.1039];
const WAREHOUSE_EQUIP = [0.2524, 0.2524, 0.2524, 0.2524, 0.2524, 0.2524, 0.2524, 0.2622, 1, 1, 1, 1, 0.2838, 1, 1, 1, 1, 0.2622, 0.2524, 0.2524, 0.2524, 0.2524, 0.2524, 0.2524];

const HOME_OCC = [0.9687, 0.9687, 0.9687, 0.9687, 0.9687, 0.9687, 0.9687, 0.8961, 0.2202, 0.1523, 0.1523, 0.1523, 0.1211, 0.1523, 0.1211, 0.1523, 0.1766, 0.2519, 0.9058, 0.9058, 0.9058, 0.9687, 0.9687, 0.9687];
const HOME_LIGHT = [0.0166, 0.0166, 0.0166, 0.0166, 0.0385, 0.0769, 0.0824, 0.0769, 0.061, 0.05, 0.05, 0.05, 0.0469, 0.05, 0.05, 0.0665, 0.1049, 0.1152, 0.1536, 0.181, 0.181, 0.1262, 0.0714, 0.033];
const HOME_EQUIP = [0.4462, 0.4075, 0.3881, 0.3784, 0.3784, 0.4269, 0.5334, 0.6453, 0.6706, 0.6803, 0.6997, 0.7094, 0.6978, 0.6706, 0.6609, 0.69, 0.8062, 0.9844, 0.9791, 0.9112, 0.8725, 0.8337, 0.6981, 0.5722];

// Weights are the densities in W/m² (occupancy as sensible W/m² at full
// occupancy) from the same PNNL/ASHRAE rows, rounded.
export const SCHEDULE_FAMILIES = {
  office: {
    id: 'office',
    gain: composite([[OFFICE_OCC, 4], [OFFICE_LIGHT, 7], [OFFICE_EQUIP, 8]]),
    hvac: hours(6, 19),
    weekend: 'setback',
    source: 'PNNL prototype scorecards, 90.1-2004 (OfficeMedium), weekday',
  },
  retail: {
    id: 'retail',
    gain: composite([[RETAIL_OCC, 5], [RETAIL_LIGHT, 11], [RETAIL_EQUIP, 3]]),
    hvac: hours(7, 22),
    weekend: 'same',
    source: 'PNNL prototype scorecards, 90.1-2004 (RetailStandalone), weekday',
  },
  school: {
    id: 'school',
    gain: composite([[SCHOOL_OCC, 20], [SCHOOL_LIGHT, 10], [SCHOOL_EQUIP, 8]]),
    hvac: hours(6, 21),
    weekend: 'setback',
    source: 'PNNL prototype scorecards, 90.1-2004 (SchoolSecondary), weekday',
  },
  hospital: {
    id: 'hospital',
    gain: composite([[HOSPITAL_OCC, 6], [HOSPITAL_LIGHT, 10], [HOSPITAL_EQUIP, 20]]),
    hvac: ALWAYS,
    weekend: 'same',
    source: 'PNNL prototype scorecards, 90.1-2004 (Hospital), weekday',
  },
  outpatient: {
    id: 'outpatient',
    gain: composite([[HOSPITAL_OCC, 6], [HOSPITAL_LIGHT, 10], [HOSPITAL_EQUIP, 15]]),
    hvac: hours(5, 22),
    weekend: 'setback',
    source: 'PNNL prototype scorecards, 90.1-2004 (Hospital occupancy shape), weekday',
  },
  hotel: {
    id: 'hotel',
    gain: composite([[HOTEL_OCC, 3], [HOTEL_LIGHT, 7], [HOTEL_EQUIP, 5]]),
    hvac: ALWAYS,
    weekend: 'same',
    source: 'PNNL prototype scorecards, 90.1-2004 (HotelLarge), weekday',
  },
  restaurant: {
    id: 'restaurant',
    gain: composite([[RESTAURANT_OCC, 50], [RESTAURANT_LIGHT, 9], [RESTAURANT_EQUIP, 60]]),
    hvac: hours(6, 24),
    weekend: 'same',
    source: 'PNNL prototype scorecards, 90.1-2004 (RestaurantSitDown), weekday',
  },
  warehouse: {
    id: 'warehouse',
    gain: composite([[WAREHOUSE_OCC, 2], [WAREHOUSE_LIGHT, 5], [WAREHOUSE_EQUIP, 2]]),
    hvac: hours(6, 18),
    weekend: 'setback',
    source: 'PNNL prototype scorecards, 90.1-2004 (Warehouse), weekday',
  },
  home: {
    id: 'home',
    gain: composite([[HOME_OCC, 2], [HOME_LIGHT, 5], [HOME_EQUIP, 7]]),
    hvac: ALWAYS,
    weekend: 'same',
    source: 'PNNL prototype scorecards, 90.1-2004 (ApartmentMidRise), weekday',
  },
} as const satisfies Record<string, ScheduleFamily>;

export type ScheduleFamilyId = keyof typeof SCHEDULE_FAMILIES;

/**
 * Domestic hot water draw, 0–1 of the day's peak hour. The residential shape
 * is the familiar morning-and-evening double hump; commercial draws follow
 * the occupied day. Only the SHAPE is used — the annual quantity comes from
 * ResStock and ComStock through calibration.
 */
export const DHW_PROFILES = {
  home: [0.1, 0.05, 0.04, 0.04, 0.08, 0.3, 0.8, 1, 0.8, 0.6, 0.45, 0.4, 0.4, 0.35, 0.3, 0.3, 0.4, 0.55, 0.75, 0.8, 0.7, 0.55, 0.4, 0.2],
  daytime: [0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.3, 0.6, 0.9, 1, 1, 1, 1, 1, 0.9, 0.9, 0.8, 0.6, 0.3, 0.2, 0.1, 0.05, 0.05, 0.05],
  continuous: [0.4, 0.3, 0.3, 0.3, 0.4, 0.6, 0.9, 1, 0.9, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 1, 1, 0.9, 0.8, 0.6, 0.5],
  kitchen: [0.05, 0.02, 0.02, 0.02, 0.05, 0.15, 0.3, 0.5, 0.6, 0.6, 0.7, 0.9, 1, 0.9, 0.6, 0.5, 0.6, 0.8, 1, 1, 0.9, 0.6, 0.3, 0.1],
} as const satisfies Record<string, Profile>;

export type DhwProfileId = keyof typeof DHW_PROFILES;
