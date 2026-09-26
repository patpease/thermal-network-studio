/**
 * Month by month: heat the buildings drew from the loop for heating (up,
 * orange) and heat they put into it from cooling (down, blue). The solid part
 * of each column is what met the other side hour by hour — heat moved from
 * one building to another with no plant at all. The wash is what the plant
 * had to carry.
 *
 * Mirrored on one axis, not two charts, because it is one quantity (heat)
 * in two directions; the baseline is the loop.
 */
import type { PointerEvent } from 'react';

import type { UnitSystem } from '../units/units';
import { LABELS, toDisplay } from '../units/units';
import { percent, sig, withUnit } from '../ui/format';
import { ChartCard, columnPath, useTooltip } from './Chart';
import { MONTHS, niceRange } from './data';
import type { Month } from './data';

const M = { top: 24, right: 8, bottom: 24, left: 48 };

export function MonthlySharing({ months, units }: { months: readonly Month[]; units: UnitSystem }) {
  const { tip, show, hide } = useTooltip();
  const e = (kWh: number) => toDisplay('energyLarge', kWh / 1000, units);
  const energy = (kWh: number) => withUnit('energyLarge', kWh / 1000, units);
  const peak = Math.max(...months.map((m) => Math.max(m.extracted, m.rejected)));
  const range = niceRange(0, e(peak), 3);
  const shared = months.reduce((a, m) => a + m.shared, 0);
  const drawn = months.reduce((a, m) => a + m.extracted, 0);

  return (
    <ChartCard
      id="monthly"
      title="Heat shared between buildings, month by month"
      subtitle={`${energy(shared)} a year moved directly from buildings cooling to buildings heating: ${percent(drawn > 0 ? shared / drawn : 0)} of the heat drawn by heating.`}
      legend={[
        { label: 'Heating drew from the loop', role: 'heat', key: 'rect' },
        { label: 'Cooling put into the loop', role: 'cool', key: 'rect' },
        { label: 'Pale: carried by the plant · solid: shared', role: 'neutral', key: 'wash' },
      ]}
      table={{
        caption: 'Monthly heat drawn, rejected and shared',
        head: ['Month', 'Heating drew', 'Cooling put in', 'Shared'],
        rows: months.map((m) => [MONTHS[m.month]!, energy(m.extracted), energy(m.rejected), energy(m.shared)]),
      }}
    >
      {(width) => {
        const height = 240;
        const w = width - M.left - M.right;
        const half = (height - M.top - M.bottom) / 2;
        const base = M.top + half;
        const scale = (v: number) => (v / range.hi) * half;
        const slot = w / 12;
        const bw = Math.min(24, slot * 0.62);
        const move = (m: Month) => (ev: PointerEvent<SVGRectElement>) => {
          const box = ev.currentTarget.ownerSVGElement!.getBoundingClientRect();
          const x = ev.clientX - box.left;
          show({
            x,
            y: ev.clientY - box.top,
            flip: x > width * 0.55,
            title: MONTHS[m.month]!,
            lines: [
              { value: energy(m.extracted), label: 'heating drew', role: 'heat' },
              { value: energy(m.rejected), label: 'cooling put in', role: 'cool' },
              { value: energy(m.shared), label: 'shared between buildings' },
            ],
          });
        };
        return (
          <>
            <svg className="chart__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mirrored column chart of monthly heating draw and cooling rejection">
              {range.ticks.flatMap((v) => (v === 0 ? [0] : [v, -v])).map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={base - scale(v)} y2={base - scale(v)} className={v === 0 ? 'axis' : 'grid'} />
                  <text x={M.left - 6} y={base - scale(v)} textAnchor="end" dominantBaseline="middle" className="chart__tick numeric">
                    {sig(Math.abs(v), 3)}
                  </text>
                </g>
              ))}
              <text x={0} y={10} className="chart__tick">
                {LABELS[units].energyLarge}
              </text>
              {months.map((m) => {
                const cx = M.left + slot * m.month + slot / 2;
                const x = cx - bw / 2;
                return (
                  <g key={m.month}>
                    <path d={columnPath(x, base - 1, bw, scale(e(m.extracted)) - 1)} className="fill--heat wash" />
                    <path d={columnPath(x, base - 1, bw, scale(e(m.shared)) - 1)} className="fill--heat" />
                    <path d={columnPath(x, base + 1, bw, -(scale(e(m.rejected)) - 1))} className="fill--cool wash" />
                    <path d={columnPath(x, base + 1, bw, -(scale(e(m.shared)) - 1))} className="fill--cool" />
                    <text x={cx} y={height - 6} textAnchor="middle" className="chart__tick">
                      {width < 420 ? MONTHS[m.month]!.charAt(0) : MONTHS[m.month]}
                    </text>
                    <rect x={cx - slot / 2} y={M.top} width={slot} height={half * 2} className="hit" onPointerMove={move(m)} onPointerLeave={hide} />
                  </g>
                );
              })}
            </svg>
            {tip}
          </>
        );
      }}
    </ChartCard>
  );
}
