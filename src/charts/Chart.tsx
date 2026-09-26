/**
 * The pieces every results chart shares: the card with its title, legend and
 * hidden table; the tooltip; the axis text.
 *
 * Every figure is also in a visually hidden table (tooltips enhance, never
 * gate), wrapped in its own box because a table ignores `width: 1px` and made
 * ZEEL's page scroll sideways on a phone.
 *
 * Colours are CSS classes over `--chart-*` tokens, never `style` attributes:
 * the CSP has no 'unsafe-inline'. The tooltip's position is set through the
 * CSSOM (React's style prop on the client), which CSP does not govern.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { Role } from './data';
import { useWidth } from './useWidth';

export interface LegendItem {
  readonly label: string;
  readonly role: Role | 'loop' | 'network';
  readonly key: 'rect' | 'line' | 'wash';
}

export function ChartCard(props: {
  id: string;
  title: string;
  subtitle?: string;
  legend?: readonly LegendItem[];
  table: { caption: string; head: readonly string[]; rows: readonly (readonly string[])[] };
  children: (width: number) => ReactNode;
  note?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  // 0 means not measured (jsdom, first frame): draw at the desk width.
  const { width } = useWidth(box, 0);
  return (
    <figure className="chart card" aria-labelledby={`${props.id}-title`}>
      <h3 id={`${props.id}-title`} className="chart__title">
        {props.title}
      </h3>
      {props.subtitle && <p className="card__note">{props.subtitle}</p>}
      {props.legend && props.legend.length > 1 && (
        <ul className="chart__legend" aria-hidden>
          {props.legend.map((l) => (
            <li key={l.label}>
              <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden>
                {l.key === 'line' ? (
                  <line x1="1" y1="5" x2="17" y2="5" className={`stroke--${l.role}`} strokeWidth="2" strokeLinecap="round" />
                ) : (
                  <rect x="1" y="1" width="16" height="8" rx="2" className={`fill--${l.role}${l.key === 'wash' ? ' wash' : ''}`} />
                )}
              </svg>
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={box} className="chart__plot">
        {props.children(width || 640)}
      </div>
      {props.note && <figcaption className="card__note">{props.note}</figcaption>}
      <div className="visually-hidden">
        <table>
          <caption>{props.table.caption}</caption>
          <thead>
            <tr>
              {props.table.head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export interface TipLine {
  readonly value: string;
  readonly label: string;
  readonly role?: LegendItem['role'];
}

/** One tooltip per chart, placed near the pointer and kept inside the plot. */
export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; flip: boolean; title: string; lines: readonly TipLine[] } | null>(null);
  const node = tip ? (
    <div
      className="chart__tip"
      role="status"
      // Positioned through the CSSOM; the caller flips it left past the middle.
      style={{ left: tip.x, top: tip.y, transform: `translate(${tip.flip ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}
    >
      <p className="chart__tip-title">{tip.title}</p>
      {tip.lines.map((l) => (
        <p key={l.label} className="chart__tip-line">
          {l.role && (
            <svg width="12" height="4" viewBox="0 0 12 4" aria-hidden>
              <line x1="1" y1="2" x2="11" y2="2" className={`stroke--${l.role}`} strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <strong className="numeric">{l.value}</strong> <span className="muted">{l.label}</span>
        </p>
      ))}
    </div>
  ) : null;
  return { tip: node, show: setTip, hide: () => setTip(null), at: tip ? tip.x : null };
}

/** A column with a rounded data end and a square baseline. Height may be negative (downward). */
export function columnPath(x: number, base: number, width: number, height: number, r = 4): string {
  if (Math.abs(height) < 0.5) return '';
  const k = Math.min(r, Math.abs(height), width / 2);
  if (height > 0) {
    const top = base - height;
    return `M${x},${base}V${top + k}Q${x},${top} ${x + k},${top}H${x + width - k}Q${x + width},${top} ${x + width},${top + k}V${base}Z`;
  }
  const bottom = base - height;
  return `M${x},${base}V${bottom - k}Q${x},${bottom} ${x + k},${bottom}H${x + width - k}Q${x + width},${bottom} ${x + width},${bottom - k}V${base}Z`;
}

/** A bar growing right from x0, rounded at its end. */
export function barPath(x0: number, y: number, length: number, thickness: number, r = 4): string {
  if (length < 0.5) return '';
  const k = Math.min(r, length, thickness / 2);
  return `M${x0},${y}H${x0 + length - k}Q${x0 + length},${y} ${x0 + length},${y + k}V${y + thickness - k}Q${x0 + length},${y + thickness} ${x0 + length - k},${y + thickness}H${x0}Z`;
}
