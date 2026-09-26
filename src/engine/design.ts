/**
 * A design as the player holds it: a list of things on the map, each with a
 * size, plus the loop band and an envelope retrofit.
 *
 * This is the UI's shape, not the engine's. It carries what the engine does
 * not need — where a source sits, which found candidate it came from — and
 * leaves out what the engine derives: a lake's hourly temperature is 8,760
 * numbers computed from the weather, and is built by `toNetworkDesign` inside
 * the worker rather than posted across on every keystroke.
 *
 * Position never enters the physics (D12, no pipes). It is on the map so the
 * player can see what they built and where a bore field would have to go.
 */
import type { WeatherYear } from '../loads/model.ts';
import { metresPerDegree } from '../site/geometry.ts';
import type { LonLat } from '../site/geometry.ts';
import { BORE_DEFAULTS } from './ground.ts';
import { DEFAULT_BAND } from './network.ts';
import type { LoopBand, NetworkDesign } from './network.ts';
import { sewerTemperature, surfaceWaterTemperature } from './sources.ts';
import type { Source } from './sources.ts';

export type WaterKind = 'sewer' | 'surface';

interface Placed {
  readonly id: string;
  /** Where the player put it; absent until placed. */
  readonly at?: LonLat;
}

export type DesignSource =
  | (Placed & { readonly kind: 'bore-field'; readonly boreholes: number; readonly depth?: number; readonly spacing?: number })
  | (Placed & { readonly kind: 'air-source'; readonly capacityW: number })
  | (Placed & { readonly kind: 'cooling-tower'; readonly capacityW: number })
  | (Placed & {
      readonly kind: 'waste-heat';
      readonly label: string;
      readonly capacityW: number;
      /** °C */
      readonly temperature: number;
      /** The found candidate it was connected from, if any. */
      readonly origin?: string;
    })
  | (Placed & {
      readonly kind: 'water';
      readonly label: string;
      readonly capacityW: number;
      readonly water: WaterKind;
      readonly origin?: string;
    });

export type DesignSourceKind = DesignSource['kind'];

export interface Design {
  readonly sources: readonly DesignSource[];
  readonly band: LoopBand;
  /** Envelope factor on every connected building; 1 = as built. */
  readonly retrofit: number;
}

export const EMPTY_DESIGN: Design = Object.freeze({ sources: Object.freeze([]) as readonly DesignSource[], band: DEFAULT_BAND, retrofit: 1 });

/** The retrofit choices offered. Factors on envelope + infiltration conductance. */
export const RETROFITS = [
  { factor: 1, label: 'As built' },
  { factor: 0.85, label: 'Light — air sealing, attic insulation' },
  { factor: 0.6, label: 'Deep — walls, windows, roof' },
] as const;

/** The engine's network, with every water temperature built from the weather. */
export function toNetworkDesign(design: Design, weather: WeatherYear): NetworkDesign {
  let sewer: Float64Array | null = null;
  let surface: Float64Array | null = null;
  const sources: Source[] = design.sources.map((s): Source => {
    switch (s.kind) {
      case 'bore-field':
        return {
          kind: 'bore-field',
          id: s.id,
          spec: {
            boreholes: Math.max(1, Math.round(s.boreholes)),
            ...(s.depth !== undefined ? { depth: s.depth } : {}),
            ...(s.spacing !== undefined ? { spacing: s.spacing } : {}),
          },
        };
      case 'air-source':
        return { kind: 'air-source', id: s.id, capacityW: s.capacityW };
      case 'cooling-tower':
        return { kind: 'cooling-tower', id: s.id, capacityW: s.capacityW };
      case 'waste-heat':
        return { kind: 'waste-heat', id: s.id, label: s.label, capacityW: s.capacityW, temperature: s.temperature };
      case 'water': {
        const temperature = s.water === 'sewer' ? (sewer ??= sewerTemperature()) : (surface ??= surfaceWaterTemperature(weather));
        return { kind: 'water', id: s.id, label: s.label, capacityW: s.capacityW, temperature };
      }
    }
  });
  return { sources, band: design.band, retrofit: design.retrofit };
}

/** A bore field's footprint on the ground, m²: a square grid at its spacing. */
export function boreFieldArea(s: { boreholes: number; spacing?: number }): number {
  return Math.max(1, s.boreholes) * (s.spacing ?? BORE_DEFAULTS.spacing) ** 2;
}

/** A point moved by metres east and north — for laying plant out beside each other. */
export function offset(at: LonLat, eastM: number, northM: number): LonLat {
  const m = metresPerDegree(at[1]);
  return [at[0] + eastM / m.x, at[1] + northM / m.y];
}

/**
 * Where a newly added source goes before the player moves it: beside the site
 * centre, stepping round so nothing lands on top of what is already there.
 */
export function defaultSpot(centre: LonLat, index: number): LonLat {
  const ring = Math.floor(index / 6) + 1;
  const angle = (index % 6) * (Math.PI / 3) + ring * 0.5;
  return offset(centre, 70 * ring * Math.cos(angle), 70 * ring * Math.sin(angle));
}

// ----------------------------------------------------------- a first design

/** A candidate found on the site, as far as a suggestion needs it. */
export interface FoundSource {
  readonly id: string;
  readonly kind: string;
  readonly name: string | null;
  readonly at: LonLat;
  readonly exchange: 'waste-heat' | 'water' | 'in-load';
  readonly estimatedCapacityW: number;
  readonly temperature: number | null;
}

export interface SuggestInput {
  /** Peak hourly heating and cooling demand, W. */
  readonly peakHeatingW: number;
  readonly peakCoolingW: number;
  readonly sources: readonly FoundSource[];
  /** Where to put what has no place of its own: the site's centre. */
  readonly centre: LonLat;
  /** How many boreholes the site's open space could hold. */
  readonly boreholeRoom: number;
}

/**
 * Peak heat a borehole can give at design conditions, W. About 40 W per metre
 * over the default 150 m: a rule of thumb for sizing, not a claim about the
 * field (the g-function does the real work once it is built).
 */
export const BOREHOLE_PEAK_W = 6_000;

/** Share of the loop's peak each piece of the suggestion is sized for. */
const SUGGEST = { bores: 0.5, airSource: 0.5, tower: 0.7 } as const;

/** Loop-side heat at the buildings' peak: heating less compressor work. */
const EXTRACTION_PER_HEAT = 0.72;
const REJECTION_PER_COOL = 1.25;

const round = (w: number, step: number) => Math.max(step, Math.round(w / step) * step);

function label(s: FoundSource): string {
  if (s.name) return s.name;
  const k = s.kind.replace('-', ' ');
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/** A found candidate as a design source, at its estimated size. */
export function fromCandidate(s: FoundSource, id: string): DesignSource | null {
  if (s.exchange === 'in-load') return null;
  if (s.exchange === 'waste-heat') {
    return { id, kind: 'waste-heat', at: s.at, label: label(s), capacityW: s.estimatedCapacityW, temperature: s.temperature ?? 30, origin: s.id };
  }
  return { id, kind: 'water', at: s.at, label: label(s), capacityW: s.estimatedCapacityW, water: s.kind === 'wastewater' ? 'sewer' : 'surface', origin: s.id };
}

/**
 * A starting point, never an answer: connect what was found, a bore field as
 * large as the open space allows up to half the peak, an air-source heat pump
 * for the rest of the cold, a tower for the heat. Deliberately unoptimised —
 * improving it is the game.
 */
export function suggestDesign(input: SuggestInput): Design {
  const sources: DesignSource[] = [];
  let n = 0;
  const id = (k: string) => `${k}-${++n}`;

  let found = 0;
  for (const s of input.sources) {
    const d = fromCandidate(s, id(s.exchange));
    if (!d) continue;
    sources.push(d);
    if (d.kind === 'waste-heat' || d.kind === 'water') found += d.capacityW;
  }

  const extraction = input.peakHeatingW * EXTRACTION_PER_HEAT;
  const rejection = input.peakCoolingW * REJECTION_PER_COOL;

  const wanted = Math.ceil((SUGGEST.bores * extraction) / BOREHOLE_PEAK_W);
  const boreholes = Math.min(wanted, input.boreholeRoom);
  if (boreholes >= 10) sources.push({ id: id('bores'), kind: 'bore-field', at: input.centre, boreholes });

  // Plant sits either side of the field, clear of its footprint.
  const clear = Math.sqrt(boreFieldArea({ boreholes: Math.max(boreholes, 1) })) / 2 + 40;

  const air = extraction - boreholes * BOREHOLE_PEAK_W - found;
  if (air > 50_000) sources.push({ id: id('ashp'), kind: 'air-source', at: offset(input.centre, clear, 0), capacityW: round(air, 50_000) });

  const tower = rejection * SUGGEST.tower;
  if (tower > 50_000) sources.push({ id: id('tower'), kind: 'cooling-tower', at: offset(input.centre, -clear, 0), capacityW: round(tower, 50_000) });

  return { sources, band: DEFAULT_BAND, retrofit: 1 };
}

/** A fresh id for a source the player adds. */
export function nextId(design: Design, kind: DesignSourceKind): string {
  const taken = new Set(design.sources.map((s) => s.id));
  for (let i = 1; ; i++) if (!taken.has(`${kind}-${i}`)) return `${kind}-${i}`;
}
