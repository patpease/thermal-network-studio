/**
 * Wastewater treatment plants from EPA's Clean Watersheds Needs Survey 2022
 * (phase 13). `npm run import:cwns` writes one file per state into
 * public/data/cwns/; the browser fetches only the states a site's search box
 * touches, from its own origin (no new CSP origin), and the plants ride on
 * `SiteData.wastewater` so a saved project keeps them.
 *
 * The flow is the plant's DESIGN flow, million gallons a day — what CWNS
 * publishes. Measured flows are reported to EPA elsewhere and are usually
 * lower; the capacity this gives is an estimate the player can change.
 */
import { bbox, type LonLat, type Ring } from './geometry.ts';

export interface WastewaterPlant {
  /** CWNS_ID. */
  readonly id: string;
  readonly name: string;
  readonly city: string | null;
  readonly at: LonLat;
  /** Current design flow, million gallons a day. */
  readonly designMgd: number;
  readonly treatment: string | null;
}

export interface WastewaterData {
  /** The CWNS file the plants came from, e.g. "2022CWNS_NATIONAL_Sept2026". */
  readonly release: string;
  readonly plants: readonly WastewaterPlant[];
}

export const CWNS_PATH = '/data/cwns/';

/** m³ in one million US gallons: MGD × this is m³/day, the canonical flow. */
export const M3_PER_MGD = 3_785.411784;

/** kg/s of water in one million US gallons a day (3,785.41 m³ over 86,400 s). */
export const KG_PER_S_PER_MGD = (M3_PER_MGD * 999.7) / 86_400;
/** J/kg·K. */
const WATER_CP = 4_186;
/**
 * Heat recoverable from wastewater per kelvin of cooling: a stated assumption.
 * Published ranges run 2–5 K; 3 K is the middle.
 */
export const RECOVERABLE_DT_K = 3;

/** Heat a plant's flow could give at the recoverable ΔT, W, to 10 kW. 1 MGD ≈ 0.55 MW. */
export function wastewaterCapacityW(designMgd: number): number {
  return Math.round((designMgd * KG_PER_S_PER_MGD * WATER_CP * RECOVERABLE_DT_K) / 10_000) * 10_000;
}

export interface CwnsIndex {
  readonly release: string;
  readonly retrieved: string;
  readonly states: Readonly<Record<string, { readonly count: number; readonly bbox: readonly [number, number, number, number] }>>;
}

/** The state files whose plants could fall in a box [w, s, e, n]. */
export function statesFor(box: readonly [number, number, number, number], index: CwnsIndex): string[] {
  const [w, s, e, n] = box;
  return Object.entries(index.states)
    .filter(([, v]) => v.bbox[0] <= e && v.bbox[2] >= w && v.bbox[1] <= n && v.bbox[3] >= s)
    .map(([k]) => k)
    .sort();
}

type Fetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * The plants within `marginM` of a boundary's box, or null if the files could
 * not be read. Never throws: a site loads without them.
 */
export async function fetchWastewater(boundary: Ring, marginM: number, fetcher: Fetcher = fetch): Promise<WastewaterData | null> {
  try {
    const box = bbox(boundary, marginM);
    const res = await fetcher(`${CWNS_PATH}index.json`);
    if (!res.ok) return null;
    const index = (await res.json()) as CwnsIndex;
    const files = await Promise.all(
      statesFor(box, index).map(async (st) => {
        const r = await fetcher(`${CWNS_PATH}${st}.json`);
        if (!r.ok) throw new Error(st);
        return (await r.json()) as { plants: { id: string; name: string; city: string | null; lat: number; lon: number; designMgd: number; treatment: string | null }[] };
      }),
    );
    const [w, s, e, n] = box;
    const plants = files
      .flatMap((f) => f.plants)
      .filter((p) => p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n)
      .map((p) => ({ id: p.id, name: p.name, city: p.city, at: [p.lon, p.lat] as LonLat, designMgd: p.designMgd, treatment: p.treatment }));
    return { release: index.release, plants };
  } catch {
    return null;
  }
}
