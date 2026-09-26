/**
 * Where the score comes from: today's site energy and carbon beside the
 * network's, and what the network's electricity is spent on.
 *
 * Today is the wash, the network the solid, in the same neutral: the
 * comparison is length, and neither bar is heat or cooling. The accent is
 * never a series colour. Values sit at the bar tips; the reduction — the
 * number the score is made of — is in the heading of each pair.
 */
import type { ScenarioResult } from '../engine/scenario';
import type { UnitSystem } from '../units/units';
import { tonnes, withUnit } from '../ui/format';
import { barPath, ChartCard } from './Chart';

const reduction = (f: number) => (f >= 0 ? `${Math.round(f * 100)}% less` : `${Math.round(-f * 100)}% more`);

const USES: { key: keyof ScenarioResult['network']['electricityKWh']; label: string }[] = [
  { key: 'buildingHeatPumps', label: 'Building heat pumps' },
  { key: 'airSource', label: 'Air-source heat pump' },
  { key: 'backup', label: 'Electric backup' },
  { key: 'pumping', label: 'Distribution pumping' },
  { key: 'parasitic', label: 'Plant fans and pumps' },
];

export function ScoreBreakdown({ result, units }: { result: ScenarioResult; units: UnitSystem }) {
  const { baseline, network, score } = result;
  const energy = (kWh: number) => withUnit('energyLarge', kWh / 1000, units);
  const pairs = [
    {
      title: `Site energy · ${reduction(score.energyReduction)} · ${score.efficiencyPoints} points`,
      today: baseline.totalSiteKWh,
      network: network.totalSiteKWh,
      format: energy,
    },
    {
      title: `Carbon · ${reduction(score.carbonReduction)} · ${score.carbonPoints} points`,
      today: baseline.carbonKg,
      network: network.carbonKg,
      format: tonnes,
    },
  ];
  const uses = USES.map((u) => ({ ...u, kWh: network.electricityKWh[u.key] })).filter((u) => u.kWh > 0).sort((a, b) => b.kWh - a.kWh);

  return (
    <ChartCard
      id="score"
      title={`Score ${score.total} of 100`}
      subtitle="Half energy, half carbon, each the reduction on business as usual — the buildings as they are today, on today’s fuels. A score is not a saving."
      legend={[
        { label: 'Today', role: 'neutral', key: 'wash' },
        { label: 'With the network', role: 'neutral', key: 'rect' },
      ]}
      table={{
        caption: 'Today against the network, and the network’s electricity by use',
        head: ['Measure', 'Today', 'With the network'],
        rows: [
          ...pairs.map((p) => [p.title, p.format(p.today), p.format(p.network)]),
          ...uses.map((u) => [`Electricity: ${u.label}`, '—', energy(u.kWh)]),
        ],
      }}
    >
      {(width) => {
        const labelW = 0;
        const valueRoom = 124;
        const bar = 18;
        const rowGap = 4;
        const groupGap = 20;
        const heading = 18;
        const maxLen = width - labelW - valueRoom;
        let yy = 0;
        const groups = pairs.map((p) => {
          const top = yy;
          yy += heading + bar * 2 + rowGap + groupGap;
          return { ...p, top };
        });
        const useTop = yy + 4;
        const peakUse = Math.max(...uses.map((u) => u.kWh), 1);
        const useRow = 22;
        const height = useTop + heading + uses.length * useRow;
        return (
          <svg className="chart__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar chart comparing today with the network">
            {groups.map((g) => {
              const peak = Math.max(g.today, g.network, 1);
              const len = (v: number) => (Math.max(0, v) / peak) * maxLen;
              const y0 = g.top + heading;
              const y1 = y0 + bar + rowGap;
              return (
                <g key={g.title}>
                  <text x={0} y={g.top + 12} className="chart__label chart__label--strong">
                    {g.title}
                  </text>
                  <path d={barPath(labelW, y0, len(g.today), bar)} className="fill--neutral wash" />
                  <text x={labelW + len(g.today) + 6} y={y0 + bar / 2} dominantBaseline="middle" className="chart__value">
                    {g.format(g.today)} today
                  </text>
                  <path d={barPath(labelW, y1, len(g.network), bar)} className="fill--neutral" />
                  <text x={labelW + len(g.network) + 6} y={y1 + bar / 2} dominantBaseline="middle" className="chart__value">
                    {g.format(g.network)} network
                  </text>
                </g>
              );
            })}
            <text x={0} y={useTop + 12} className="chart__label chart__label--strong">
              The network’s electricity, by use
            </text>
            {uses.map((u, i) => {
              const y0 = useTop + heading + i * useRow;
              const room = Math.min(width * 0.45, 210);
              const len = (u.kWh / peakUse) * (width - room - 90);
              return (
                <g key={u.key}>
                  <text x={room - 8} y={y0 + 7} textAnchor="end" dominantBaseline="middle" className="chart__label">
                    {u.label}
                  </text>
                  <path d={barPath(room, y0, len, 14)} className="fill--neutral" />
                  <text x={room + len + 6} y={y0 + 7} dominantBaseline="middle" className="chart__value">
                    {energy(u.kWh)}
                  </text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartCard>
  );
}
