/**
 * What each results chart draws, from one scenario result. Pure functions, no
 * React, no units: the charts convert at the edge like everything else.
 *
 * Kept apart from the drawing so the one claim every chart rests on can be
 * tested — above all that the flow diagram balances, because a Sankey whose
 * two sides differ is a picture of energy appearing from nowhere.
 */
import type { Design, DesignSourceKind } from '../engine/design';
import type { ScenarioResult } from '../engine/scenario';

/** What a mark's colour means. Physics, not identity: never a palette slot. */
export type Role = 'heat' | 'cool' | 'ground' | 'neutral';

const ROLE: Record<DesignSourceKind, Role> = {
  'bore-field': 'ground',
  'air-source': 'heat',
  'cooling-tower': 'cool',
  'waste-heat': 'heat',
  water: 'cool',
};

const NAME: Record<DesignSourceKind, string> = {
  'bore-field': 'Bore field',
  'air-source': 'Air-source heat pump',
  'cooling-tower': 'Cooling tower',
  'waste-heat': 'Waste heat',
  water: 'Water',
};

export interface FlowItem {
  readonly id: string;
  readonly label: string;
  readonly role: Role;
  /** kWh/yr */
  readonly kWh: number;
}

export interface Flows {
  /** Heat put INTO the loop, largest first. */
  readonly into: readonly FlowItem[];
  /** Heat taken OUT of the loop, largest first. */
  readonly out: readonly FlowItem[];
}

/**
 * The year's heat through the loop. In: what cooling and refrigeration
 * reject, plus what each source gives. Out: what heating and hot water draw,
 * plus what each source takes. Balanced hour by hour by construction — every
 * hour's remainder goes to backup — so the two sides agree to rounding.
 */
export function loopFlows(result: ScenarioResult, design: Design): Flows {
  const n = result.network;
  const label = (id: string) => {
    const s = design.sources.find((x) => x.id === id);
    if (!s) return { label: id === 'backup' ? 'Electric backup' : id, role: 'neutral' as Role };
    return { label: 'label' in s && s.label ? s.label : NAME[s.kind], role: ROLE[s.kind] };
  };
  const side = (buildings: FlowItem, gross: Readonly<Record<string, number>>) =>
    [
      buildings,
      ...Object.entries(gross)
        .filter(([, v]) => v > 0)
        .map(([id, kWh]) => ({ id, ...label(id), kWh })),
    ]
      .filter((x) => x.kWh > 0)
      .sort((a, b) => b.kWh - a.kWh);

  return {
    into: side({ id: 'buildings-cooling', label: 'Cooling & refrigeration', role: 'cool', kWh: n.rejectedKWh }, n.sourceInKWh),
    out: side({ id: 'buildings-heating', label: 'Heating & hot water', role: 'heat', kWh: n.extractedKWh }, n.sourceOutKWh),
  };
}

export interface Day {
  readonly day: number;
  /** °C */
  readonly min: number;
  readonly mean: number;
  readonly max: number;
  readonly outdoor: number;
}

/** 8,760 hours → 365 days: the loop's range and mean, and the outdoor mean. */
export function dailyLoop(loop: ArrayLike<number>, outdoor: ArrayLike<number>): Day[] {
  const days: Day[] = [];
  for (let d = 0; d < 365; d++) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let air = 0;
    for (let h = d * 24; h < d * 24 + 24; h++) {
      const t = Number(loop[h]);
      min = Math.min(min, t);
      max = Math.max(max, t);
      sum += t;
      air += Number(outdoor[h]);
    }
    days.push({ day: d, min, mean: sum / 24, max, outdoor: air / 24 });
  }
  return days;
}

export interface Month {
  readonly month: number;
  /** kWh: heat heating drew from the loop, heat cooling put in, and the part of each that met the other. */
  readonly extracted: number;
  readonly rejected: number;
  readonly shared: number;
}

export function monthly(result: ScenarioResult): Month[] {
  const n = result.network;
  return n.sharedByMonth.map((shared, month) => ({
    month,
    extracted: n.extractedByMonth[month] ?? 0,
    rejected: n.rejectedByMonth[month] ?? 0,
    shared,
  }));
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** "12 Mar" for day-of-year 70 (a 365-day year). */
export function dayLabel(day: number): string {
  let m = 11;
  while (m > 0 && MONTH_START[m]! > day) m--;
  return `${day - MONTH_START[m]! + 1} ${MONTHS[m]}`;
}

export const monthStart = (m: number) => MONTH_START[m]!;

/** Clean axis ticks: about `count` round numbers spanning [lo, hi]. */
export function ticks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** A domain widened to round numbers, with its ticks. */
export function niceRange(lo: number, hi: number, count = 5): { lo: number; hi: number; ticks: number[] } {
  if (!(hi > lo)) return { lo: lo - 1, hi: lo + 1, ticks: [lo] };
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag;
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  return { lo: a, hi: b, ticks: ticks(a, b, Math.round((b - a) / step)) };
}
