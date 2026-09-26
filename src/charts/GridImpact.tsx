/**
 * Grid impact: the network's electric peak against building-level
 * electrification (BLE) — the same buildings, each on its own air-source heat
 * pump — with today's electricity as a rule across each pair.
 *
 * BLE is the wash, the network the solid, in one neutral: neither is heat or
 * cooling. Today is an ink rule, not a third bar: it is the reference both are
 * read against. Not scored (D20); the "Easy on the grid" challenge uses it.
 */
import { GRID_COPY } from '../config/copy';
import type { GridImpact as Grid } from '../engine/grid';
import type { UnitSystem } from '../units/units';
import { withUnit } from '../ui/format';
import { barPath, ChartCard } from './Chart';

const pctOf = (f: number) => `${Math.round(Math.abs(f) * 100)}%`;

export function GridImpact({ grid, units }: { grid: Grid; units: UnitSystem }) {
  const kw = (w: number) => withUnit('electricPower', w, units);
  const energy = (kWh: number) => withUnit('energyLarge', kWh / 1000, units);
  const groups = [
    { title: GRID_COPY.winter, today: grid.today.winterW, ble: grid.ble.winterW, network: grid.network.winterW, format: kw },
    { title: GRID_COPY.summer, today: grid.today.summerW, ble: grid.ble.summerW, network: grid.network.summerW, format: kw },
    { title: GRID_COPY.annual, today: grid.today.annualKWh, ble: grid.ble.annualKWh, network: grid.network.annualKWh, format: energy },
  ];
  const r = grid.winterReduction;
  const headline = r >= 0 ? GRID_COPY.lower(pctOf(r)) : GRID_COPY.higher(pctOf(r));

  return (
    <ChartCard
      id="grid"
      title={GRID_COPY.title(headline)}
      subtitle={GRID_COPY.subtitle}
      legend={[
        { label: GRID_COPY.ble, role: 'neutral', key: 'wash' },
        { label: GRID_COPY.network, role: 'neutral', key: 'rect' },
        { label: GRID_COPY.today, role: 'loop', key: 'line' },
      ]}
      table={{
        caption: 'Electricity: today, a heat pump in every building, and the network',
        head: ['Measure', GRID_COPY.today, GRID_COPY.ble, GRID_COPY.network],
        rows: groups.map((g) => [g.title, g.format(g.today), g.format(g.ble), g.format(g.network)]),
      }}
    >
      {(width) => {
        const valueRoom = 150;
        const bar = 18;
        const rowGap = 4;
        const groupGap = 20;
        const heading = 18;
        const maxLen = Math.max(40, width - valueRoom);
        let yy = 0;
        const placed = groups.map((g) => {
          const top = yy;
          yy += heading + bar * 2 + rowGap + groupGap;
          return { ...g, top };
        });
        const height = yy - groupGap + 4;
        return (
          <svg className="chart__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar chart of electric peaks: a heat pump in every building against the network, with today marked">
            {placed.map((g) => {
              const peak = Math.max(g.today, g.ble, g.network, 1);
              const len = (v: number) => (Math.max(0, v) / peak) * maxLen;
              const y0 = g.top + heading;
              const y1 = y0 + bar + rowGap;
              const tx = len(g.today);
              return (
                <g key={g.title}>
                  <text x={0} y={g.top + 12} className="chart__label chart__label--strong">
                    {g.title}
                  </text>
                  <path d={barPath(0, y0, len(g.ble), bar)} className="fill--neutral wash" />
                  <text x={Math.max(len(g.ble), tx) + 8} y={y0 + bar / 2} dominantBaseline="middle" className="chart__value">
                    {g.format(g.ble)} BLE
                  </text>
                  <path d={barPath(0, y1, len(g.network), bar)} className="fill--neutral" />
                  <text x={Math.max(len(g.network), tx) + 8} y={y1 + bar / 2} dominantBaseline="middle" className="chart__value">
                    {g.format(g.network)} TEN
                  </text>
                  <line x1={tx} y1={y0 - 3} x2={tx} y2={y1 + bar + 3} className="stroke--loop" strokeWidth={2} strokeLinecap="round" />
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartCard>
  );
}
