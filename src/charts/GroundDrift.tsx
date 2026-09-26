/**
 * Twenty-five years of the same year, and what the ground does: the fluid's
 * coldest and warmest daily mean each year, against the limits a bore field
 * is designed for.
 *
 * Shown, never scored (D31). A field that is balanced holds flat; one that
 * takes more than it gives drifts down, and the reverse drifts up — the
 * thing a single year cannot show.
 */
import type { PointerEvent } from 'react';

import type { DriftYear } from '../engine/ground';
import { FLUID_LIMITS } from '../engine/ground';
import type { UnitSystem } from '../units/units';
import { LABELS, toDisplay } from '../units/units';
import { sig, withUnit } from '../ui/format';
import { ChartCard, useTooltip } from './Chart';
import { niceRange } from './data';

const M = { top: 24, right: 58, bottom: 24, left: 40 };

export function GroundDrift({ drift, units }: { drift: readonly DriftYear[]; units: UnitSystem }) {
  const { tip, show, hide, at } = useTooltip();
  const t = (c: number) => toDisplay('temperature', c, units);
  const temp = (c: number) => withUnit('temperature', c, units, 3);
  const first = drift[0]!;
  const last = drift[drift.length - 1]!;
  const outside = last.minFluid < FLUID_LIMITS.min || last.maxFluid > FLUID_LIMITS.max;
  const lo = Math.min(FLUID_LIMITS.min, ...drift.map((d) => d.minFluid));
  const hi = Math.max(FLUID_LIMITS.max, ...drift.map((d) => d.maxFluid));
  const range = niceRange(t(lo), t(hi), 5);
  const direction = last.meanWall - first.meanWall;

  return (
    <ChartCard
      id="drift"
      title="The ground over 25 years"
      subtitle={`${Math.abs(direction) < 0.3 ? 'The field holds roughly steady' : direction > 0 ? 'The field warms: it is given more heat than it gives back' : 'The field cools: it gives more heat than it is given'}. ${outside ? 'By year 25 the fluid leaves its design limits.' : 'The fluid stays inside its design limits.'} Shown, not scored.`}
      legend={[
        { label: 'Warmest daily fluid', role: 'heat', key: 'line' },
        { label: 'Coldest daily fluid', role: 'cool', key: 'line' },
      ]}
      table={{
        caption: 'Bore field fluid temperature extremes by year',
        head: ['Year', 'Coldest', 'Warmest'],
        rows: drift.map((d) => [String(d.year), temp(d.minFluid), temp(d.maxFluid)]),
      }}
    >
      {(width) => {
        const height = 200;
        const w = width - M.left - M.right;
        const h = height - M.top - M.bottom;
        const n = drift.length;
        const x = (year: number) => M.left + ((year - 1) / (n - 1)) * w;
        const y = (display: number) => M.top + (1 - (display - range.lo) / (range.hi - range.lo)) * h;
        const line = (pick: (d: DriftYear) => number) => drift.map((d, i) => `${i ? 'L' : 'M'}${x(d.year).toFixed(1)},${y(t(pick(d))).toFixed(1)}`).join('');
        const move = (e: PointerEvent<SVGRectElement>) => {
          const box = e.currentTarget.getBoundingClientRect();
          const year = Math.max(1, Math.min(n, Math.round(((e.clientX - box.left) / box.width) * (n - 1)) + 1));
          const d = drift[year - 1]!;
          const px = x(year);
          show({
            x: px,
            y: y(t((d.minFluid + d.maxFluid) / 2)),
            flip: px > width * 0.55,
            title: `Year ${year}`,
            lines: [
              { value: temp(d.maxFluid), label: 'warmest', role: 'heat' },
              { value: temp(d.minFluid), label: 'coldest', role: 'cool' },
            ],
          });
        };
        return (
          <>
            <svg className="chart__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart of bore field fluid temperature over 25 years">
              {range.ticks.map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className="grid" />
                  <text x={M.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="chart__tick numeric">
                    {sig(v, 3)}
                  </text>
                </g>
              ))}
              <text x={0} y={10} className="chart__tick">
                {LABELS[units].temperature}
              </text>
              {[1, 5, 10, 15, 20, 25].filter((yr) => yr <= n).map((yr) => (
                <text key={yr} x={x(yr)} y={height - 6} textAnchor="middle" className="chart__tick">
                  {yr === 1 ? 'Year 1' : yr}
                </text>
              ))}
              {[FLUID_LIMITS.min, FLUID_LIMITS.max].map((b, i) => (
                <g key={i}>
                  <line x1={M.left} x2={width - M.right} y1={y(t(b))} y2={y(t(b))} className="rule" />
                  {/* In the right margin, clear of the data. */}
                  <text x={width - M.right + 6} y={y(t(b))} dominantBaseline="middle" className="chart__tick">
                    <tspan x={width - M.right + 6} dy="-0.5em">
                      limit
                    </tspan>
                    <tspan x={width - M.right + 6} dy="1.1em">
                      {temp(b)}
                    </tspan>
                  </text>
                </g>
              ))}
              <path d={line((d) => d.maxFluid)} className="line stroke--heat" />
              <path d={line((d) => d.minFluid)} className="line stroke--cool" />
              {[first, last].flatMap((d) => [
                <circle key={`h${d.year}`} cx={x(d.year)} cy={y(t(d.maxFluid))} r={4} className="dot fill--heat" />,
                <circle key={`c${d.year}`} cx={x(d.year)} cy={y(t(d.minFluid))} r={4} className="dot fill--cool" />,
              ])}
              {at !== null && <line x1={at} x2={at} y1={M.top} y2={M.top + h} className="crosshair" />}
              <rect x={M.left} y={M.top} width={w} height={h} className="hit" onPointerMove={move} onPointerLeave={hide} />
            </svg>
            {tip}
          </>
        );
      }}
    </ChartCard>
  );
}
