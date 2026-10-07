/**
 * The relay: every piece of judgement between the browser and the four
 * services the map needs. `worker/handler.ts` and the Vite dev middleware are
 * adapters over this file, so the logic running at the edge is the logic
 * exercised locally (Heat Balance Studio's rule, and its pattern).
 *
 *   GET  /api/place?q=            Open-Meteo geocoder     → places to fly to
 *   GET  /api/site?lat=&lon=      Census geocoder         → county, climate zone, grid region
 *   GET  /api/weather?lat=&lon=   Open-Meteo archive      → a year, hourly, local standard time
 *   POST /api/buildings           Overpass                → a normalised site,
 *                                 + FEMA USA Structures and USACE NSI (phase 12)
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
import { bbox } from '../site/geometry.ts';
import type { Ring } from '../site/geometry.ts';
import { normaliseFema, normaliseNsi, STRUCTURES_ATTRIBUTION } from '../site/structures.ts';
import type { Structures } from '../site/structures.ts';
import { LL84_HOST, ll84Url, normaliseLl84, touchesNyc } from '../site/steam.ts';

export type Fetcher = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number }) => Promise<Response>;

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
  steam: '/api/steam',
} as const;

/**
 * Public Overpass instances, tried in this order (OpenStreetMap wiki,
 * "Overpass API", public instances), both with the same worldwide data.
 *
 * private.coffee first: four servers, and "no rate limit in place — please
 * notify us in advance if you intend to use our service in a large scale
 * project". The main instance second: it allows 4 concurrent queries per IP,
 * calls itself overloaded, and a Worker's requests leave from Cloudflare IPs
 * shared with other Workers. Kumi Systems was dropped (September 2026): it
 * timed out when checked, and a dead third host only delayed the fallback.
 */
export const OVERPASS_HOSTS = Object.freeze(['overpass.private.coffee', 'overpass-api.de']);

/**
 * Each instance gets this long before the next is tried, ms: longer than the
 * query's own [timeout:25], so an answer the server is still producing is
 * never thrown away. Two instances keep the worst case to a minute before
 * the federal fallback.
 */
export const OVERPASS_TIMEOUT_MS = 30_000;

/**
 * Exact hosts, never suffixes: `overpass-api.de.example.com` ends with an
 * allowed string, and a relay that fetches whatever it is handed is an open
 * proxy on our own domain.
 */
/** FEMA USA Structures, as ArcGIS Online serves it; and USACE's NSI API. */
export const FEMA_HOST = 'services2.arcgis.com';
export const NSI_HOST = 'nsi.sec.usace.army.mil';

export const ALLOWED_HOSTS = Object.freeze([
  'geocoding-api.open-meteo.com',
  'archive-api.open-meteo.com',
  'geocoding.geo.census.gov',
  ...OVERPASS_HOSTS,
  FEMA_HOST,
  NSI_HOST,
  LL84_HOST,
]);

export function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.includes(hostname.toLowerCase());
}

/** Bump to invalidate every cached answer when a derivation changes. */
export const RELAY_VERSION = '3';

const DAY = 86400;
export const CACHE = { place: 30 * DAY, site: 365 * DAY, weather: 30 * DAY, buildings: 7 * DAY, steam: 30 * DAY } as const;

export const ATTRIBUTION = {
  weather: 'Weather by Open-Meteo.com (ERA5, Copernicus), CC BY 4.0',
  osm: '© OpenStreetMap contributors, ODbL',
  census: 'County from the U.S. Census Bureau geocoder',
  structures: STRUCTURES_ATTRIBUTION,
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

// -------------------------------------------------------------------- steam

/** A box from ?w=&s=&e=&n=, or a problem. Small boxes only: a site's search box. */
function steamBox(params: URLSearchParams): [number, number, number, number] | RelayResult {
  const box = ['w', 's', 'e', 'n'].map((k) => Number(params.get(k))) as [number, number, number, number];
  const [w, s, e, n] = box;
  if (!box.every(Number.isFinite) || w >= e || s >= n || Math.abs(s) > 90 || Math.abs(n) > 90) return problem(400, 'Give a box: w, s, e, n.');
  if (e - w > 0.1 || n - s > 0.1) return problem(400, 'That box is larger than a site.');
  return box;
}

export function steamCacheKey(params: URLSearchParams): string | null {
  const box = steamBox(params);
  return isRelayResult(box) ? null : `steam|${RELAY_VERSION}|${box.map((x) => x.toFixed(4)).join(',')}`;
}

/**
 * NYC Local Law 84 properties in a box that report district steam in their
 * latest year (phase 14). Outside New York City: an empty answer, no request.
 */
export async function handleSteam(params: URLSearchParams, fetcher: Fetcher): Promise<RelayResult> {
  const box = steamBox(params);
  if (isRelayResult(box)) return box;
  if (!touchesNyc(box)) return { status: 200, body: { steam: null }, cacheSeconds: CACHE.steam };
  try {
    const response = await fetcher(ll84Url(box), { timeoutMs: 15_000 });
    if (!response.ok) return problem(502, `New York City's benchmarking data returned ${response.status}.`);
    const rows = (await response.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows)) return problem(502, "New York City's benchmarking data was not readable.");
    return { status: 200, body: { steam: normaliseLl84(rows) }, cacheSeconds: CACHE.steam };
  } catch {
    return problem(504, "New York City's benchmarking data did not answer.");
  }
}

/** What the player reads when no Overpass instance answers. */
export const OVERPASS_DOWN =
  'OpenStreetMap’s building service is not responding right now. It is run by volunteers and is sometimes overloaded or down. Your boundary is kept: try again in a few minutes.';

/** Each federal service gets this long; it never holds up OSM for longer. */
export const STRUCTURES_TIMEOUT_MS = 15_000;

/** The fields read, and no more: FEMA's full record is ~40 fields. */
const FEMA_FIELDS = ['BUILD_ID', 'OCC_CLS', 'PRIM_OCC', 'HEIGHT', 'OUTBLDG'].join(',');

export function femaUrl(boundary: Ring): string {
  const [w, s, e, n] = bbox(boundary);
  const q = new URLSearchParams({
    where: '1=1',
    geometry: [w, s, e, n].map((x) => x.toFixed(6)).join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: FEMA_FIELDS,
    outSR: '4326',
    resultRecordCount: '2000',
    f: 'geojson',
  });
  return `https://${FEMA_HOST}/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query?${q}`;
}

export function nsiUrl(boundary: Ring): string {
  const [w, s, e, n] = bbox(boundary).map((x) => x.toFixed(6));
  // NSI takes the box as a closed ring of x,y pairs.
  return `https://${NSI_HOST}/nsiapi/structures?bbox=${[w, s, e, s, e, n, w, n, w, s].join(',')}`;
}

/**
 * Both federal sets, in parallel. A failure is null for that set, never an
 * error: the site is still OSM, and the panel says which set is missing.
 */
export async function fetchStructures(boundary: Ring, fetcher: Fetcher): Promise<Structures> {
  const get = async (url: string) => {
    const response = await fetcher(url, { timeoutMs: STRUCTURES_TIMEOUT_MS });
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<unknown>;
  };
  const [fema, nsi] = await Promise.allSettled([get(femaUrl(boundary)), get(nsiUrl(boundary))]);
  let femaOut: Structures['fema'] = null;
  let truncated = false;
  if (fema.status === 'fulfilled' && !(fema.value as { error?: unknown })?.error) {
    const r = normaliseFema(fema.value);
    femaOut = r.structures;
    truncated = r.truncated;
  }
  const nsiOut = nsi.status === 'fulfilled' ? normaliseNsi(nsi.value) : null;
  return { fema: femaOut, nsi: nsiOut, ...(truncated ? { femaTruncated: true } : {}) };
}

/** One try at one Overpass instance: what happened and how long it took. */
export interface OverpassAttempt {
  readonly host: string;
  /**
   * ok: answered. busy: 429, 5xx, or a 200 whose remark says the server is
   * too busy. timeout / unreachable: no answer. html: a 200 that was not
   * JSON. refused: a 4xx other than 429. too-large: the query itself timed out
   * or ran out of memory on the server.
   */
  readonly outcome: 'ok' | 'busy' | 'timeout' | 'unreachable' | 'html' | 'refused' | 'too-large';
  readonly status: number | null;
  readonly ms: number;
}

/**
 * A remark that means the SERVER was busy, not that the query was too big.
 * Overpass answers 200 with "runtime error: … Dispatcher_Client::… timeout.
 * The server is probably too busy to handle your request." when its slots
 * are full; before this was told apart, that sent the player off to draw a
 * smaller area and never tried the next instance.
 */
export function remarkIsBusy(remark: string): boolean {
  return /too busy|Dispatcher_Client|rate_limited|slot/i.test(remark);
}

/** A remark that means this query is too large for any instance. */
export function remarkIsTooLarge(remark: string): boolean {
  return !remarkIsBusy(remark) && /runtime error|timed out|out of memory/i.test(remark);
}

export async function handleBuildings(
  body: unknown,
  fetcher: Fetcher,
  log: (line: string) => void = (line) => console.log(line),
): Promise<RelayResult> {
  const boundary = parseBoundary(body);
  if (isRelayResult(boundary)) return boundary;
  const data = `data=${encodeURIComponent(overpassQuery(boundary))}`;
  // Started now, awaited only once OSM has answered: the two run side by side.
  const structures = fetchStructures(boundary, fetcher);
  const attempts: OverpassAttempt[] = [];
  const note = (a: OverpassAttempt) => attempts.push(a);
  // One structured line per load, for Workers Logs: which instance answered,
  // or what each one did. The live failure rate is read from these.
  const report = (result: 'osm' | 'federal-only' | 'failed' | 'too-large' | 'refused') =>
    log(JSON.stringify({ event: 'buildings', result, attempts }));

  // Try each public instance in turn. Busy (429, 5xx, a busy remark), slow
  // or unreachable → the next one. A 4xx is our query's fault and would fail
  // everywhere, so it stops here; so does a query too large for the server.
  for (const host of OVERPASS_HOSTS) {
    const started = Date.now();
    const ms = () => Date.now() - started;
    let response: Response;
    try {
      response = await fetcher(`https://${host}/api/interpreter`, {
        method: 'POST',
        body: data,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeoutMs: OVERPASS_TIMEOUT_MS,
      });
    } catch (error) {
      const timedOut = error instanceof Error && /timeout|abort/i.test(`${error.name} ${error.message}`);
      note({ host, outcome: timedOut ? 'timeout' : 'unreachable', status: null, ms: ms() });
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      note({ host, outcome: 'busy', status: response.status, ms: ms() });
      continue;
    }
    if (!response.ok) {
      note({ host, outcome: 'refused', status: response.status, ms: ms() });
      report('refused');
      return problem(502, `OpenStreetMap’s building service refused the request (${response.status}).`);
    }
    let json: { elements?: OverpassElement[]; remark?: string };
    try {
      json = (await response.json()) as typeof json;
    } catch {
      note({ host, outcome: 'html', status: response.status, ms: ms() });
      continue; // an HTML error page with a 200: treat as down
    }
    if (json.remark && remarkIsBusy(json.remark)) {
      note({ host, outcome: 'busy', status: response.status, ms: ms() });
      continue;
    }
    if (json.remark && remarkIsTooLarge(json.remark)) {
      note({ host, outcome: 'too-large', status: response.status, ms: ms() });
      report('too-large');
      return problem(503, 'That area is too large for OpenStreetMap’s building service. Draw a smaller one.');
    }
    note({ host, outcome: 'ok', status: response.status, ms: ms() });
    report('osm');
    const site: SiteData = { ...normaliseElements(json.elements ?? [], boundary), structures: await structures };
    // `servedBy` names the instance that answered, for tracing a live problem.
    return {
      status: 200,
      body: { site, attribution: `${ATTRIBUTION.osm}. ${ATTRIBUTION.structures}`, servedBy: host, attempts },
      cacheSeconds: CACHE.buildings,
    };
  }

  // No instance answered. The federal footprints still make a site: buildings
  // with uses and storeys, but no heat sources, open space, land use or names.
  // Not cached, so the next try asks OpenStreetMap again.
  const federal = await structures;
  if (federal.fema && federal.fema.length > 0) {
    report('federal-only');
    const site: SiteData = { version: 1, boundary, features: [], skipped: 0, structures: federal, osmUnavailable: true };
    return { status: 200, body: { site, attribution: ATTRIBUTION.structures, servedBy: null, attempts } };
  }
  report('failed');
  return { status: 503, body: { message: OVERPASS_DOWN, attempts } };
}
