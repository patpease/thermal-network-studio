/**
 * The selected building's peak day, hour by hour, per floor area: the day of
 * the year that holds its peak heating hour, or its peak cooling hour. Two
 * charts, one each, so an engineer sees both the profile in use and the peak
 * that the rule-of-thumb check compares.
 *
 * Columns in the monthly-sharing style: every hour a wash, the peak hour
 * solid. Both charts draw LOAD per area (Btu/h·ft² or W/m²), so a taller
 * column is always more load — ft²/ton is a reciprocal and never an axis. The
 * rule of thumb is a horizontal rule, labelled in the right margin in the
 * unit it is written in.
 */
import type { PointerEvent } from 'react';

import { PEAK_DAY_COPY } from '../config/copy';
import type { PeakDay as PeakDayData } from '../engine/ruleOfThumb';
import { RULE_OF_THUMB_W_PER_M2 } from '../engine/ruleOfThumb';
import type { UnitSystem } from '../units/units';
import { LABELS, toDisplay } from '../units/units';
import { sig, withUnit } from '../ui/format';
import { ChartCard, columnPath, useTooltip } from './Chart';
import { dayLabel, niceRange } from './data';

const M = { top: 16, right: 72, bottom: 24, left: 40 };
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const clock = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function PeakDay({ kind, day, building, units }: { kind: 'heating' | 'cooling'; day: PeakDayData; building: string; units: UnitSystem }) {
  const { tip, show, hide } = useTooltip();
  const c = PEAK_DAY_COPY[kind];
  const role = kind === 'heating' ? 'heat' : 'cool';
  const ruleW = RULE_OF_THUMB_W_PER_M2[kind];
  const load = (w: number) => withUnit('loadIntensity', w, units);
  // The rule in the unit it is written in: ft²/ton for cooling in IP.
  const ruleUnit = kind === 'cooling' ? 'coolingIntensity' : 'loadIntensity';
  const shown = (w: number) => toDisplay('loadIntensity', w, units);
  const peakW = day.load[day.peakHour]!;
  const range = niceRange(0, shown(Math.max(peakW, ruleW)), 4);
  const when = `${WEEKDAYS[day.weekday]}, ${dayLabel(day.day)}`;
  const temp = (t: number) => withUnit('temperature', t, units, 2);

  return (
    <ChartCard
      id={`peak-${kind}-day`}
      title={c.title}
      subtitle={PEAK_DAY_COPY.subtitle(building, when, load(peakW), clock(day.peakHour), temp(day.outdoor[day.peakHour]!))}
      legend={[
        { label: c.legendHour, role, key: 'wash' },
        { label: PEAK_DAY_COPY.legendPeak, role, key: 'rect' },
      ]}
      note={PEAK_DAY_COPY.note}
      table={{
        caption: `${c.title}: ${when}`,
        head: ['Hour', c.column, 'Outdoor air'],
        rows: day.load.map((w, h) => [clock(h), load(w), temp(day.outdoor[h]!)]),
      }}
    >
      {(width) => {
        const height = 200;
        const w = width - M.left - M.right;
        const plot = height - M.top - M.bottom;
        const base = M.top + plot;
        const y = (v: number) => base - (v / range.hi) * plot;
        const slot = w / 24;
        const bw = Math.max(2, Math.min(18, slot * 0.68));
        const move = (h: number) => (ev: PointerEvent<SVGRectElement>) => {
          const box = ev.currentTarget.ownerSVGElement!.getBoundingClientRect();
          const x = ev.clientX - box.left;
          const v = day.load[h]!;
          show({
            x,
            y: ev.clientY - box.top,
            // The Site panel is narrow: flip before the middle so the tip stays inside it.
            flip: x > width * 0.45,
            title: `${clock(h)}${h === day.peakHour ? ` · ${PEAK_DAY_COPY.peakHour}` : ''}`,
            lines: [
              { value: load(v), label: c.tip, role },
              ...(kind === 'cooling' && v > 0 && units === 'ip' ? [{ value: withUnit('coolingIntensity', v, units), label: PEAK_DAY_COPY.asFt2PerTon }] : []),
              { value: temp(day.outdoor[h]!), label: PEAK_DAY_COPY.outdoor },
            ],
          });
        };
        const ruleY = y(shown(ruleW));
        return (
          <>
            <svg className="chart__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Hourly ${kind} load per floor area on ${when}`}>
              {range.ticks.map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis' : 'grid'} />
                  <text x={M.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="chart__tick numeric">
                    {sig(v, 3)}
                  </text>
                </g>
              ))}
              <text x={0} y={10} className="chart__tick">
                {LABELS[units].loadIntensity}
              </text>
              {day.load.map((v, h) => {
                const cx = M.left + slot * h + slot / 2;
                return (
                  <g key={h}>
                    <path d={columnPath(cx - bw / 2, base - 1, bw, base - 1 - y(shown(v)))} className={`fill--${role}${h === day.peakHour ? '' : ' wash'}`} />
                    {h % (width < 420 ? 6 : 3) === 0 && (
                      <text x={cx} y={height - 6} textAnchor="middle" className="chart__tick">
                        {clock(h)}
                      </text>
                    )}
                    <rect x={cx - slot / 2} y={M.top} width={slot} height={plot} className="hit" onPointerMove={move(h)} onPointerLeave={hide} />
                  </g>
                );
              })}
              <line x1={M.left} x2={width - M.right} y1={ruleY} y2={ruleY} className="rule" />
              {/* In the right margin, clear of the data. */}
              <text x={width - M.right + 6} y={ruleY} dominantBaseline="middle" className="chart__tick">
                <tspan x={width - M.right + 6} dy="-0.5em">
                  {PEAK_DAY_COPY.ruleLabel}
                </tspan>
                <tspan x={width - M.right + 6} dy="1.1em">
                  {withUnit(ruleUnit, ruleW, units)}
                </tspan>
              </text>
            </svg>
            {tip}
          </>
        );
      }}
    </ChartCard>
  );
}
