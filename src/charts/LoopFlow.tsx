/**
 * A year of heat through the loop: what put heat in on the left, what took it
 * out on the right, the loop between.
 *
 * The two sides are equal by construction (every hour's remainder goes to
 * backup), which is why this is a Sankey and not two bar charts: the widths
 * have to add up, and seeing them add up is the lesson. A bore field appears
 * on both sides, gross — netting it would hide the store that is its point.
 *
 * Colour is the physics of each stream, never a palette slot: orange heat,
 * blue cooling, brown ground, grey backup. Identity is the label beside it.
 */
import { useState } from 'react';
import type { PointerEvent } from 'react';

import type { UnitSystem } from '../units/units';
import { withUnit } from '../ui/format';
import { ChartCard, useTooltip } from './Chart';
import type { Flows } from './data';
import { layoutSankey, ribbon } from './sankey';
import type { SankeyLinkInput, SankeyNodeInput } from './sankey';

const NODE_W = 10;
const GAP = 8;
const TOP = 22;
/** A node shorter than this carries no label; the tooltip and table have it. */
const MIN_LABELLED = 15;
/** The label face averages about 6 px a character at 11 px. */
const CHAR = 6;

function wrap(text: string, room: number): string[] {
  if (text.length * CHAR <= room) return [text];
  const words = text.split(' ');
  const lines: string[] = [''];
  for (const w of words) {
    const line = lines[lines.length - 1]!;
    if (line && (line.length + 1 + w.length) * CHAR > room) lines.push(w);
    else lines[lines.length - 1] = line ? `${line} ${w}` : w;
  }
  // Two lines at most; a name cut short says so rather than losing words quietly.
  return lines.length > 2 ? [lines[0]!, `${lines[1]!}…`] : lines;
}

export function LoopFlow({ flows, units }: { flows: Flows; units: UnitSystem }) {
  const [hover, setHover] = useState<string | null>(null);
  const { tip, show, hide } = useTooltip();
  const energy = (kWh: number) => withUnit('energyLarge', kWh / 1000, units);
  const total = flows.into.reduce((a, x) => a + x.kWh, 0);

  const nodes: SankeyNodeInput[] = [
    ...flows.into.map((x) => ({ id: `in:${x.id}`, label: x.label, column: 0, colour: x.role })),
    { id: 'loop', label: 'Ambient loop', column: 1, colour: 'loop' },
    ...flows.out.map((x) => ({ id: `out:${x.id}`, label: x.label, column: 2, colour: x.role })),
  ];
  const links: SankeyLinkInput[] = [
    ...flows.into.map((x) => ({ source: `in:${x.id}`, target: 'loop', value: x.kWh, colour: x.role })),
    ...flows.out.map((x) => ({ source: 'loop', target: `out:${x.id}`, value: x.kWh, colour: x.role })),
  ];

  const rows = [
    ...flows.into.map((x) => [`In: ${x.label}`, energy(x.kWh)]),
    ...flows.out.map((x) => [`Out: ${x.label}`, energy(x.kWh)]),
  ];

  return (
    <ChartCard
      id="flow"
      title="Where the loop’s heat comes from, and where it goes"
      subtitle={`A year: ${energy(total)} through the loop. Both sides are equal — whatever the plant cannot carry falls to electric backup.`}
      table={{ caption: 'Heat into and out of the loop over a year', head: ['Stream', 'Energy'], rows }}
    >
      {(width) => {
        const compact = width < 520;
        const labelRoom = Math.round(width * (compact ? 0.28 : 0.3));
        const height = compact ? 300 : 320;
        const layout = layoutSankey(nodes, links, {
          columnX: [labelRoom, width / 2 - NODE_W / 2, width - labelRoom - NODE_W],
          nodeWidth: NODE_W,
          height,
          gap: GAP,
        });
        const lit = (id: string) => hover === null || hover === id || hover === 'loop';
        const pointer = (id: string, label: string, kWh: number) => ({
          onPointerMove: (e: PointerEvent<SVGElement>) => {
            const box = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
            const x = e.clientX - box.left;
            setHover(id);
            show({ x, y: e.clientY - box.top, flip: x > width * 0.55, title: label, lines: [{ value: energy(kWh), label: `a year · ${Math.round((kWh / total) * 100)}% of the flow` }] });
          },
          onPointerLeave: () => {
            setHover(null);
            hide();
          },
        });

        return (
          <>
            <svg className="chart__svg" width={width} height={height + TOP + 6} viewBox={`0 0 ${width} ${height + TOP + 6}`} role="img" aria-label="Sankey diagram of heat into and out of the loop">
              {/* From the outer edges inward, so the two never meet at phone width. */}
              <text x={0} y={12} className="chart__axis-label" textAnchor="start">
                Into the loop
              </text>
              <text x={width} y={12} className="chart__axis-label" textAnchor="end">
                Out of the loop
              </text>
              <g transform={`translate(0 ${TOP})`}>
                {layout.links.map((l) => {
                  const id = l.source === 'loop' ? l.target : l.source;
                  const item = [...flows.into, ...flows.out].find((x) => `in:${x.id}` === id || `out:${x.id}` === id);
                  return (
                    <path
                      key={l.id}
                      d={ribbon(l)}
                      className={`ribbon fill--${l.colour}${lit(id) ? '' : ' dim'}`}
                      {...pointer(id, item?.label ?? '', l.value)}
                    />
                  );
                })}
                {layout.nodes.map((n) => {
                  const h = n.y1 - n.y0;
                  const left = n.column === 0;
                  const isLoop = n.id === 'loop';
                  const lines = wrap(n.label, labelRoom - 10);
                  const labelled = !isLoop && h >= MIN_LABELLED;
                  const withValue = h >= 30;
                  const count = lines.length + (withValue ? 1 : 0);
                  const cy = (n.y0 + n.y1) / 2;
                  return (
                    <g key={n.id}>
                      <rect x={n.x} y={n.y0} width={NODE_W} height={Math.max(1, h)} rx={2} className={`node fill--${n.colour}`} />
                      {isLoop && (
                        <text x={n.x + NODE_W / 2} y={n.y0 - 6} textAnchor="middle" className="chart__label">
                          Loop
                        </text>
                      )}
                      {labelled && (
                        <text x={left ? n.x - 6 : n.x + NODE_W + 6} y={cy - (count - 1) * 6} textAnchor={left ? 'end' : 'start'} className="chart__label" dominantBaseline="middle">
                          {lines.map((line, i) => (
                            <tspan key={i} x={left ? n.x - 6 : n.x + NODE_W + 6} dy={i === 0 ? 0 : 12}>
                              {line}
                            </tspan>
                          ))}
                          {withValue && (
                            <tspan x={left ? n.x - 6 : n.x + NODE_W + 6} dy={12} className="chart__value">
                              {energy(n.value)}
                            </tspan>
                          )}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
            {tip}
          </>
        );
      }}
    </ChartCard>
  );
}
