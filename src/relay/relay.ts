/**
 * The relay: every piece of judgement between the browser and the four
 * services the map needs. `worker/handler.ts` and the Vite dev middleware are
 * adapters over this file, so the logic running at the edge is the logic
 * exercised locally (Heat Balance Studio's rule, and its pattern).
 *
 *   GET  /api/place?q=            Open-Meteo geocoder     → places to fly to
 *   GET  /api/site?lat=&lon=      Census geocoder         → county, climate zone, grid region
 *   GET  /api/weather?lat=&lon=   Open-Meteo archive      → a year, hourly, local standard time
 *   POST /api/buildings           Overpass                → a normalised site
 *
 * Why relay at all: the CSP keeps `connect-src 'self'` for data; the edge
 * cache is shared by everyone looking at the same place; and the browser gets
 * a small normalised answer, not megabytes of raw Overpass.
 */
import { COUNTY_REGION, GEA_REGIONS } from '../engine/generated/cambium.ts';
import { COUNTY_NAME, COUNTY_ZONE } from '../engine/generated/counties.ts';
import { normaliseZone } from '../loads/zones.ts';
import type { ClimateZone } from '../loads/zones.ts';
import { boundaryProblem, normaliseElements, overpassQuery } from '../site/osm.ts';
import type { OverpassElement, SiteData } from '../site/osm.ts';
import type { Ring } from '../site/geometry.ts';

export type Fetcher = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<Response>;

export interface RelayResult {
  readonly status: number;
  readonly body: unknown;
  /** Seconds the edge may cache a success. */
  readonly cacheSeconds?: number;
}

export const PATHS = {
  place: '/api/place',
  site: '/api/site',
  weather: '/api/weather',
  buildings: '/api/buildings',
} as const;

/**
 * Exact hosts, never suffixes: `overpass-api.de.example.com` ends with an
 * allowed string, and a relay that fetches whatever it is handed is an open
 * proxy on our own domain.
 */
export const ALLOWED_HOSTS = Object.freeze([
  'geocoding-api.open-meteo.com',
  'archive-api.open-meteo.com',
  'geocoding.geo.census.gov',
  'overpass-api.de',
]);

export function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.includes(hostname.toLowerCase());
}

/** Bump to invalidate every cached answer when a derivation changes. */
export const RELAY_VERSION = '2';

const DAY = 86400;
export const CACHE = { place: 30 * DAY, site: 365 * DAY, weather: 30 * DAY, buildings: 7 * DAY } as const;

export const ATTRIBUTION = {
  weather: 'Weather © Open-Meteo (ERA5), CC BY 4.0',
  osm: '© OpenStreetMap contributors, ODbL',
  census: 'County from the U.S. Census Bureau geocoder',
} as const;

const problem = (status: number, message: string): RelayResult => ({ status, body: { message } });

export function isRelayResult(value: unknown): value is RelayResult {
  return typeof value === 'object' && value !== null && 'status' in value && 'body' in value;
}

function coordinates(params: URLSearchParams): { lat: number; lon: number } | RelayResult {
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return problem(400, 'Give a latitude and longitude.');
  }
  return { lat, lon };
}

/** ~1.1 km: fine enough to be the same weather, coarse enough to share. */
export const round2 = (x: number) => Math.round(x * 100) / 100;

// -------------------------------------------------------------------- place

export interface Place {
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
}

export async function handlePlace(params: URLSearchParams, fetcher: Fetcher): Promise<RelayResult> {
  const q = (params.get('q') ?? '').trim();
  if (q.length < 2) return problem(400, 'Type a place — "Boston, Massachusetts".');
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', '6');
  url.searchParams.set('countryCode', 'US');
  try {
    const response = await fetcher(url.toString());
    if (!response.ok) return problem(502, `The place search returned ${response.status}. Try again shortly.`);
    const json = (await response.json()) as { results?: Record<string, unknown>[] };
    const places: Place[] = (json.results ?? [])
      .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number' && typeof r.name === 'string')
      .map((r) => ({
        label: [r.name, r.admin1].filter(Boolean).join(', '),
        latitude: r.latitude as number,
        longitude: r.longitude as number,
      }));
    // Never silently take the first match (Heat Balance Studio: "Boston,
    // Massachusetts" returns Boston, then Pittsfield). The UI shows them all.
    return { status: 200, body: { places, attribution: ATTRIBUTION.weather }, cacheSeconds: CACHE.place };
  } catch {
    return problem(504, 'The place search could not be reached.');
  }
}

// --------------------------------------------------------------------- site

export interface SitePayload {
  readonly countyFips: string;
  readonly county: string;
  readonly zone: ClimateZone;
  readonly region: (typeof GEA_REGIONS)[number];
  readonly attribution: string;
  /** The town or city, when the point is in one (Census place), else null. */
  readonly town?: string | null;
  /** Two-letter state, e.g. "MN". */
  readonly state?: string | null;
}

interface CensusFeature {
  readonly GEOID?: string;
  readonly BASENAME?: string;
  readonly NAME?: string;
  readonly STUSAB?: string;
}

/**
 * Town and state from the Census geocoder's answer. A town is an incorporated
 * place, else a census-designated place, else the county subdivision (a New
 * England town, a Midwest township) — whatever the point is actually in.
 * Pure, so the tests read it without the network.
 */
export function placeNames(geographies: Record<string, readonly CensusFeature[] | undefined>): { town: string | null; state: string | null } {
  const first = (layer: string) => geographies[layer]?.[0];
  const town =
    first('Incorporated Places')?.BASENAME ??
    first('Census Designated Places')?.BASENAME ??
    first('County Subdivisions')?.BASENAME ??
    null;
  const state = first('States')?.STUSAB ?? null;
  return { town: town && town.trim() ? town.trim() : null, state };
}

/** County FIPS → what the engine needs. Pure; tested without the network. */
export function siteForCounty(fips: string): SitePayload | null {
  const rawZone = COUNTY_ZONE[fips];
  const regionIndex = COUNTY_REGION[fips];
  const zone = rawZone ? normaliseZone(rawZone) : null;
  if (!zone || regionIndex === undefined) return null;
  return {
    countyFips: fips,
    county: COUNTY_NAME[fips] ?? fips,
    zone,
    region: GEA_REGIONS[regionIndex]!,
    attribution: ATTRIBUTION.census,
  };
}

export async function handleSite(params: URLSearchParams, fetcher: Fetcher): Promise<RelayResult> {
  const c = coordinates(params);
  if (isRelayResult(c)) return c;
  const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates');
  url.searchParams.set('x', String(c.lon));
  url.searchParams.set('y', String(c.lat));
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('vintage', 'Current_Current');
  url.searchParams.set('layers', 'Counties,Incorporated Places,Census Designated Places,County Subdivisions,States');
  url.searchParams.set('format', 'json');
  try {
    const response = await fetcher(url.toString());
    if (!response.ok) return problem(502, `The county lookup returned ${response.status}. Try again shortly.`);
    const json = (await response.json()) as { result?: { geographies?: Record<string, CensusFeature[] | undefined> } };
    const geographies = json.result?.geographies ?? {};
    const fips = geographies['Counties']?.[0]?.GEOID;
    if (!fips) return problem(422, 'That point is not in a U.S. county. This tool covers the United States only.');
    const site = siteForCounty(fips);
    if (!site) return problem(422, `County ${fips} has no climate zone or grid region in this tool's tables (Hawaii and Alaska grids are not in Cambium).`);
    return { status: 200, body: { ...site, ...placeNames(geographies) }, cacheSeconds: CACHE.site };
  } catch {
    return problem(504, 'The county lookup could not be reached.');
  }
}

// ------------------------------------------------------------------ weather

export interface WeatherPayload {
  readonly year: number;
  readonly timezone: string;
  /** °C, 8760 hours from 1 January 00:00 local STANDARD time. */
  readonly temperature: readonly number[];
  /** %. */
  readonly relativeHumidity: readonly number[];
  /** W/m², global horizontal. */
  readonly ghi: readonly number[];
  /** 0 = Monday. */
  readonly firstWeekday: number;
  readonly attribution: string;
}

/** Standard (winter-time) UTC offset of an IANA zone, seconds. From heat-balance. */
export function standardOffsetSeconds(timeZone: string): number {
  const offsetAt = (iso: string): number => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(iso));
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
  };
  return Math.min(offsetAt('2024-01-15T12:00:00Z'), offsetAt('2024-07-15T12:00:00Z'));
}

export function weatherYear(today = new Date()): number {
  return today.getUTCFullYear() - 1;
}

export function weatherUrl(lat: number, lon: number, year: number): string {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', String(round2(lat)));
  url.searchParams.set('longitude', String(round2(lon)));
  // A day either side, so the shift to standard time has hours to draw on.
  url.searchParams.set('start_date', `${year - 1}-12-31`);
  url.searchParams.set('end_date', `${year + 1}-01-01`);
  url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,shortwave_radiation');
  url.searchParams.set('timezone', 'auto');
  return url.toString();
}

/**
 * Open-Meteo's archive applies ONE UTC offset to the whole response —
 * whichever is in force when the request is made (Heat Balance Studio found
 * this; see its CLAUDE.md). So the labelled hours are shifted by
 * (standard − applied) to land on local standard time, whatever month the
 * tool is used in. Then 1 January 00:00 standard is found and 8760 hours
 * taken, dropping 29 February in a leap year.
 */
export function yearFromArchive(json: unknown, year: number): WeatherPayload {
  const j = json as {
    timezone?: string;
    utc_offset_seconds?: number;
    hourly?: { time?: string[]; temperature_2m?: (number | null)[]; relative_humidity_2m?: (number | null)[]; shortwave_radiation?: (number | null)[] };
  };
  const times = j.hourly?.time;
  const t = j.hourly?.temperature_2m;
  const rh = j.hourly?.relative_humidity_2m;
  const sw = j.hourly?.shortwave_radiation;
  if (!times || !t || !rh || !sw || typeof j.utc_offset_seconds !== 'number' || !j.timezone) {
    throw new Error('The weather archive answered without hourly data.');
  }
  const shiftHours = Math.round((standardOffsetSeconds(j.timezone) - j.utc_offset_seconds) / 3600);
  // Label L in applied time is L + shift in standard time; standard hour s
  // therefore reads the value labelled s − shift.
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const total = leap ? 8784 : 8760;
  const start = times.indexOf(`${year}-01-01T00:00`) - shiftHours;
  if (times.indexOf(`${year}-01-01T00:00`) < 0 || start < 0 || start + total > times.length) {
    throw new Error('The weather archive answered with too few hours.');
  }
  /** 8760 values; a missing hour takes the previous hour's (ERA5 has almost none). */
  const pick = (series: (number | null)[], missing: 'previous' | 'zero'): number[] => {
    const out: number[] = [];
    for (let i = 0; i < total; i++) {
      // 29 February is day 59 (0-based) of a leap year.
      if (leap && i >= 59 * 24 && i < 60 * 24) continue;
      const v = series[start + i];
      out.push(typeof v === 'number' ? v : missing === 'zero' || out.length === 0 ? 0 : out[out.length - 1]!);
    }
    return out;
  };
  const temperature = pick(t, 'previous');
  const humidity = pick(rh, 'previous');
  const ghi = pick(sw, 'zero');

  return {
    year,
    timezone: j.timezone,
    temperature: temperature.map((v) => Math.round(v * 10) / 10),
    relativeHumidity: humidity.map((v) => Math.round(v)),
    ghi: ghi.map((v) => Math.max(0, Math.round(v))),
    firstWeekday: (new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7,
    attribution: ATTRIBUTION.weather,
  };
}

export function weatherCacheKey(lat: number, lon: number, year: number): string {
  return `weather|${RELAY_VERSION}|${round2(lat)}|${round2(lon)}|${year}`;
}

export async function handleWeather(params: URLSearchParams, fetcher: Fetcher, today = new Date()): Promise<RelayResult> {
  const c = coordinates(params);
  if (isRelayResult(c)) return c;
  const year = weatherYear(today);
  try {
    const response = await fetcher(weatherUrl(c.lat, c.lon, year));
    if (response.status === 429) return problem(503, 'The weather service is at its daily limit. Try again later.');
    if (!response.ok) return problem(502, `The weather service returned ${response.status}.`);
    return { status: 200, body: yearFromArchive(await response.json(), year), cacheSeconds: CACHE.weather };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The weather archive')) return problem(502, error.message);
    return problem(504, 'The weather service could not be reached.');
  }
}

// ---------------------------------------------------------------- buildings

export function parseBoundary(body: unknown): Ring | RelayResult {
  const b = (body as { boundary?: unknown })?.boundary;
  if (!Array.isArray(b) || b.length > 200) return problem(400, 'Send a boundary of up to 200 points.');
  const ring = b.map((p) => (Array.isArray(p) && p.length === 2 ? ([Number(p[0]), Number(p[1])] as const) : null));
  if (ring.some((p) => p === null)) return problem(400, 'Each boundary point is [longitude, latitude].');
  const clean = ring as [number, number][];
  const first = clean[0]!;
  const last = clean[clean.length - 1]!;
  const closed: Ring = first[0] === last[0] && first[1] === last[1] ? clean : [...clean, first];
  const why = boundaryProblem(closed);
  return why ? problem(400, why) : closed;
}

/** Five decimals (~1 m) — two drawings of the same street share an entry. */
export function buildingsCacheKey(boundary: Ring): string {
  return `buildings|${RELAY_VERSION}|${boundary.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).join(';')}`;
}

export async function handleBuildings(body: unknown, fetcher: Fetcher): Promise<RelayResult> {
  const boundary = parseBoundary(body);
  if (isRelayResult(boundary)) return boundary;
  try {
    const response = await fetcher('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(overpassQuery(boundary))}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (response.status === 429 || response.status === 504) {
      return problem(503, 'OpenStreetMap’s query service is busy. Try again in a minute.');
    }
    if (!response.ok) return problem(502, `OpenStreetMap’s query service returned ${response.status}.`);
    const json = (await response.json()) as { elements?: OverpassElement[]; remark?: string };
    if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) {
      return problem(503, 'That area was too much for OpenStreetMap’s query service. Draw a smaller one.');
    }
    const site: SiteData = normaliseElements(json.elements ?? [], boundary);
    return { status: 200, body: { site, attribution: ATTRIBUTION.osm }, cacheSeconds: CACHE.buildings };
  } catch {
    return problem(504, 'OpenStreetMap’s query service could not be reached.');
  }
}
