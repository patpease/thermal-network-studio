/**
 * Share links: the whole game in the URL fragment, nothing stored (D13).
 *
 * The boundary, what the player changed about the buildings, the design and
 * the challenge. Not the buildings themselves — the link re-reads them from
 * OSM, so it stays short (Heat Balance Studio: a long link gets wrapped by
 * mail clients and cut by chat apps, and looks fine while broken).
 *
 * base64url, because `+`, `/` and `=` are mangled somewhere along the way. A
 * link from a future version is refused rather than half-read; anything
 * malformed decodes to null and the caller starts fresh.
 */
import type { Design, DesignSource } from '../engine/design';
import type { ArchetypeId } from '../loads/archetypes';
import type { LonLat, Ring } from '../site/geometry';
import type { BuildingOverride, Selection } from '../site/neighbourhood';

export const SHARE_VERSION = 1;

export interface Shared {
  readonly boundary: Ring;
  readonly selection: Selection;
  readonly design: Design;
  readonly challenge: string | null;
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
export const pt = (p: LonLat): [number, number] => [r6(p[0]), r6(p[1])];

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeShare(s: Shared): string {
  const body = {
    v: SHARE_VERSION,
    b: s.boundary.map(pt),
    x: [...s.selection.excluded],
    o: [...s.selection.overrides.entries()],
    d: {
      s: s.design.sources.map((x) => (x.at ? { ...x, at: pt(x.at) } : x)),
      b: [s.design.band.min, s.design.band.max],
      r: s.design.retrofit,
    },
    c: s.challenge,
  };
  return toBase64Url(JSON.stringify(body));
}

export const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export const isPoint = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]);
const KINDS = new Set(['bore-field', 'air-source', 'cooling-tower', 'waste-heat', 'water']);

function source(x: unknown): DesignSource | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.kind !== 'string' || !KINDS.has(o.kind)) return null;
  if (o.at !== undefined && !isPoint(o.at)) return null;
  if (o.kind === 'bore-field' ? !isNum(o.boreholes) : !isNum(o.capacityW)) return null;
  if (o.kind === 'waste-heat' && (!isNum(o.temperature) || typeof o.label !== 'string')) return null;
  if (o.kind === 'water' && (typeof o.label !== 'string' || (o.water !== 'sewer' && o.water !== 'surface'))) return null;
  return o as unknown as DesignSource;
}

/** A design's sources, or null if any one is malformed. Shared with the project file. */
export function parseSources(list: unknown): DesignSource[] | null {
  if (!Array.isArray(list)) return null;
  const sources = list.map(source);
  return sources.some((x) => x === null) ? null : (sources as DesignSource[]);
}

/** The player's building changes, keeping only well-formed entries. Shared with the project file. */
export function parseSelection(excludedIn: unknown, overridesIn: unknown): Selection {
  const excluded = Array.isArray(excludedIn) ? excludedIn.filter((x): x is string => typeof x === 'string') : [];
  const overrides = Array.isArray(overridesIn)
    ? overridesIn.filter((e): e is [string, BuildingOverride] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'object' && e[1] !== null)
    : [];
  return {
    excluded: new Set(excluded),
    overrides: new Map(overrides.map(([id, ov]) => [id, { ...(ov.archetype !== undefined ? { archetype: ov.archetype as ArchetypeId | null } : {}), ...(isNum(ov.levels) ? { levels: ov.levels } : {}) }])),
  };
}

export function decodeShare(text: string): Shared | null {
  try {
    const o = JSON.parse(fromBase64Url(text)) as Record<string, unknown>;
    if (o.v !== SHARE_VERSION) return null;
    if (!Array.isArray(o.b) || o.b.length < 4 || !o.b.every(isPoint)) return null;
    const d = o.d as Record<string, unknown> | undefined;
    if (!d || !Array.isArray(d.s) || !Array.isArray(d.b) || !isNum(d.b[0]) || !isNum(d.b[1]) || !isNum(d.r)) return null;
    const sources = parseSources(d.s);
    if (!sources) return null;
    return {
      boundary: o.b as [number, number][],
      selection: parseSelection(o.x, o.o),
      design: { sources, band: { min: d.b[0], max: d.b[1] }, retrofit: d.r },
      challenge: typeof o.c === 'string' ? o.c : null,
    };
  } catch {
    return null;
  }
}

/** A full link to this state, on whatever origin the page is served from. */
export function shareUrl(origin: string, s: Shared): string {
  return `${origin}/#s=${encodeShare(s)}`;
}

/** What the page was opened with: a full shared state, or just a challenge. */
export function readLocation(loc: { hash: string; search: string }): { shared: Shared | null; challenge: string | null } {
  const hash = new URLSearchParams(loc.hash.replace(/^#/, ''));
  const s = hash.get('s');
  const shared = s ? decodeShare(s) : null;
  const challenge = shared?.challenge ?? new URLSearchParams(loc.search).get('challenge');
  return { shared, challenge };
}
