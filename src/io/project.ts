/**
 * The project file (phase 11): save a neighbourhood and its design as JSON,
 * open it later, carry on. Psychrometric Studio's pattern — a named format, a
 * version, MIGRATIONS for older files, refuse anything newer or malformed.
 *
 * The file carries a SNAPSHOT of what the relay returned — the place, the raw
 * OSM buildings and the weather year — so it opens with no network call
 * (Overpass down, a train, a later OSM edit) and the study stays the study
 * that was saved. "Re-read OpenStreetMap" refreshes it on purpose.
 *
 * The raw buildings are kept, not the classified site: opening re-classifies,
 * so a file picks up classifier fixes rather than freezing old guesses.
 *
 * The design, selection and boundary go through the same validators as a
 * share link (`share.ts`), so the two cannot disagree about what is valid.
 * Canonical SI throughout; `units` is only the display the player left.
 */
import type { Design } from '../engine/design';
import type { SitePayload, WeatherPayload } from '../relay/relay';
import type { Ring } from '../site/geometry';
import type { Selection } from '../site/neighbourhood';
import type { SiteData } from '../site/osm';
import type { UnitSystem } from '../units/units';
import type { PlaceEdits } from '../ui/useSite';
import { isNum, isPoint, parseSelection, parseSources, pt } from './share.ts';

export const PROJECT_FORMAT = 'thermal-network-studio';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.thermal-network.json';

export interface Project {
  readonly saved: string;
  readonly boundary: Ring;
  readonly selection: Selection;
  readonly design: Design;
  readonly challenge: string | null;
  readonly placeEdits: PlaceEdits;
  readonly units: UnitSystem;
  readonly snapshot: {
    readonly place: SitePayload;
    readonly buildings: SiteData;
    readonly weather: WeatherPayload;
  };
}

/**
 * Older versions upgrade one step at a time: MIGRATIONS[n] turns a version-n
 * object into version n + 1. Empty until the format first changes.
 */
export const MIGRATIONS: Record<number, (o: Record<string, unknown>) => Record<string, unknown>> = {};

export function projectJson(p: Project): string {
  const body = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    saved: p.saved,
    place: p.placeEdits,
    units: p.units,
    challenge: p.challenge,
    boundary: p.boundary.map(pt),
    selection: { excluded: [...p.selection.excluded], overrides: [...p.selection.overrides.entries()] },
    design: {
      sources: p.design.sources.map((x) => (x.at ? { ...x, at: pt(x.at) } : x)),
      band: p.design.band,
      retrofit: p.design.retrofit,
    },
    snapshot: p.snapshot,
  };
  // Compact: pretty-printed, the 26,280 weather hours each take a line.
  return JSON.stringify(body);
}

export type OpenResult = { ok: true; project: Project } | { ok: false; reason: 'format' | 'newer' | 'malformed' };

const isNumbers = (x: unknown, n: number) => Array.isArray(x) && x.length === n && x.every(isNum);
const isStr = (x: unknown): x is string => typeof x === 'string';

function snapshotOf(x: unknown): Project['snapshot'] | null {
  if (!x || typeof x !== 'object') return null;
  const s = x as Record<string, unknown>;
  const place = s.place as Record<string, unknown> | undefined;
  const buildings = s.buildings as Record<string, unknown> | undefined;
  const weather = s.weather as Record<string, unknown> | undefined;
  if (!place || !isStr(place.zone) || !isStr(place.region) || !isStr(place.countyFips)) return null;
  if (!buildings || buildings.version !== 1 || !Array.isArray(buildings.features) || !Array.isArray(buildings.boundary)) return null;
  if (!weather || !isNum(weather.year) || !isNum(weather.firstWeekday)) return null;
  if (!isNumbers(weather.temperature, 8760) || !isNumbers(weather.relativeHumidity, 8760) || !isNumbers(weather.ghi, 8760)) return null;
  return x as Project['snapshot'];
}

/** Read a project file's text. Never throws; a file it cannot fully read is refused. */
export function openProject(text: string): OpenResult {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'format' };
  }
  if (!o || typeof o !== 'object' || o.format !== PROJECT_FORMAT) return { ok: false, reason: 'format' };
  if (!isNum(o.version)) return { ok: false, reason: 'malformed' };
  if (o.version > PROJECT_VERSION) return { ok: false, reason: 'newer' };
  for (let v = o.version; v < PROJECT_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, reason: 'malformed' };
    o = step(o);
  }

  if (!Array.isArray(o.boundary) || o.boundary.length < 4 || !o.boundary.every(isPoint)) return { ok: false, reason: 'malformed' };
  const d = o.design as Record<string, unknown> | undefined;
  const band = d?.band as Record<string, unknown> | undefined;
  if (!d || !band || !isNum(band.min) || !isNum(band.max) || !isNum(d.retrofit)) return { ok: false, reason: 'malformed' };
  const sources = parseSources(d.sources);
  if (!sources) return { ok: false, reason: 'malformed' };
  const sel = (o.selection ?? {}) as Record<string, unknown>;
  const snapshot = snapshotOf(o.snapshot);
  if (!snapshot) return { ok: false, reason: 'malformed' };
  const place = (o.place ?? {}) as Record<string, unknown>;
  const placeEdits: PlaceEdits = {
    ...(isStr(place.neighbourhood) ? { neighbourhood: place.neighbourhood } : {}),
    ...(isStr(place.town) ? { town: place.town } : {}),
    ...(isStr(place.state) ? { state: place.state } : {}),
  };

  return {
    ok: true,
    project: {
      saved: isStr(o.saved) ? o.saved : '',
      boundary: o.boundary as [number, number][],
      selection: parseSelection(sel.excluded, sel.overrides),
      design: { sources, band: { min: band.min, max: band.max }, retrofit: d.retrofit },
      challenge: isStr(o.challenge) ? o.challenge : null,
      placeEdits,
      units: o.units === 'si' ? 'si' : 'ip',
      snapshot,
    },
  };
}

/** A file name from the place: "highland-park-st-paul.thermal-network.json". */
export function projectFilename(parts: readonly (string | null | undefined)[]): string {
  const slug = parts
    .filter((x): x is string => !!x && x.trim() !== '')
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
  return `${slug || 'neighbourhood'}${PROJECT_EXTENSION}`;
}
