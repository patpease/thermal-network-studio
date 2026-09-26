/**
 * Sankey layout: three columns, hand-rolled. Lifted from ZEEL (ours, MIT)
 * unchanged apart from this line — including its rule that a node is as tall
 * as what passes through it, never what arrives plus what leaves.
 *
 * No library — the whole computation is a few dozen lines, and owning it is what
 * makes the diagram exportable and themeable rather than a canvas blob.
 *
 * Every column carries the same total, because energy is conserved across the
 * diagram, so one scale serves all three. Columns with fewer nodes stack shorter
 * and are centred rather than stretched: a taller node must always mean more
 * energy, wherever it sits.
 */

export interface SankeyNodeInput {
  readonly id: string;
  readonly label: string;
  readonly column: number;
  readonly colour: string;
}

export interface SankeyLinkInput {
  readonly source: string;
  readonly target: string;
  readonly value: number;
  readonly colour: string;
}

export interface SankeyNode extends SankeyNodeInput {
  readonly value: number;
  readonly x: number;
  readonly y0: number;
  readonly y1: number;
}

export interface SankeyLink extends SankeyLinkInput {
  readonly id: string;
  /** Where the ribbon meets the source node, and where it meets the target. */
  readonly sy0: number;
  readonly sy1: number;
  readonly ty0: number;
  readonly ty1: number;
  readonly sx: number;
  readonly tx: number;
}

export interface SankeyLayout {
  readonly nodes: readonly SankeyNode[];
  readonly links: readonly SankeyLink[];
  readonly height: number;
}

export interface SankeyOptions {
  readonly columnX: readonly number[];
  readonly nodeWidth: number;
  readonly height: number;
  readonly gap: number;
}

export function layoutSankey(
  nodeInputs: readonly SankeyNodeInput[],
  linkInputs: readonly SankeyLinkInput[],
  options: SankeyOptions,
): SankeyLayout {
  const { columnX, nodeWidth, height, gap } = options;

  const links = linkInputs.filter((l) => l.value > 0);

  // A node is as tall as the energy passing THROUGH it, which is the larger of
  // what arrives and what leaves — not their sum. Adding them makes every middle
  // column exactly twice the height of the ends, and the diagram stops meaning
  // anything: a Sankey's promise is that a band's width is its quantity.
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const link of links) {
    outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + link.value);
    incoming.set(link.target, (incoming.get(link.target) ?? 0) + link.value);
  }
  const value = new Map<string, number>();
  for (const id of new Set([...incoming.keys(), ...outgoing.keys()])) {
    value.set(id, Math.max(incoming.get(id) ?? 0, outgoing.get(id) ?? 0));
  }

  const live = nodeInputs.filter((n) => (value.get(n.id) ?? 0) > 0);
  if (live.length === 0) return { nodes: [], links: [], height };

  const columns = new Map<number, SankeyNodeInput[]>();
  for (const node of live) {
    const bucket = columns.get(node.column) ?? [];
    bucket.push(node);
    columns.set(node.column, bucket);
  }

  // One scale for every column. The busiest column sets it, so no column can
  // overflow the height it was given.
  const columnTotal = (nodes: SankeyNodeInput[]) =>
    nodes.reduce((a, n) => a + (value.get(n.id) ?? 0), 0);
  let scale = Infinity;
  for (const nodes of columns.values()) {
    const usable = height - gap * (nodes.length - 1);
    const total = columnTotal(nodes);
    if (total > 0) scale = Math.min(scale, usable / total);
  }
  if (!Number.isFinite(scale) || scale <= 0) return { nodes: [], links: [], height };

  const placed: SankeyNode[] = [];
  const byId = new Map<string, SankeyNode>();
  for (const [column, nodes] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    const stack = columnTotal(nodes) * scale + gap * (nodes.length - 1);
    let cursor = (height - stack) / 2; // Centre the shorter columns.
    for (const node of nodes) {
      const v = value.get(node.id) ?? 0;
      const h = v * scale;
      const laid: SankeyNode = {
        ...node, value: v, x: columnX[column] ?? 0, y0: cursor, y1: cursor + h,
      };
      placed.push(laid);
      byId.set(node.id, laid);
      cursor += h + gap;
    }
  }

  // Ribbons stack in the order the links were given, which is why the caller
  // orders end uses by fuel: it is what keeps the bands from crossing.
  const sourceOffset = new Map<string, number>();
  const targetOffset = new Map<string, number>();
  const laidLinks: SankeyLink[] = [];

  for (const link of links) {
    const source = byId.get(link.source);
    const target = byId.get(link.target);
    if (!source || !target) continue;

    const so = sourceOffset.get(link.source) ?? 0;
    const to = targetOffset.get(link.target) ?? 0;
    const thickness = link.value * scale;

    laidLinks.push({
      ...link,
      id: `${link.source}->${link.target}`,
      sy0: source.y0 + so,
      sy1: source.y0 + so + thickness,
      ty0: target.y0 + to,
      ty1: target.y0 + to + thickness,
      sx: source.x + nodeWidth,
      tx: target.x,
    });

    sourceOffset.set(link.source, so + thickness);
    targetOffset.set(link.target, to + thickness);
  }

  return { nodes: placed, links: laidLinks, height };
}

/** A ribbon from one node's right edge to another's left edge. */
export function ribbon(link: SankeyLink): string {
  const mid = (link.sx + link.tx) / 2;
  return (
    `M${link.sx},${link.sy0} C${mid},${link.sy0} ${mid},${link.ty0} ${link.tx},${link.ty0}` +
    ` L${link.tx},${link.ty1} C${mid},${link.ty1} ${mid},${link.sy1} ${link.sx},${link.sy1} Z`
  );
}
