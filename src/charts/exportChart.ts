/**
 * A results chart as a PNG, with the scope line and the sources printed on
 * it. An exported chart reaches people who never saw the tool (ZEEL).
 *
 * The chart is drawn a second time, off screen, at the desk width and inside
 * a `data-theme="light"` stage: an export is never the phone layout and never
 * the dark theme. Computed styles are read from THAT copy and written onto
 * its clone as inline style, because an SVG in an <img> sees no stylesheet
 * (ZEEL and Psychrometric Studio, ADR 0004 there). Fonts go in as data URIs.
 *
 * Browser only; verified in Chromium.
 */
import { awardFonts, download } from '../award/raster';
import { BRAND } from '../config/branding';
import { SCOPE_STATEMENT } from '../config/copy';
import { escapeXml, monthYear } from '../award/graphic';
import type { LegendItem } from './Chart';

export const EXPORT_WIDTH = 1200;
/** The width the chart is drawn at inside the export. */
export const EXPORT_PLOT = 1104;

const PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
] as const;

const ROLE_TOKEN: Record<LegendItem['role'], string> = {
  heat: '--chart-heat',
  cool: '--chart-cool',
  ground: '--chart-ground',
  neutral: '--chart-neutral',
  loop: '--ink',
  network: '--ink',
};

/**
 * Copy the computed style of every element of `live` onto the matching
 * element of `clone` as SVG PRESENTATION ATTRIBUTES (fill="…", stroke="…").
 * Not as style="…": the CSP (style-src without 'unsafe-inline') refuses a
 * style attribute written from script — even on a clone in a detached
 * document, which inherits the page's policy. Presentation attributes are
 * not styles to CSP. `text-transform` has no attribute form, so uppercase is
 * applied to the text itself.
 */
function inlineStyles(live: Element, clone: Element): void {
  const a = [live, ...live.querySelectorAll('*')];
  const b = [clone, ...clone.querySelectorAll('*')];
  a.forEach((el, i) => {
    const target = b[i];
    if (!target) return;
    const cs = getComputedStyle(el);
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) target.setAttribute(p, v);
    }
    if (cs.getPropertyValue('text-transform') === 'uppercase' && target.childNodes.length === 1 && target.firstChild?.nodeType === 3) {
      target.textContent = (target.textContent ?? '').toUpperCase();
    }
    // Hover targets are transparent and would only add weight.
    if (el.classList.contains('hit')) target.setAttribute('data-drop', '');
    target.removeAttribute('class');
  });
}

function wrap(text: string, chars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [''];
  for (const w of words) {
    const line = lines[lines.length - 1]!;
    if (line && line.length + 1 + w.length > chars) lines.push(w);
    else lines[lines.length - 1] = line ? `${line} ${w}` : w;
  }
  return lines;
}

export interface ChartExport {
  readonly stage: HTMLElement;
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly legend?: readonly LegendItem[] | undefined;
  readonly filename: string;
}

export function composeChartSvg(input: {
  chart: string;
  chartHeight: number;
  title: string;
  subtitle?: string | undefined;
  legend?: readonly { label: string; colour: string; key: LegendItem['key'] }[] | undefined;
  ink: string;
  muted: string;
  date: Date;
  fonts: { sans?: string; mono?: string };
}): { svg: string; height: number } {
  const L = 48;
  const sans = `'Archivo Variable', 'Archivo', system-ui, sans-serif`;
  const face = [
    input.fonts.sans ? `@font-face{font-family:'Archivo Variable';src:url(${input.fonts.sans}) format('woff2');font-weight:100 900;}` : '',
    input.fonts.mono ? `@font-face{font-family:'IBM Plex Mono';src:url(${input.fonts.mono}) format('woff2');}` : '',
  ].join('');
  const t = (x: number, y: number, size: number, text: string, fill: string, weight = 400, anchor = 'start') =>
    `<text x="${x}" y="${y}" font-family="${escapeXml(sans)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(text)}</text>`;

  let y = 56;
  const parts: string[] = [t(L, y, 26, input.title, input.ink, 700)];
  if (input.subtitle) {
    for (const line of wrap(input.subtitle, 110)) {
      y += 26;
      parts.push(t(L, y, 17, line, input.muted));
    }
  }
  if (input.legend && input.legend.length > 1) {
    y += 34;
    let x = L;
    for (const l of input.legend) {
      parts.push(
        l.key === 'line'
          ? `<line x1="${x}" y1="${y - 5}" x2="${x + 18}" y2="${y - 5}" stroke="${l.colour}" stroke-width="2.5" stroke-linecap="round"/>`
          : `<rect x="${x}" y="${y - 10}" width="18" height="10" rx="2" fill="${l.colour}"${l.key === 'wash' ? ' fill-opacity="0.28"' : ''}/>`,
      );
      parts.push(t(x + 26, y, 15, l.label, input.muted));
      x += 26 + l.label.length * 7.6 + 24;
    }
  }
  y += 24;
  const chartTop = y;
  y += input.chartHeight + 36;
  const footer = [
    `<line x1="${L}" y1="${y}" x2="${EXPORT_WIDTH - L}" y2="${y}" stroke="#D9DEE5" stroke-width="1.5"/>`,
    t(L, y + 30, 15, `${SCOPE_STATEMENT.body} ${SCOPE_STATEMENT.emphasis}`, input.ink),
    t(L, y + 54, 13, 'Loads calibrated to NLR ComStock™ and ResStock™ · grid carbon NLR Cambium 2023 · buildings © OpenStreetMap contributors.', input.muted),
    t(L, y + 78, 13, `${BRAND.appName} · ${BRAND.host} · ${monthYear(input.date)}`, input.muted),
  ];
  const height = y + 100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_WIDTH}" height="${height}" viewBox="0 0 ${EXPORT_WIDTH} ${height}">
<style>${face}</style>
<rect width="${EXPORT_WIDTH}" height="${height}" fill="#FFFFFF"/>
${parts.join('\n')}
<g transform="translate(${L} ${chartTop})">${input.chart}</g>
${footer.join('\n')}
</svg>`;
  return { svg, height };
}

export async function exportChart(e: ChartExport): Promise<void> {
  const live = e.stage.querySelector('svg.chart__svg');
  if (!(live instanceof SVGSVGElement)) throw new Error('Nothing to export.');
  const clone = live.cloneNode(true) as SVGSVGElement;
  inlineStyles(live, clone);
  const w = live.width.baseVal.value;
  const h = live.height.baseVal.value;
  // A nested <svg> with no size takes the OUTER viewport (ZEEL).
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.querySelectorAll('[data-drop]').forEach((n) => n.remove());

  const cs = getComputedStyle(e.stage);
  const token = (name: string) => cs.getPropertyValue(name).trim();
  const fonts = await awardFonts();
  const { svg, height } = composeChartSvg({
    chart: new XMLSerializer().serializeToString(clone),
    chartHeight: h,
    title: e.title,
    subtitle: e.subtitle,
    legend: e.legend?.map((l) => ({ label: l.label, key: l.key, colour: token(ROLE_TOKEN[l.role]) })),
    ink: token('--ink') || '#14202B',
    muted: token('--ink-muted') || '#5D6B7A',
    date: new Date(),
    fonts,
  });

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The chart could not be drawn.'));
      img.src = url;
    });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    // Twice the size, for a crisp image on a slide or a retina screen.
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_WIDTH * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the chart.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, EXPORT_WIDTH, height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The chart could not be saved.'))), 'image/png'));
    download(png, e.filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
