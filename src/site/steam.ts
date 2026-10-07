/**
 * District steam connections in New York City (phase 14), from the city's
 * Local Law 84 benchmarking disclosure (NYC Open Data, 5zyy-y8am).
 *
 * A flag, never a quantity: a building that reports district steam use in its
 * latest year is on steam today. That says how it is heated and what a
 * network connection would replace. The steam figure itself is not carried —
 * comparing reported energy with modelled loads is on hold (BACKLOG, phase
 * 14). Nothing here reaches the loads or the score.
 *
 * LL84 covers properties over 25,000 ft²; a building not listed may still be
 * on steam.
 */
import type { LonLat } from './geometry.ts';

export const LL84_HOST = 'data.cityofnewyork.us';

/** Local Law 84 covers properties over 25,000 ft². */
export const LL84_MIN_FLOOR_M2 = 25_000 * 0.09290304;
export const LL84_DATASET = '5zyy-y8am';

/** New York City's five boroughs, generously: [w, s, e, n]. */
export const NYC_BOX: readonly [number, number, number, number] = [-74.26, 40.49, -73.69, 40.92];

export function touchesNyc(box: readonly [number, number, number, number]): boolean {
  const [w, s, e, n] = box;
  return w <= NYC_BOX[2] && e >= NYC_BOX[0] && s <= NYC_BOX[3] && n >= NYC_BOX[1];
}

export interface SteamProperty {
  /** LL84 property_id. */
  readonly id: string;
  readonly name: string | null;
  readonly address: string | null;
  readonly type: string | null;
  readonly at: LonLat;
  /** The report year this property's flag comes from. */
  readonly year: number;
}

export interface SteamData {
  /** The latest report year among the properties found. */
  readonly year: number | null;
  /** LL84 properties in the box, in their latest year: on steam or not. */
  readonly properties: number;
  /** Those reporting district steam use in their latest year. */
  readonly steam: readonly SteamProperty[];
}

/** The SoQL request for a box, latest years first. */
export function ll84Url(box: readonly [number, number, number, number]): string {
  const [w, s, e, n] = box.map((x) => Number(x.toFixed(6)));
  const url = new URL(`https://${LL84_HOST}/resource/${LL84_DATASET}.json`);
  url.searchParams.set('$select', 'property_id,property_name,address_1,primary_property_type,latitude,longitude,district_steam_use_kbtu,report_year');
  url.searchParams.set('$where', `latitude between ${s} and ${n} AND longitude between ${w} and ${e}`);
  url.searchParams.set('$order', 'report_year DESC');
  url.searchParams.set('$limit', '5000');
  return url.toString();
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * Rows → each property's latest year, flagged when that year reports district
 * steam above zero. "Not Available" and blanks are not steam.
 */
export function normaliseLl84(rows: readonly Record<string, unknown>[]): SteamData {
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const id = text(r['property_id']);
    const year = Number(r['report_year']);
    if (!id || !Number.isFinite(year)) continue;
    const seen = latest.get(id);
    if (!seen || Number(seen['report_year']) < year) latest.set(id, r);
  }
  const steam: SteamProperty[] = [];
  let year: number | null = null;
  for (const [id, r] of latest) {
    const y = Number(r['report_year']);
    year = Math.max(year ?? y, y);
    const kbtu = Number.parseFloat(String(r['district_steam_use_kbtu'] ?? ''));
    const lat = Number(r['latitude']);
    const lon = Number(r['longitude']);
    if (!(kbtu > 0) || !Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
    steam.push({ id, name: text(r['property_name']), address: text(r['address_1']), type: text(r['primary_property_type']), at: [lon, lat], year: y });
  }
  steam.sort((a, b) => a.id.localeCompare(b.id));
  return { year, properties: latest.size, steam };
}
