/**
 * The building archetypes, and the physical priors the 1R1C model starts from.
 *
 * Every number here is a PRIOR, per m² of floor, in canonical SI. Calibration
 * (`scripts/calibrate/fit.ts`) then scales the loss terms and the gain term
 * per climate zone until the model's annual heating and cooling loads land on
 * ComStock/ResStock's (D22). So a prior can be roughly right and the result
 * still exact against the stock. What a prior DOES decide is the split between
 * the loss terms and the hourly shape, which calibration does not touch.
 *
 * Where a prior came from:
 *   envelope UA   typical surface-to-floor ratio × a mid-vintage U, per type
 *   infiltration  ~0.3 ACH at a 3 m storey (ρc_p ≈ 1,200 J/m³K)
 *   ventilation   ASHRAE 62.1-style outdoor air per m² × ρc_p, occupied only
 *   capacitance   medium construction, 100–250 kJ/K per m² of floor
 *   gain peak     sum of the PNNL densities behind the schedule composite
 *   setpoints     21/24 °C occupied, 15.6/29.4 °C (60/85 °F) setback
 */
import type { DhwProfileId, ScheduleFamilyId } from './schedules.ts';

export type ArchetypeId =
  | 'single-family'
  | 'small-multifamily'
  | 'large-multifamily'
  | 'office-small'
  | 'office-large'
  | 'retail-standalone'
  | 'retail-stripmall'
  | 'restaurant'
  | 'supermarket'
  | 'school-primary'
  | 'school-secondary'
  | 'hospital'
  | 'outpatient'
  | 'hotel'
  | 'warehouse';

/** Where calibration targets come from: source types pooled by weight. */
export interface CalibrationSource {
  readonly dataset: 'comstock' | 'resstock';
  readonly types: readonly string[];
}

export interface Archetype {
  readonly id: ArchetypeId;
  readonly label: string;
  readonly sector: 'residential' | 'commercial';
  readonly calibration: CalibrationSource;
  readonly schedule: ScheduleFamilyId;
  readonly dhwProfile: DhwProfileId;
  /** W/K per m² of floor. */
  readonly envelopeUA: number;
  /** W/K per m² of floor, all hours. */
  readonly infiltrationUA: number;
  /** W/K per m² of floor, occupied hours only. */
  readonly ventilationUA: number;
  /** J/K per m² of floor. */
  readonly capacitance: number;
  /** W/m² at a schedule value of 1. */
  readonly gainPeak: number;
  /** Effective m² of horizontal irradiance admitted per m² of floor. */
  readonly solarAperture: number;
  readonly setpoints: {
    readonly heatOccupied: number;
    readonly coolOccupied: number;
    readonly heatSetback: number;
    readonly coolSetback: number;
  };
}

const COMMERCIAL_SETPOINTS = { heatOccupied: 21, coolOccupied: 24, heatSetback: 15.6, coolSetback: 29.4 };
const ALWAYS_OCCUPIED = { heatOccupied: 21, coolOccupied: 24, heatSetback: 21, coolSetback: 24 };
const HOME_SETPOINTS = { heatOccupied: 20.5, coolOccupied: 24.5, heatSetback: 20.5, coolSetback: 24.5 };

const comstock = (...types: string[]): CalibrationSource => ({ dataset: 'comstock', types });
const resstock = (...types: string[]): CalibrationSource => ({ dataset: 'resstock', types });

export const ARCHETYPES: readonly Archetype[] = Object.freeze([
  {
    id: 'single-family',
    label: 'Single-family home',
    sector: 'residential',
    calibration: resstock('Single-Family Detached'),
    schedule: 'home',
    dhwProfile: 'home',
    envelopeUA: 1.2,
    infiltrationUA: 0.45,
    ventilationUA: 0,
    capacitance: 100e3,
    gainPeak: 6,
    solarAperture: 0.04,
    setpoints: HOME_SETPOINTS,
  },
  {
    id: 'small-multifamily',
    label: 'Small multifamily (2–4 units)',
    sector: 'residential',
    calibration: resstock('Single-Family Attached', 'Multi-Family with 2 - 4 Units'),
    schedule: 'home',
    dhwProfile: 'home',
    envelopeUA: 0.95,
    infiltrationUA: 0.4,
    ventilationUA: 0,
    capacitance: 110e3,
    gainPeak: 7,
    solarAperture: 0.035,
    setpoints: HOME_SETPOINTS,
  },
  {
    id: 'large-multifamily',
    label: 'Large multifamily (5+ units)',
    sector: 'residential',
    calibration: resstock('Multi-Family with 5+ Units'),
    schedule: 'home',
    dhwProfile: 'home',
    envelopeUA: 0.6,
    infiltrationUA: 0.3,
    ventilationUA: 0.1,
    capacitance: 150e3,
    gainPeak: 8,
    solarAperture: 0.03,
    setpoints: HOME_SETPOINTS,
  },
  {
    id: 'office-small',
    label: 'Small office',
    sector: 'commercial',
    calibration: comstock('SmallOffice'),
    schedule: 'office',
    dhwProfile: 'daytime',
    envelopeUA: 0.9,
    infiltrationUA: 0.35,
    ventilationUA: 0.6,
    capacitance: 150e3,
    gainPeak: 19,
    solarAperture: 0.03,
    setpoints: COMMERCIAL_SETPOINTS,
  },
  {
    id: 'office-large',
    label: 'Medium or large office',
    sector: 'commercial',
    calibration: comstock('MediumOffice', 'LargeOffice'),
    schedule: 'office',
    dhwProfile: 'daytime',
    envelopeUA: 0.5,
    infiltrationUA: 0.25,
    ventilationUA: 0.6,
    capacitance: 170e3,
    gainPeak: 19,
    solarAperture: 0.025,
    setpoints: COMMERCIAL_SETPOINTS,
  },
  {
    id: 'retail-standalone',
    label: 'Standalone retail',
    sector: 'commercial',
    calibration: comstock('RetailStandalone'),
    schedule: 'retail',
    dhwProfile: 'daytime',
    envelopeUA: 0.9,
    infiltrationUA: 0.45,
    ventilationUA: 0.9,
    capacitance: 150e3,
    gainPeak: 19,
    solarAperture: 0.02,
    setpoints: COMMERCIAL_SETPOINTS,
  },
  {
    id: 'retail-stripmall',
    label: 'Strip mall',
    sector: 'commercial',
    calibration: comstock('RetailStripmall'),
    schedule: 'retail',
    dhwProfile: 'daytime',
    envelopeUA: 0.95,
    infiltrationUA: 0.45,
    ventilationUA: 0.9,
    capacitance: 150e3,
    gainPeak: 19,
    solarAperture: 0.02,
    setpoints: COMMERCIAL_SETPOINTS,
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    sector: 'commercial',
    calibration: comstock('FullServiceRestaurant', 'QuickServiceRestaurant'),
    schedule: 'restaurant',
    dhwProfile: 'kitchen',
    envelopeUA: 1.3,
    infiltrationUA: 0.6,
    ventilationUA: 3,
    capacitance: 120e3,
    gainPeak: 119,
    solarAperture: 0.03,
    setpoints: COMMERCIAL_SETPOINTS,
  },
  {
    id: 'supermarket',
    label: 'Supermarket',
    sector: 'commercial',
    calibration: comstock('Grocery'),
    schedule: 'retail',
    dhwProfile: 'daytime',
    envelopeUA: 0.8,
    infiltrationUA: 0.45,
    ventilationUA: 0.9,
    capacitance: 150e3,
    gainPeak: 22,
    solarAperture: 0.02,
    setpoints: COMMERCIAL_SETPOINTS,
  },
  {
    id: 'school-primary',
    label: 'Primary school',
    sector: 'commercial',
    calibration: comstock('PrimarySchool'),
    schedule: 'school',
    dhwProfile: 'daytime',
    envelopeUA: 0.8,
    infiltrationUA: 0.35,
    ventilationUA: 1.5,
    capacitance: 170e3,
    gainPeak: 38,
    solarAperture: 0.03,
    setpoints: COMMERCIAL_SETPOINTS,
  },
  {
    id: 'school-secondary',
    label: 'Secondary school or college',
    sector: 'commercial',
    calibration: comstock('SecondarySchool'),
    schedule: 'school',
    dhwProfile: 'daytime',
    envelopeUA: 0.7,
    infiltrationUA: 0.3,
    ventilationUA: 1.5,
    capacitance: 170e3,
    gainPeak: 38,
    solarAperture: 0.025,
    setpoints: COMMERCIAL_SETPOINTS,
  },
  {
    id: 'hospital',
    label: 'Hospital',
    sector: 'commercial',
    calibration: comstock('Hospital'),
    schedule: 'hospital',
    dhwProfile: 'continuous',
    envelopeUA: 0.45,
    infiltrationUA: 0.2,
    ventilationUA: 2.5,
    capacitance: 250e3,
    gainPeak: 36,
    solarAperture: 0.02,
    setpoints: ALWAYS_OCCUPIED,
  },
  {
    id: 'outpatient',
    label: 'Outpatient clinic',
    sector: 'commercial',
    calibration: comstock('Outpatient'),
    schedule: 'outpatient',
    dhwProfile: 'daytime',
    envelopeUA: 0.7,
    infiltrationUA: 0.3,
    ventilationUA: 1.5,
    capacitance: 170e3,
    gainPeak: 31,
    solarAperture: 0.025,
    setpoints: COMMERCIAL_SETPOINTS,
  },
  {
    id: 'hotel',
    label: 'Hotel',
    sector: 'commercial',
    calibration: comstock('SmallHotel', 'LargeHotel'),
    schedule: 'hotel',
    dhwProfile: 'continuous',
    envelopeUA: 0.6,
    infiltrationUA: 0.3,
    ventilationUA: 0.5,
    capacitance: 170e3,
    gainPeak: 15,
    solarAperture: 0.03,
    setpoints: ALWAYS_OCCUPIED,
  },
  {
    id: 'warehouse',
    label: 'Warehouse',
    sector: 'commercial',
    calibration: comstock('Warehouse'),
    schedule: 'warehouse',
    dhwProfile: 'daytime',
    envelopeUA: 0.7,
    infiltrationUA: 0.4,
    ventilationUA: 0.2,
    capacitance: 120e3,
    gainPeak: 9,
    solarAperture: 0.015,
    setpoints: COMMERCIAL_SETPOINTS,
  },
]);

export function archetypeById(id: ArchetypeId): Archetype {
  const found = ARCHETYPES.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown archetype ${id}`);
  return found;
}
