/**
 * Numbers for people. Every figure with a unit goes through `withUnit`, which
 * converts from canonical SI and reads the label from LABELS — so a unit
 * switch can never relabel a number without converting it.
 */
import { LABELS, toDisplay } from '../units/units';
import type { Quantity, UnitSystem } from '../units/units';

/** Three significant figures, grouped: 1,230 · 45.6 · 0.789. */
export function sig(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const rounded = Number(value.toPrecision(digits));
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function withUnit(quantity: Quantity, si: number, units: UnitSystem, digits = 3): string {
  return `${sig(toDisplay(quantity, si, units), digits)} ${LABELS[units][quantity]}`;
}

/** A range with the unit once: "440–1,300 billion Btu/mi²·yr". */
export function rangeWithUnit(quantity: Quantity, lowSi: number, highSi: number, units: UnitSystem, digits = 2): string {
  return `${sig(toDisplay(quantity, lowSi, units), digits)}–${sig(toDisplay(quantity, highSi, units), digits)} ${LABELS[units][quantity]}`;
}

export const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** A network's size: tons in IP (the unit HEET's 300-ton point is written in), MW in SI. */
export function networkSize(tons: number, units: UnitSystem): string {
  return units === 'ip' ? `${sig(tons, 3)} tons` : withUnit('powerLarge', (tons * 3_516.85) / 1e6, units);
}

/** Tonnes of CO₂ — metric in both systems, as reporting convention has it. */
export const tonnes = (kg: number) => `${sig(kg / 1000)} t CO₂`;
