/**
 * The loop's temperature through the year, day by day, against the band it
 * is held in and the outdoor air.
 *
 * One axis, one quantity: everything here is a temperature in the displayed
 * unit. The loop is ink (it is neither heat nor cooling), its daily range a
 * wash of the same, the outdoor air the recessive neutral. The band's two
 * edges are solid hairlines with their own labels, never dashed.
 */
import type { PointerEvent } from 'react';

import type { LoopBand } from '../engine/network';
import type { UnitSystem } from '../units/units';
import { LABELS, toDisplay } from '../units/units';
import { sig, withUnit } from '../ui/format';
import { ChartCard, useTooltip } from './Chart';
import { dayLabel, MONTHS, monthStart, niceRange } from './data';
import type { Day } from './data';

const M = { top: 24, right: 58, bottom: 24, left: 40 };

export function LoopYear({ days, band, units }: { days: readonly Day[]; band: LoopBand; units: UnitSystem }) {
  const { tip, show, hide, at } = useTooltip();
  const t = (c: number) => toDisplay('temperature', c, units);
  const temp = (c: number) => withUnit('temperature', c, units, 3);

  const lo = Math.min(band.min, ...days.map((d) => Math.min(d.min, d.outdoor)));
  const hi = Math.max(band.max, ...days.map((d) => Math.max(d.max, d.outdoor)));
  const range = niceRange(t(lo), t(hi), 5);

  const rows = days.filter((d) => d.day % 7 === 0).map((d) => [dayLabel(d.day), temp(d.mean), `${temp(d.min)} to ${temp(d.max)}`, temp(d.outdoor)]);

  return (
    <ChartCard
      id="loop-year"
      title="Loop temperature through the year"
      subtitle={`Held between ${temp(band.min)} and ${temp(band.max)}. A warmer loop helps the heating heat pumps; a cooler one helps the cooling.`}
      legend={[
        { label: 'Loop, daily mean', role: 'loop', key: 'line' },
        { label: 'Loop, daily range', role: 'loop', key: 'wash' },
        { label: 'Outdoor air, daily mean', role: 'neutral', key: 'line' },
      ]}
      table={{ caption: 'Loop temperature, weekly samples', head: ['Day', 'Loop mean', 'Loop range', 'Outdoor mean'], rows }}
    >
      {(width) => {
        const height = 220;
        const w = width - M.left - M.right;
        const h = height - M.top - M.bottom;
        const x = (day: number) => M.left + (day / 364) * w;
        const y = (display: number) => M.top + (1 - (display - range.lo) / (range.hi - range.lo)) * h;
        const line = (pick: (d: Day) => number) => days.map((d, i) => `${i ? 'L' : 'M'}${x(d.day).toFixed(1)},${y(t(pick(d))).toFixed(1)}`).join('');
        const area =
          days.map((d, i) => `${i ? 'L' : 'M'}${x(d.day).toFixed(1)},${y(t(d.max)).toFixed(1)}`).join('') +
          [...days].reverse().map((d) => `L${x(d.day).toFixed(1)},${y(t(d.min)).toFixed(1)}`).join('') +
          'Z';

        const move = (e: PointerEvent<SVGRectElement>) => {
          const box = e.currentTarget.getBoundingClientRect();
          const day = Math.max(0, Math.min(364, Math.round(((e.clientX - box.left) / box.width) * 364)));
          const d = days[day]!;
          const px = x(day);
          show({
            x: px,
            y: y(t(d.mean)),
            flip: px > width * 0.55,
            title: dayLabel(day),
            lines: [
              { value: temp(d.mean), label: 'loop mean', role: 'loop' },
              { value: `${sig(t(d.min), 3)}–${temp(d.max)}`, label: 'loop range' },
              { value: temp(d.outdoor), label: 'outdoor air', role: 'neutral' },
            ],
          });
        };
        const crosshair = at;

        return (
          <>
            <svg className="chart__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart of loop and outdoor temperature over the year">
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
              {MONTHS.map((m, i) => (
                <text key={m} x={x(monthStart(i) + 14)} y={height - 6} textAnchor="middle" className="chart__tick">
                  {width < 420 ? m.charAt(0) : m}
                </text>
              ))}
              {[band.min, band.max].map((b, i) => (
                <g key={i}>
                  <line x1={M.left} x2={width - M.right} y1={y(t(b))} y2={y(t(b))} className="rule" />
                  {/* In the right margin, clear of the data. */}
                  <text x={width - M.right + 6} y={y(t(b))} dominantBaseline="middle" className="chart__tick">
                    <tspan x={width - M.right + 6} dy="-0.5em">
                      {i ? 'band top' : 'band foot'}
                    </tspan>
                    <tspan x={width - M.right + 6} dy="1.1em">
                      {temp(b)}
                    </tspan>
                  </text>
                </g>
              ))}
              <path d={area} className="fill--loop wash" />
              <path d={line((d) => d.outdoor)} className="line stroke--neutral" />
              <path d={line((d) => d.mean)} className="line stroke--loop" />
              {crosshair !== null && <line x1={crosshair} x2={crosshair} y1={M.top} y2={M.top + h} className="crosshair" />}
              <rect x={M.left} y={M.top} width={w} height={h} className="hit" onPointerMove={move} onPointerLeave={hide} />
            </svg>
            {tip}
          </>
        );
      }}
    </ChartCard>
  );
}
