/**
 * From OSM features to the buildings, sources and anchors of a site.
 *
 * OSM is thin (PLAN hard problem 1): most US buildings are `building=yes` with
 * no levels and no use. So every building's archetype comes from the first
 * of these that says anything, and anything not read directly off a tag is
 * flagged as GUESSED — the map draws a guessed building differently, and the
 * player can override it:
 *
 *   1. the building's own tags         building=house, shop=supermarket …
 *   2. a point of interest inside it   an amenity=restaurant node
 *   3. federal structure data          NSI's Hazus occupancy, else FEMA's
 *                                      (phase 12; also replaces a guess
 *                                      from a coarse tag like
 *                                      building=residential)
 *   4. the land use it stands in       landuse=residential …
 *   5. its footprint                   small ones are homes
 *
 * Levels come from building:levels, else height ÷ 3.2 m, else NSI's storeys,
 * else FEMA's height, else an archetype default (guessed). A FEMA footprint
 * that no OSM building covers is added as a building of its own. Floor area is footprint × levels × 0.9 — the conditioned
 * share, as EPRI's synthetic stock does it (Table 3: 80–100% residential).
 */
import type { ArchetypeId } from '../loads/archetypes.ts';
import type { VintageBand } from '../loads/zones.ts';
import { bbox, centroid, distance, lineCrossesRing, pointInRing, ringArea } from './geometry.ts';
import type { LonLat, Ring } from './geometry.ts';
import { SOURCE_SEARCH_M } from './osm.ts';
import type { OsmFeature, SiteData } from './osm.ts';
import type { FemaStructure, NsiStructure } from './structures.ts';

/** D11: the most buildings a network may connect. */
export const MAX_BUILDINGS = 500;

/** Share of gross floor area that is conditioned. */
export const CONDITIONED_FRACTION = 0.9;

/** Below this footprint, m², a building is a shed, not a heat load. */
export const MIN_FOOTPRINT_M2 = 35;

/** SmallOffice in ComStock is under 25,000 ft². */
const SMALL_OFFICE_MAX_M2 = 2_300;

const UNHEATED = new Set([
  'garage', 'garages', 'shed', 'carport', 'roof', 'parking', 'hut', 'kiosk', 'greenhouse', 'barn',
  'farm_auxiliary', 'construction', 'ruins', 'service', 'transformer_tower', 'water_tower', 'bunker',
  'toilets', 'container', 'storage_tank', 'silo', 'boathouse', 'bridge', 'grandstand', 'tent', 'stable', 'cowshed',
]);

export type AnchorKind = 'civic' | 'library' | 'school' | 'hospital' | 'community' | 'worship' | 'emergency';

export interface SiteBuilding {
  readonly id: string;
  readonly footprint: Ring;
  readonly footprintM2: number;
  readonly name: string | null;
  /** Null: not a heat load (a garage, a shed, or a source in its own right). */
  readonly archetype: ArchetypeId | null;
  readonly archetypeGuessed: boolean;
  /** Plain words: what decided the archetype. Shown on hover. */
  readonly reason: string;
  readonly levels: number;
  readonly levelsGuessed: boolean;
  /** Conditioned floor area, m². */
  readonly floorArea: number;
  readonly vintage: VintageBand | null;
  readonly anchor: AnchorKind | null;
  /** Where the footprint came from: OSM, or a FEMA structure OSM does not have. */
  readonly origin: 'osm' | 'fema';
  /** Where the levels came from. Anything but 'osm' is guessed. */
  readonly levelsSource: 'osm' | 'nsi' | 'fema' | 'default';
  /** 'nsi-median' is the census block group's median year, not the building's. */
  readonly vintageSource: 'osm' | 'nsi-median' | null;
}

export type SourceKindFound = 'data-centre' | 'ice-rink' | 'brewery' | 'food-processing' | 'wastewater' | 'lake' | 'river' | 'supermarket';

export interface SourceCandidate {
  readonly id: string;
  readonly kind: SourceKindFound;
  readonly name: string | null;
  readonly at: LonLat;
  /** 0 inside the boundary. */
  readonly distanceM: number;
  /**
   * How the engine would use it: waste heat, a water exchanger, or already in
   * a building's load (a supermarket's refrigeration).
   */
  readonly exchange: 'waste-heat' | 'water' | 'in-load';
  /** A first estimate, always flagged as one. The player can change it. */
  readonly estimatedCapacityW: number;
  readonly temperature: number | null;
}

export interface Barrier {
  readonly id: string;
  readonly kind: 'highway' | 'railway' | 'river';
  readonly name: string | null;
}

export interface Site {
  readonly boundary: Ring;
  readonly areaM2: number;
  readonly buildings: readonly SiteBuilding[];
  readonly sources: readonly SourceCandidate[];
  readonly barriers: readonly Barrier[];
  /** Parks, pitches and surface parking inside the boundary, m². */
  readonly openSpaceM2: number;
  readonly skipped: number;
  /**
   * The neighbourhood's name from OSM (place=neighbourhood, suburb or
   * quarter): one inside the boundary, nearest its centre, else the nearest
   * within the search margin. Null when OSM names none — never guessed.
   */
  readonly placeName?: string | null;
  /**
   * Which federal structure sets answered (phase 12). Absent: the site was
   * read without them (an older project file).
   */
  readonly structures?: { readonly fema: boolean; readonly nsi: boolean; readonly femaTruncated: boolean };
  /** OpenStreetMap did not answer: buildings are federal data alone. */
  readonly osmUnavailable?: true;
}

// --------------------------------------------------------------- archetypes

const DEFAULT_LEVELS: Record<ArchetypeId, number> = {
  'single-family': 2,
  'small-multifamily': 3,
  'large-multifamily': 5,
  'office-small': 2,
  'office-large': 5,
  'retail-standalone': 1,
  'retail-stripmall': 1,
  restaurant: 1,
  supermarket: 1,
  'school-primary': 2,
  'school-secondary': 2,
  hospital: 5,
  outpatient: 2,
  hotel: 5,
  warehouse: 1,
};

interface Decision {
  archetype: ArchetypeId | null;
  guessed: boolean;
  reason: string;
}

const RESTAURANT = new Set(['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'food_court', 'ice_cream']);
const CLINIC = new Set(['clinic', 'doctors', 'dentist', 'veterinary']);
const HOTEL = new Set(['hotel', 'motel', 'hostel', 'guest_house']);

/** An archetype read directly off one set of tags, or null if they say nothing. */
function fromTags(t: Readonly<Record<string, string>>, footprint: number): Decision | null {
  const b = t['building'] ?? '';
  const amenity = t['amenity'] ?? '';
  const shop = t['shop'] ?? '';

  if (b === 'data_center' || t['telecom'] === 'data_center') {
    return { archetype: null, guessed: false, reason: 'A data centre: a heat source, not a load' };
  }
  if (isIceRink(t)) {
    return { archetype: null, guessed: false, reason: 'An ice rink: a heat source, not a load' };
  }
  if (shop === 'supermarket' || b === 'supermarket') return { archetype: 'supermarket', guessed: false, reason: 'Tagged supermarket' };
  if (amenity === 'hospital' || b === 'hospital' || t['healthcare'] === 'hospital') {
    return { archetype: 'hospital', guessed: false, reason: 'Tagged hospital' };
  }
  if (CLINIC.has(amenity) || (t['healthcare'] && t['healthcare'] !== 'hospital')) {
    return { archetype: 'outpatient', guessed: false, reason: 'Tagged clinic or healthcare' };
  }
  if (amenity === 'university' || amenity === 'college' || b === 'university' || b === 'college') {
    return { archetype: 'school-secondary', guessed: false, reason: 'Tagged college or university' };
  }
  if (amenity === 'school' || b === 'school' || amenity === 'kindergarten' || b === 'kindergarten') {
    const high = /\b(high|secondary|middle)\b/i.test(t['name'] ?? '');
    return { archetype: high ? 'school-secondary' : 'school-primary', guessed: false, reason: high ? 'Tagged school; named a high or middle school' : 'Tagged school' };
  }
  if (HOTEL.has(t['tourism'] ?? '') || b === 'hotel') return { archetype: 'hotel', guessed: false, reason: 'Tagged hotel' };
  if (RESTAURANT.has(amenity)) return { archetype: 'restaurant', guessed: false, reason: 'Tagged restaurant or café' };
  if (b === 'house' || b === 'detached' || b === 'bungalow' || b === 'cabin' || b === 'farm' || b === 'static_caravan') {
    return { archetype: 'single-family', guessed: false, reason: `Tagged building=${b}` };
  }
  if (b === 'semidetached_house' || b === 'terrace' || b === 'duplex') {
    return { archetype: 'small-multifamily', guessed: false, reason: `Tagged building=${b}` };
  }
  if (b === 'apartments' || b === 'dormitory') {
    const levels = Number(t['building:levels']);
    const large = (Number.isFinite(levels) && levels >= 4) || footprint > 600 || b === 'dormitory';
    return { archetype: large ? 'large-multifamily' : 'small-multifamily', guessed: false, reason: `Tagged building=${b}` };
  }
  if (b === 'warehouse' || b === 'industrial' || b === 'manufacture' || b === 'storage') {
    return { archetype: 'warehouse', guessed: false, reason: `Tagged building=${b}` };
  }
  if (b === 'retail' || shop !== '') {
    const strip = b === 'retail' && footprint > 4_000;
    return { archetype: strip ? 'retail-stripmall' : 'retail-standalone', guessed: false, reason: shop ? `Tagged shop=${shop}` : 'Tagged building=retail' };
  }
  if (b === 'office' || t['office']) return { archetype: 'office-small', guessed: false, reason: 'Tagged office' };
  // Civic buildings have no archetype of their own; an office is the closest.
  if (['townhall', 'library', 'community_centre', 'courthouse', 'fire_station', 'police'].includes(amenity) || ['civic', 'public', 'government'].includes(b)) {
    return { archetype: 'office-small', guessed: true, reason: 'A civic building, modelled as an office' };
  }
  if (amenity === 'place_of_worship' || ['church', 'chapel', 'cathedral', 'mosque', 'synagogue', 'temple'].includes(b)) {
    return { archetype: 'office-small', guessed: true, reason: 'A place of worship, modelled as a small office' };
  }
  if (b === 'commercial') return { archetype: 'office-small', guessed: true, reason: 'Tagged commercial: modelled as an office' };
  if (b === 'residential') return residentialBySize(footprint, 'Tagged residential; type from its size');
  return null;
}

function residentialBySize(footprint: number, reason: string): Decision {
  if (footprint < 250) return { archetype: 'single-family', guessed: true, reason };
  if (footprint < 800) return { archetype: 'small-multifamily', guessed: true, reason };
  return { archetype: 'large-multifamily', guessed: true, reason };
}

function fromLanduse(landuse: string | undefined, footprint: number): Decision | null {
  switch (landuse) {
    case 'residential':
      return residentialBySize(footprint, 'Untagged, in a residential area; type from its size');
    case 'retail':
      return { archetype: 'retail-standalone', guessed: true, reason: 'Untagged, in a retail area' };
    case 'commercial':
      return { archetype: 'office-small', guessed: true, reason: 'Untagged, in a commercial area' };
    case 'industrial':
      return { archetype: 'warehouse', guessed: true, reason: 'Untagged, in an industrial area' };
    case 'education':
      return { archetype: 'school-primary', guessed: true, reason: 'Untagged, in an education area' };
    default:
      return null;
  }
}

/** The office split by size, once floor area is known. */
function sizeOffice(a: ArchetypeId, floorArea: number): ArchetypeId {
  if (a === 'office-small' && floorArea > SMALL_OFFICE_MAX_M2) return 'office-large';
  if (a === 'office-large' && floorArea <= SMALL_OFFICE_MAX_M2) return 'office-small';
  return a;
}

// ------------------------------------------------------------- federal data

/**
 * A Hazus occupancy (NSI) → an archetype. RES3A–B are 2–4 units, RES3C–F
 * 5 and more: ResStock's own split between the two multifamily types.
 * Assembly, worship and government are modelled as a small office, as the
 * OSM rules do.
 */
export function hazusArchetype(occtype: string, units: number | null): { archetype: ArchetypeId | null; heated: boolean } | null {
  const code = occtype.split('-')[0]!.toUpperCase();
  if (code === 'RES1' || code === 'RES2') return { archetype: 'single-family', heated: true };
  if (code === 'RES3A' || code === 'RES3B') return { archetype: 'small-multifamily', heated: true };
  if (/^RES3[C-F]$/.test(code)) return { archetype: 'large-multifamily', heated: true };
  if (code === 'RES3') return { archetype: units !== null && units <= 4 ? 'small-multifamily' : 'large-multifamily', heated: true };
  if (code === 'RES4') return { archetype: 'hotel', heated: true };
  if (code === 'RES5' || code === 'RES6') return { archetype: 'large-multifamily', heated: true };
  const map: Record<string, ArchetypeId | null> = {
    COM1: 'retail-standalone',
    COM2: 'warehouse',
    COM3: 'retail-standalone',
    COM4: 'office-small',
    COM5: 'office-small',
    COM6: 'hospital',
    COM7: 'outpatient',
    COM8: 'restaurant',
    COM9: 'office-small',
    COM10: null,
    REL1: 'office-small',
    GOV1: 'office-small',
    GOV2: 'office-small',
    EDU1: 'school-primary',
    EDU2: 'school-secondary',
    AGR1: null,
  };
  if (code in map) return { archetype: map[code]!, heated: map[code] !== null };
  if (code.startsWith('IND')) return { archetype: 'warehouse', heated: true };
  return null;
}

/** FEMA USA Structures' PRIM_OCC → an archetype, or null when it says nothing usable. */
export function femaArchetype(occupancy: string, occupancyClass: string, footprint: number): { archetype: ArchetypeId | null; heated: boolean } | null {
  const o = occupancy.toLowerCase();
  const c = occupancyClass.toLowerCase();
  if (o === 'single family dwelling' || o === 'manufactured home') return { archetype: 'single-family', heated: true };
  // FEMA gives no unit count; the OSM apartments rule decides the size.
  if (o.startsWith('multi')) return { archetype: footprint > 600 ? 'large-multifamily' : 'small-multifamily', heated: true };
  if (o === 'temporary lodging') return { archetype: 'hotel', heated: true };
  if (o === 'institutional dormitory' || o === 'nursing home') return { archetype: 'large-multifamily', heated: true };
  if (o === 'retail trade' || o === 'personal and repair services' || o.startsWith('veterinary')) {
    return { archetype: footprint > 4_000 ? 'retail-stripmall' : 'retail-standalone', heated: true };
  }
  if (o === 'wholesale trade') return { archetype: 'warehouse', heated: true };
  if (o === 'hospital') return { archetype: 'hospital', heated: true };
  if (o === 'medical office/clinic') return { archetype: 'outpatient', heated: true };
  if (o === 'entertainment and recreation') return { archetype: 'restaurant', heated: true };
  if (o === 'pre-k - 12 schools') return { archetype: 'school-primary', heated: true };
  if (o === 'colleges/universities') return { archetype: 'school-secondary', heated: true };
  if (c === 'industrial') return { archetype: 'warehouse', heated: true };
  if (o === 'parking' || c === 'agriculture' || c === 'utility and misc' || o === 'non-civilian structures') return { archetype: null, heated: false };
  if (c === 'commercial' || c === 'government' || c === 'assembly' || c === 'education') return { archetype: 'office-small', heated: true };
  return null;
}

interface Federal {
  readonly fema: FemaStructure | null;
  readonly nsi: readonly NsiStructure[];
}

/** What federal data says a footprint is, as a decision, or null. Always guessed. */
function fromFederal(fed: Federal, footprint: number): Decision | null {
  // The NSI point with the most floor area speaks for the footprint.
  const main = [...fed.nsi].sort((a, b) => (b.floorAreaM2 ?? 0) - (a.floorAreaM2 ?? 0))[0];
  if (main) {
    const h = hazusArchetype(main.occtype, main.units);
    if (h) {
      const units = main.units && main.units > 1 ? `, ${main.units} units` : '';
      return h.heated
        ? { archetype: h.archetype, guessed: true, reason: `National Structure Inventory: ${main.occtype}${units}` }
        : { archetype: null, guessed: true, reason: `National Structure Inventory: ${main.occtype}, not heated` };
    }
  }
  if (fed.fema) {
    const f = femaArchetype(fed.fema.occupancy, fed.fema.occupancyClass, footprint);
    if (f) {
      return f.heated
        ? { archetype: f.archetype, guessed: true, reason: `FEMA USA Structures: ${fed.fema.occupancy}` }
        : { archetype: null, guessed: true, reason: `FEMA USA Structures: ${fed.fema.occupancy}, not heated` };
    }
  }
  return null;
}

/** Levels from federal data when OSM has none: NSI storeys, else FEMA height. */
function federalLevels(fed: Federal): { levels: number; source: 'nsi' | 'fema' } | null {
  const storeys = Math.max(0, ...fed.nsi.map((n) => n.stories ?? 0));
  if (storeys > 0) return { levels: Math.max(1, Math.round(storeys)), source: 'nsi' };
  if (fed.fema?.heightM) return { levels: Math.max(1, Math.round(fed.fema.heightM / 3.2)), source: 'fema' };
  return null;
}

function yearBand(year: number): VintageBand {
  if (year < 1950) return 'pre-1950';
  if (year < 1980) return '1950-1979';
  if (year < 2000) return '1980-1999';
  return '2000+';
}

function nsiInside(nsi: readonly NsiStructure[], ring: Ring): NsiStructure[] {
  const [w, s, e, n] = bbox(ring);
  return nsi.filter(({ at: [x, y] }) => x >= w && x <= e && y >= s && y <= n && pointInRing([x, y], ring));
}

/**
 * A FEMA footprint and an OSM one are the same building when either's centre
 * is inside the other, their boxes overlap by more than 30% of the smaller,
 * or their centres are within 8 m: imagery-traced outlines sit a few metres
 * off OSM's, and on the fixtures the centre test alone let seven offset
 * copies of small houses through as new buildings.
 */
const SAME_CENTRE_M = 8;

function sameBuilding(a: Ring, aCentre: LonLat, b: Ring, bCentre: LonLat): boolean {
  const [w, s, e, n] = bbox(a);
  const [w2, s2, e2, n2] = bbox(b);
  if (w > e2 || w2 > e || s > n2 || s2 > n) return false;
  if (pointInRing(bCentre, a) || pointInRing(aCentre, b) || distance(aCentre, bCentre) < SAME_CENTRE_M) return true;
  const overlap = (Math.min(e, e2) - Math.max(w, w2)) * (Math.min(n, n2) - Math.max(s, s2));
  return overlap > 0.3 * Math.min((e - w) * (n - s), (e2 - w2) * (n2 - s2));
}

function levelsOf(t: Readonly<Record<string, string>>, archetype: ArchetypeId | null): { levels: number; guessed: boolean } {
  const tagged = Number.parseFloat(t['building:levels'] ?? '');
  if (Number.isFinite(tagged) && tagged > 0 && tagged < 200) return { levels: Math.max(1, Math.round(tagged)), guessed: false };
  const height = Number.parseFloat(t['height'] ?? '');
  if (Number.isFinite(height) && height > 0) return { levels: Math.max(1, Math.round(height / 3.2)), guessed: false };
  return { levels: archetype ? DEFAULT_LEVELS[archetype] : 1, guessed: true };
}

export function vintageOf(t: Readonly<Record<string, string>>): VintageBand | null {
  const raw = t['start_date'] ?? t['building:start_date'] ?? '';
  const year = Number.parseInt(/\d{4}/.exec(raw)?.[0] ?? '', 10);
  if (!Number.isFinite(year) || year < 1600 || year > 2100) return null;
  return yearBand(year);
}

function anchorOf(t: Readonly<Record<string, string>>): AnchorKind | null {
  const amenity = t['amenity'] ?? '';
  const b = t['building'] ?? '';
  if (amenity === 'townhall' || amenity === 'courthouse' || b === 'civic' || b === 'government' || t['office'] === 'government') return 'civic';
  if (amenity === 'library') return 'library';
  if (['school', 'college', 'university', 'kindergarten'].includes(amenity) || ['school', 'college', 'university'].includes(b)) return 'school';
  if (amenity === 'hospital' || b === 'hospital') return 'hospital';
  if (amenity === 'community_centre') return 'community';
  if (amenity === 'place_of_worship' || ['church', 'chapel', 'cathedral', 'mosque', 'synagogue', 'temple'].includes(b)) return 'worship';
  if (amenity === 'fire_station' || amenity === 'police') return 'emergency';
  return null;
}

// ------------------------------------------------------------------ sources

/**
 * First estimates for a source's capacity. Order-of-magnitude, stated, and
 * always shown as estimates the player can change (phase 04).
 */
export const SOURCE_DEFAULTS: Record<SourceKindFound, { exchange: SourceCandidate['exchange']; capacityW: number; temperature: number | null }> = {
  // Recoverable heat per m² of data-hall footprint; a mid-density hall.
  'data-centre': { exchange: 'waste-heat', capacityW: 500_000, temperature: 30 },
  // One NHL sheet's refrigeration condenser.
  'ice-rink': { exchange: 'waste-heat', capacityW: 300_000, temperature: 30 },
  brewery: { exchange: 'waste-heat', capacityW: 100_000, temperature: 40 },
  'food-processing': { exchange: 'waste-heat', capacityW: 500_000, temperature: 30 },
  wastewater: { exchange: 'water', capacityW: 2_000_000, temperature: null },
  lake: { exchange: 'water', capacityW: 2_000_000, temperature: null },
  river: { exchange: 'water', capacityW: 2_000_000, temperature: null },
  // Inside the boundary its refrigeration is in its own load. Outside it, its
  // condenser heat is a source (see SUPERMARKET_HOMES).
  supermarket: { exchange: 'in-load', capacityW: 0, temperature: null },
};

const DATA_CENTRE_W_PER_M2 = 250;

/**
 * A supermarket outside the boundary is counted as heat for 25 homes: VCTN
 * gives 15–30 for one large supermarket's refrigeration (Moving Heat). One
 * home is this tool's own single-family home (180 m², zone 5A): 27,900 kWh a
 * year of heating and hot water, 3.2 kW on average. 25 × 3.2 kW = 80 kW,
 * available every hour.
 */
export const SUPERMARKET_HOMES = 25;
export const HOME_AVERAGE_HEAT_W = 3_200;

const ICE_SPORTS = new Set(['ice_hockey', 'ice_skating', 'skating', 'curling']);

/**
 * An indoor rink. OSM tags them three ways: leisure=ice_rink; a sports centre
 * or stadium with an ice sport (St. Paul's Highland Arena is
 * leisure=sports_centre + sport=skating); or a building with an ice sport.
 * An outdoor pitch with sport=skating is NOT counted — no refrigeration plant.
 */
function isIceRink(t: Readonly<Record<string, string>>): boolean {
  if (t['leisure'] === 'ice_rink') return true;
  const sports = (t['sport'] ?? '').split(';').map((x) => x.trim());
  const ice = sports.some((x) => ICE_SPORTS.has(x));
  return ice && (['sports_centre', 'stadium', 'sports_hall'].includes(t['leisure'] ?? '') || Boolean(t['building']));
}

function sourceKind(t: Readonly<Record<string, string>>): SourceKindFound | null {
  if (t['telecom'] === 'data_center' || t['building'] === 'data_center') return 'data-centre';
  if (isIceRink(t)) return 'ice-rink';
  if (t['craft'] === 'brewery' || t['industrial'] === 'brewery') return 'brewery';
  if (['food', 'dairy', 'slaughterhouse'].includes(t['industrial'] ?? '')) return 'food-processing';
  if (t['man_made'] === 'wastewater_plant') return 'wastewater';
  if (t['shop'] === 'supermarket') return 'supermarket';
  if (t['waterway'] === 'river' || t['waterway'] === 'canal' || t['water'] === 'river' || t['water'] === 'canal') return 'river';
  if (t['natural'] === 'water') return 'lake';
  return null;
}

/** Ponds and ornamental water are not a heat source. */
const MIN_LAKE_M2 = 20_000;

function anchorPoint(f: OsmFeature): LonLat {
  const g = f.geometry;
  if (g.type === 'point') return g.at;
  if (g.type === 'polygon') return centroid(g.ring);
  return g.path[Math.floor(g.path.length / 2)]!;
}

function distanceToBoundary(p: LonLat, boundary: Ring): number {
  if (pointInRing(p, boundary)) return 0;
  let best = Infinity;
  for (const v of boundary) best = Math.min(best, distance(p, v));
  return best;
}

function nearestPoint(f: OsmFeature, boundary: Ring): { at: LonLat; distanceM: number } {
  const g = f.geometry;
  const points = g.type === 'point' ? [g.at] : g.type === 'polygon' ? g.ring : g.path;
  let best = { at: anchorPoint(f), distanceM: Infinity };
  for (const p of points) {
    const d = distanceToBoundary(p, boundary);
    if (d < best.distanceM) best = { at: p, distanceM: d };
  }
  return best;
}

// --------------------------------------------------------------------- site

export function classifySite(data: SiteData): Site {
  const boundary = data.boundary;
  const points = data.features.filter((f) => f.geometry.type === 'point');
  const landuse = data.features.filter((f) => f.geometry.type === 'polygon' && f.tags['landuse']);

  const buildings: SiteBuilding[] = [];
  const sources: SourceCandidate[] = [];
  const seenSources = new Set<string>();

  // Federal structures (phase 12): FEMA footprints with their centres, and
  // NSI points. Those an OSM building claims are marked; the rest of FEMA's
  // become buildings of their own below.
  const fema = (data.structures?.fema ?? []).map((s) => ({ s, centre: centroid(s.ring) }));
  const nsi = data.structures?.nsi ?? [];
  const claimedFema = new Set<string>();

  const addSource = (f: OsmFeature, kind: SourceKindFound, footprintM2: number | null) => {
    if (seenSources.has(f.id)) return;
    const { at, distanceM } = nearestPoint(f, boundary);
    if (distanceM > SOURCE_SEARCH_M) return;
    if (kind === 'lake' && f.geometry.type === 'polygon' && ringArea(f.geometry.ring) < MIN_LAKE_M2) return;
    seenSources.add(f.id);
    const d = SOURCE_DEFAULTS[kind];
    const capacity =
      kind === 'data-centre' && footprintM2 ? Math.round((footprintM2 * DATA_CENTRE_W_PER_M2) / 10_000) * 10_000 : d.capacityW;
    sources.push({
      id: f.id,
      kind,
      name: f.tags['name'] ?? null,
      at,
      distanceM: Math.round(distanceM),
      ...(kind === 'supermarket' && distanceM > 0
        ? { exchange: 'waste-heat' as const, estimatedCapacityW: SUPERMARKET_HOMES * HOME_AVERAGE_HEAT_W, temperature: 30 }
        : { exchange: d.exchange, estimatedCapacityW: capacity, temperature: d.temperature }),
    });
  };

  for (const f of data.features) {
    if (f.geometry.type !== 'polygon' || !f.tags['building']) continue;
    const ring = f.geometry.ring;
    const c = centroid(ring);
    if (!pointInRing(c, boundary)) continue;
    const footprint = ringArea(ring);

    // POIs inside the footprint lend their tags when the building has none.
    const [w, s, e, n] = bbox(ring);
    const inside = points.filter((p) => {
      const [x, y] = (p.geometry as { at: LonLat }).at;
      return x >= w && x <= e && y >= s && y <= n && pointInRing([x, y], ring);
    });

    let decision: Decision | null = null;
    if (UNHEATED.has(f.tags['building'] ?? '')) {
      decision = { archetype: null, guessed: false, reason: `building=${f.tags['building']}: not heated` };
    } else if (footprint < MIN_FOOTPRINT_M2) {
      decision = { archetype: null, guessed: true, reason: 'Too small to be heated on its own' };
    }
    decision ??= fromTags(f.tags, footprint);
    if (!decision) {
      for (const p of inside) {
        const d = fromTags(p.tags, footprint);
        if (d) {
          decision = { ...d, reason: `${d.reason} (a point inside it)` };
          break;
        }
      }
    }
    const matches = fema.filter((x) => sameBuilding(ring, c, x.s.ring, x.centre));
    for (const m of matches) claimedFema.add(m.s.id);
    const fed: Federal = { fema: matches[0]?.s ?? null, nsi: nsiInside(nsi, ring) };
    // Federal data replaces a guess (building=residential by size, commercial
    // as an office), never a tag that named the use.
    if (!decision || (decision.guessed && decision.archetype !== null)) decision = fromFederal(fed, footprint) ?? decision;
    if (!decision) {
      const lu = landuse.find((l) => pointInRing(c, (l.geometry as { ring: Ring }).ring));
      decision = fromLanduse(lu?.tags['landuse'], footprint);
    }
    decision ??= residentialBySize(footprint, 'Untagged; most untagged US buildings are homes — type from its size');

    const tagged = levelsOf(f.tags, decision.archetype);
    const fedLevels = tagged.guessed ? federalLevels(fed) : null;
    const levels = fedLevels?.levels ?? tagged.levels;
    const levelsGuessed = tagged.guessed;
    const levelsSource = !tagged.guessed ? 'osm' : fedLevels ? fedLevels.source : 'default';
    const floorArea = decision.archetype ? footprint * levels * CONDITIONED_FRACTION : 0;
    const archetype = decision.archetype ? sizeOffice(decision.archetype, floorArea) : null;
    const osmVintage = vintageOf(f.tags);
    const medianYear = fed.nsi.find((x) => x.medianYearBuilt !== null)?.medianYearBuilt ?? null;

    let anchor = anchorOf(f.tags);
    for (const p of inside) anchor ??= anchorOf(p.tags);

    buildings.push({
      id: f.id,
      footprint: ring,
      footprintM2: Math.round(footprint),
      name: f.tags['name'] ?? inside.find((p) => p.tags['name'])?.tags['name'] ?? null,
      archetype,
      archetypeGuessed: decision.guessed,
      reason: decision.reason,
      levels,
      levelsGuessed,
      floorArea: Math.round(floorArea),
      vintage: osmVintage ?? (medianYear !== null ? yearBand(medianYear) : null),
      anchor,
      origin: 'osm',
      levelsSource,
      vintageSource: osmVintage ? 'osm' : medianYear !== null ? 'nsi-median' : null,
    });

    const kind = sourceKind(f.tags) ?? inside.map((p) => sourceKind(p.tags)).find((k) => k !== null) ?? null;
    if (kind) addSource(f, kind, footprint);
  }

  // FEMA footprints no OSM building covers: buildings OSM does not have.
  const osmRings = buildings.map((b) => ({ ring: b.footprint, centre: centroid(b.footprint) }));
  for (const { s, centre } of fema) {
    if (claimedFema.has(s.id) || s.outbuilding || !pointInRing(centre, boundary)) continue;
    if (osmRings.some((o) => sameBuilding(o.ring, o.centre, s.ring, centre))) continue;
    const footprint = ringArea(s.ring);
    if (footprint < MIN_FOOTPRINT_M2) continue;
    const fed: Federal = { fema: s, nsi: nsiInside(nsi, s.ring) };
    const found = fromFederal(fed, footprint) ?? residentialBySize(footprint, 'Type from its size');
    const decision = { ...found, reason: `${data.osmUnavailable ? 'OpenStreetMap unavailable.' : 'Not in OpenStreetMap.'} ${found.reason}` };
    const fl = federalLevels(fed);
    const levels = fl?.levels ?? (decision.archetype ? DEFAULT_LEVELS[decision.archetype] : 1);
    const floorArea = decision.archetype ? footprint * levels * CONDITIONED_FRACTION : 0;
    const medianYear = fed.nsi.find((x) => x.medianYearBuilt !== null)?.medianYearBuilt ?? null;
    buildings.push({
      id: s.id,
      footprint: s.ring,
      footprintM2: Math.round(footprint),
      name: null,
      archetype: decision.archetype ? sizeOffice(decision.archetype, floorArea) : null,
      archetypeGuessed: true,
      reason: decision.reason,
      levels,
      levelsGuessed: true,
      floorArea: Math.round(floorArea),
      vintage: medianYear !== null ? yearBand(medianYear) : null,
      anchor: null,
      origin: 'fema',
      levelsSource: fl?.source ?? 'default',
      vintageSource: medianYear !== null ? 'nsi-median' : null,
    });
  }

  // Sources that are not buildings inside the boundary: nearby plants, water.
  for (const f of data.features) {
    if (f.tags['building'] && f.geometry.type === 'polygon' && pointInRing(centroid(f.geometry.ring), boundary)) continue;
    const kind = sourceKind(f.tags);
    if (kind) addSource(f, kind, f.geometry.type === 'polygon' ? ringArea(f.geometry.ring) : null);
  }

  const barriers: Barrier[] = [];
  let openSpace = 0;
  for (const f of data.features) {
    const t = f.tags;
    const path = f.geometry.type === 'line' ? f.geometry.path : f.geometry.type === 'polygon' ? f.geometry.ring : null;
    if (path && (['motorway', 'trunk', 'primary'].includes(t['highway'] ?? '') || t['railway'] === 'rail' || t['waterway'] === 'river')) {
      if (lineCrossesRing(path, boundary)) {
        barriers.push({
          id: f.id,
          kind: t['highway'] ? 'highway' : t['railway'] ? 'railway' : 'river',
          name: t['name'] ?? null,
        });
      }
    }
    const open =
      ['park', 'pitch', 'playground'].includes(t['leisure'] ?? '') ||
      (t['amenity'] === 'parking' && (t['parking'] ?? 'surface') === 'surface') ||
      ['grass', 'recreation_ground'].includes(t['landuse'] ?? '');
    if (open && f.geometry.type === 'polygon' && pointInRing(centroid(f.geometry.ring), boundary)) {
      openSpace += ringArea(f.geometry.ring);
    }
  }

  // One entry per named barrier (a road is often many ways), and one per kind
  // for the unnamed ones: eight unnamed rail sidings are one railway.
  const uniqueBarriers = barriers.filter(
    (b, i) => barriers.findIndex((o) => o.kind === b.kind && o.name === b.name) === i,
  );

  sources.sort((a, b) => a.distanceM - b.distanceM);
  return {
    placeName: neighbourhoodName(data.features, boundary),
    boundary,
    areaM2: Math.round(ringArea(boundary)),
    buildings,
    sources,
    barriers: uniqueBarriers,
    openSpaceM2: Math.round(openSpace),
    skipped: data.skipped,
    ...(data.osmUnavailable ? { osmUnavailable: true as const } : {}),
    ...(data.structures
      ? { structures: { fema: data.structures.fema !== null, nsi: data.structures.nsi !== null, femaTruncated: Boolean(data.structures.femaTruncated) } }
      : {}),
  };
}

const PLACE_RANK: Record<string, number> = { neighbourhood: 0, quarter: 1, suburb: 2 };

function neighbourhoodName(features: SiteData['features'], boundary: Ring): string | null {
  const centre = centroid(boundary);
  const named = features
    .filter((f) => f.geometry.type === 'point' && f.tags['place'] && f.tags['name'] && PLACE_RANK[f.tags['place']] !== undefined)
    .map((f) => {
      const at = f.geometry.type === 'point' ? f.geometry.at : centre;
      return { name: f.tags['name']!, inside: pointInRing(at, boundary), d: distance(at, centre), rank: PLACE_RANK[f.tags['place']!]! };
    })
    // Inside first; then the finer kind (a neighbourhood over a suburb); then nearest.
    .sort((a, b) => Number(b.inside) - Number(a.inside) || a.rank - b.rank || a.d - b.d);
  return named[0]?.name ?? null;
}

/** Bore-field room in open space at a 6 m grid. A rough ceiling, stated. */
export function boreholeRoom(openSpaceM2: number): number {
  return Math.floor(openSpaceM2 / 36);
}
