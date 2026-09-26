/**
 * The award: a 1080 × 1350 portrait graphic for a LinkedIn post (D34).
 *
 * Built as a plain SVG string, not React, for three reasons: it is rasterised
 * through an <img>, which sees no stylesheet and no custom properties, so
 * every colour is a literal here; a test can read it in Node; and the same
 * string is the on-screen preview, so what is previewed is what is posted.
 *
 * Always the LIGHT palette, whatever the viewer's theme (ZEEL's export rule):
 * an award is read in someone else's feed.
 *
 * Fonts arrive as data URIs (`fonts`), because an SVG in an <img> cannot
 * fetch. Without them the text falls back to the system face, which is what
 * the tests see.
 *
 * Every text a player can type (the place names) is escaped.
 */
import type { Challenge } from '../challenges/challenges';
import type { LonLat, Ring } from '../site/geometry';
import { metresPerDegree } from '../site/geometry';
import { ICON_BLUE, ICON_GREEN, ICON_INK, ICON_ORANGE, ICONS } from './icons';

export const AWARD_WIDTH = 1080;
export const AWARD_HEIGHT = 1350;

/** The award's own light palette. Surface and ink from the tool's light tokens. */
const C = {
  paper: '#FFFFFF',
  panel: '#F3F6F5',
  ink: '#14202B',
  muted: '#5D6B7A',
  rule: '#D9DEE5',
  accent: '#0F5F52',
  accentDeep: '#0A4239',
  seal: ICON_INK,
  building: '#8391AD',
} as const;

export interface AwardPlace {
  readonly neighbourhood?: string | null;
  readonly town?: string | null;
  readonly state?: string | null;
}

export interface AwardOutline {
  readonly boundary: Ring;
  readonly buildings: readonly Ring[];
  /** Placed plant, coloured by what it does. */
  readonly sources: readonly { readonly at: LonLat; readonly role: 'heat' | 'cool' | 'ground' }[];
}

export interface AwardInput {
  readonly challenge: Challenge;
  readonly place: AwardPlace;
  /** Fractional reductions on business as usual. */
  readonly carbonReduction: number;
  readonly energyReduction: number;
  readonly outline: AwardOutline;
  readonly date: Date;
  /** Shown as typed, without the scheme. */
  readonly url: string;
}

export interface AwardFonts {
  /** data: URIs */
  readonly sans?: string;
  readonly mono?: string;
}

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthYear = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** "Highland Park · St. Paul, MN", or whatever parts are known. */
export function placeLines(place: AwardPlace): { main: string; sub: string | null } {
  const clean = (x: string | null | undefined) => (x && x.trim() ? x.trim() : null);
  const hood = clean(place.neighbourhood);
  const townState = [clean(place.town), clean(place.state)].filter(Boolean).join(', ') || null;
  if (hood && townState) return { main: hood, sub: townState };
  return { main: hood ?? townState ?? 'A neighbourhood', sub: null };
}

const pct = (f: number) => `${Math.round(Math.abs(f) * 100)}%`;
const direction = (f: number) => (f >= 0 ? 'less' : 'more');

/** Wrap a title onto at most two lines of about `chars` characters. */
function wrapTitle(text: string, chars: number): string[] {
  if (text.length <= chars) return [text];
  const words = text.split(' ');
  let first = '';
  while (words.length && (first + ' ' + words[0]).trim().length <= chars) first = `${first} ${words.shift()}`.trim();
  return [first, words.join(' ')];
}

/** The neighbourhood, fitted into a box, as line art. */
function outlineMarkup(o: AwardOutline, x: number, y: number, w: number, h: number): string {
  if (o.boundary.length < 3) return '';
  const lat0 = o.boundary.reduce((a, p) => a + p[1], 0) / o.boundary.length;
  const m = metresPerDegree(lat0);
  const project = (p: LonLat) => [p[0] * m.x, -p[1] * m.y] as const;
  // Fit over the plant too: a river or a data centre can sit outside the line.
  const pts = [...o.boundary, ...o.sources.map((x) => x.at)].map(project);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const k = Math.min((w - 40) / spanX, (h - 40) / spanY);
  const ox = x + (w - spanX * k) / 2;
  const oy = y + (h - spanY * k) / 2;
  const at = (p: LonLat) => {
    const [px, py] = project(p);
    return [ox + (px - minX) * k, oy + (py - minY) * k] as const;
  };
  const path = (ring: Ring) => ring.map((p, i) => `${i ? 'L' : 'M'}${at(p)[0].toFixed(1)} ${at(p)[1].toFixed(1)}`).join('') + 'Z';
  const colour = { heat: ICON_ORANGE, cool: ICON_BLUE, ground: ICON_GREEN } as const;
  return [
    `<path d="${path(o.boundary)}" fill="none" stroke="${C.accent}" stroke-width="3" stroke-linejoin="round"/>`,
    `<g fill="none" stroke="${C.building}" stroke-width="1.6" stroke-linejoin="round">${o.buildings.map((b) => `<path d="${path(b)}"/>`).join('')}</g>`,
    ...o.sources.map((s) => {
      const [cx, cy] = at(s.at);
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7" fill="${colour[s.role]}" stroke="${C.paper}" stroke-width="2"/>`;
    }),
  ].join('');
}

/**
 * The medal: a notched outer rim, a ring of dots, an inner disc, and the
 * challenge's icon at medal size. Line work in the icon's own ink, so the
 * icon and the medal read as one drawing.
 */
function medal(cx: number, cy: number, icon: string): string {
  const R = 272;
  // A scalloped rim: 48 shallow notches, like a struck medal's edge.
  const rim = Array.from({ length: 96 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? R : R - 9;
    return `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join('') + 'Z';
  const dots = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2;
    return `<circle cx="${(cx + Math.cos(a) * 238).toFixed(1)}" cy="${(cy + Math.sin(a) * 238).toFixed(1)}" r="${i % 4 === 0 ? 5 : 3}" fill="${C.seal}"/>`;
  }).join('');
  const scale = 6.4;
  return [
    `<path d="${rim}" fill="${C.paper}" stroke="${C.seal}" stroke-width="8" stroke-linejoin="round"/>`,
    `<circle cx="${cx}" cy="${cy}" r="252" fill="none" stroke="${C.seal}" stroke-width="3"/>`,
    dots,
    `<circle cx="${cx}" cy="${cy}" r="218" fill="${C.panel}" stroke="${C.accent}" stroke-width="5"/>`,
    `<g transform="translate(${cx - 24 * scale} ${cy - 24 * scale - 10}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round">${icon}</g>`,
  ].join('');
}

/**
 * The ribbon the medal hangs from: two straps meeting behind it, each in the
 * accent with a stripe of heat (orange) or cooling (blue) — the two sides a
 * network trades between.
 */
function ribbon(cx: number, top: number, meet: number): string {
  const strap = (side: -1 | 1, stripe: string) => {
    const x0 = cx + side * 250;
    const x1 = cx + side * 40;
    const w = 150;
    const outer = `M${x0 - (w / 2) * side} ${top}L${x0 + (w / 2) * side} ${top}L${x1 + (w / 2) * side} ${meet}L${x1 - (w / 2) * side} ${meet}Z`;
    const s0 = `M${x0 - 16} ${top}L${x0 + 16} ${top}L${x1 + 16} ${meet}L${x1 - 16} ${meet}Z`;
    return `<path d="${outer}" fill="${C.accent}"/><path d="${s0}" fill="${stripe}"/>`;
  };
  return strap(-1, ICON_ORANGE) + strap(1, ICON_BLUE);
}

/** A swallowtail banner across the medal, carrying the challenge's title. */
function banner(cx: number, cy: number, width: number, height: number): string {
  const x0 = cx - width / 2;
  const x1 = cx + width / 2;
  const tail = 70;
  const drop = 26;
  const y0 = cy - height / 2;
  const y1 = cy + height / 2;
  const leftTail = `M${x0 + 30} ${y0 + drop}L${x0 - tail} ${y0 + drop}L${x0 - tail + 34} ${(y0 + y1) / 2 + drop}L${x0 - tail} ${y1 + drop}L${x0 + 30} ${y1 + drop}Z`;
  const rightTail = `M${x1 - 30} ${y0 + drop}L${x1 + tail} ${y0 + drop}L${x1 + tail - 34} ${(y0 + y1) / 2 + drop}L${x1 + tail} ${y1 + drop}L${x1 - 30} ${y1 + drop}Z`;
  return [
    `<path d="${leftTail}" fill="${C.accentDeep}"/>`,
    `<path d="${rightTail}" fill="${C.accentDeep}"/>`,
    `<path d="M${x0} ${y1}L${x0 + 30} ${y1 + drop}L${x0 + 30} ${y1}Z" fill="${C.seal}"/>`,
    `<path d="M${x1} ${y1}L${x1 - 30} ${y1 + drop}L${x1 - 30} ${y1}Z" fill="${C.seal}"/>`,
    `<rect x="${x0}" y="${y0}" width="${width}" height="${height}" fill="${C.accent}"/>`,
  ].join('');
}

/** The product mark, literal colours (ui/Mark.tsx, light tile). */
function mark(x: number, y: number, size: number): string {
  const k = size / 70;
  return `<g transform="translate(${x} ${y}) scale(${k})" fill="none">
<rect width="70" height="70" rx="15" fill="${C.accent}"/>
<circle cx="35" cy="35" r="15" stroke="#FFFFFF" stroke-width="3"/>
<path d="M35 20V15M35 50V55M20 35H15M50 35H55" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
<rect x="29" y="6" width="12" height="10" rx="1.5" fill="${ICON_ORANGE}"/><rect x="29" y="54" width="12" height="10" rx="1.5" fill="${ICON_ORANGE}"/>
<rect x="6" y="29" width="10" height="12" rx="1.5" fill="${ICON_BLUE}"/><rect x="54" y="29" width="10" height="12" rx="1.5" fill="${ICON_BLUE}"/>
</g>`;
}

export function awardSvg(input: AwardInput, fonts: AwardFonts = {}): string {
  const W = AWARD_WIDTH;
  const H = AWARD_HEIGHT;
  const L = 72;
  const sans = `'Award Sans', 'Archivo', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
  const mono = `'Award Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace`;
  const face = [
    fonts.sans ? `@font-face{font-family:'Award Sans';src:url(${fonts.sans}) format('woff2');font-weight:100 900;}` : '',
    fonts.mono ? `@font-face{font-family:'Award Mono';src:url(${fonts.mono}) format('woff2');font-weight:500;}` : '',
  ].join('');
  const t = (x: number, y: number, size: number, text: string, opts: { weight?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; family?: string; spacing?: number } = {}) =>
    `<text x="${x}" y="${y}" font-family="${escapeXml(opts.family ?? sans)}" font-size="${size}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? C.ink}" text-anchor="${opts.anchor ?? 'start'}"${opts.spacing ? ` letter-spacing="${opts.spacing}"` : ''}>${escapeXml(text)}</text>`;

  const place = placeLines(input.place);
  const title = wrapTitle(input.challenge.title, 20);
  const titleSize = title.length > 1 ? 44 : 60;

  const medalY = 560;
  const bannerY = 810;
  const bannerH = title.length > 1 ? 124 : 104;
  const stripTop = 1062;
  const stripH = 146;
  const thumbW = 250;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>${face}</style>
<rect width="${W}" height="${H}" fill="${C.paper}"/>
${mark(L, 44, 56)}
${t(L + 74, 66, 18, 'PEASE STUDIO', { weight: 600, fill: C.muted, family: mono, spacing: 3 })}
${t(L + 74, 94, 26, 'Thermal Network Studio', { weight: 700 })}
${t(W - L, 82, 20, monthYear(input.date).toUpperCase(), { weight: 500, fill: C.muted, family: mono, anchor: 'end', spacing: 2 })}
${ribbon(W / 2, 128, medalY - 150)}
${medal(W / 2, medalY, ICONS[input.challenge.icon])}
${banner(W / 2, bannerY, 760, bannerH)}
${title
  .map((line, i) => t(W / 2, bannerY + (title.length > 1 ? -8 + i * 48 : 21) - (title.length > 1 ? 12 : 0), titleSize, line, { weight: 800, fill: C.paper, anchor: 'middle' }))
  .join('\n')}
${t(W / 2, bannerY + bannerH / 2 + 78, 22, 'CHALLENGE MET', { weight: 600, fill: C.accent, family: mono, anchor: 'middle', spacing: 6 })}
${t(W / 2, bannerY + bannerH / 2 + 132, 42, place.main, { weight: 700, anchor: 'middle' })}
${place.sub ? t(W / 2, bannerY + bannerH / 2 + 176, 30, place.sub, { fill: C.muted, anchor: 'middle' }) : ''}
<rect x="${L}" y="${stripTop}" width="${W - 2 * L}" height="${stripH}" rx="16" fill="${C.panel}"/>
${t(L + 32, stripTop + 78, 64, pct(input.carbonReduction), { weight: 800, fill: C.accent })}
${t(L + 32, stripTop + 118, 24, `${direction(input.carbonReduction)} carbon`, { weight: 600 })}
${t(L + 292, stripTop + 78, 64, pct(input.energyReduction), { weight: 800 })}
${t(L + 292, stripTop + 118, 24, `${direction(input.energyReduction)} energy`, { weight: 600 })}
${t(W - L - thumbW - 28, stripTop + 118, 18, 'than the buildings today', { fill: C.muted, anchor: 'end' })}
${outlineMarkup(input.outline, W - L - thumbW, stripTop, thumbW, stripH)}
<line x1="${L}" y1="1240" x2="${W - L}" y2="1240" stroke="${C.rule}" stroke-width="2"/>
${t(L, 1282, 26, input.url, { weight: 500, fill: C.accent, family: mono })}
${t(L, 1316, 19, 'Conveys an idea; does not predict a saving. Buildings © OpenStreetMap contributors.', { fill: C.muted })}
</svg>`;
}
