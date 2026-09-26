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
    `<path d="${path(o.boundary)}" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linejoin="round"/>`,
    `<g fill="none" stroke="${C.building}" stroke-width="1.6" stroke-linejoin="round">${o.buildings.map((b) => `<path d="${path(b)}"/>`).join('')}</g>`,
    ...o.sources.map((s) => {
      const [cx, cy] = at(s.at);
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="${colour[s.role]}" stroke="${C.paper}" stroke-width="3"/>`;
    }),
  ].join('');
}

/** The seal: two rings, a ring of dots, and the challenge's icon at badge size. */
function seal(cx: number, cy: number, icon: string): string {
  const dots = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    return `<circle cx="${(cx + Math.cos(a) * 198).toFixed(1)}" cy="${(cy + Math.sin(a) * 198).toFixed(1)}" r="${i % 3 === 0 ? 4.5 : 2.6}" fill="${C.seal}"/>`;
  }).join('');
  const scale = 5;
  return [
    `<circle cx="${cx}" cy="${cy}" r="214" fill="none" stroke="${C.seal}" stroke-width="6"/>`,
    dots,
    `<circle cx="${cx}" cy="${cy}" r="180" fill="${C.panel}" stroke="${C.accent}" stroke-width="3"/>`,
    `<g transform="translate(${cx - 24 * scale} ${cy - 24 * scale}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round">${icon}</g>`,
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
  const title = wrapTitle(input.challenge.title, 22);
  // One line at 68 px; a long title takes two at 54 so the panel keeps its room.
  const titleSize = title.length > 1 ? 54 : 68;
  const titleY = 694;
  const afterTitle = titleY + (title.length - 1) * 60;

  const lowerTop = afterTitle + 136;
  const outlineX = 540;
  const outlineW = W - L - outlineX;
  const lowerH = 1196 - lowerTop;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>${face}</style>
<rect width="${W}" height="${H}" fill="${C.paper}"/>
<rect x="0" y="0" width="${W}" height="10" fill="${C.accent}"/>
${mark(L, 56, 64)}
${t(L + 84, 80, 20, 'PEASE STUDIO', { weight: 600, fill: C.muted, family: mono, spacing: 3 })}
${t(L + 84, 110, 30, 'Thermal Network Studio', { weight: 700 })}
${t(W - L, 96, 22, monthYear(input.date).toUpperCase(), { weight: 500, fill: C.muted, family: mono, anchor: 'end', spacing: 2 })}
${seal(W / 2, 372, ICONS[input.challenge.icon])}
${t(W / 2, 628, 22, 'CHALLENGE MET', { weight: 600, fill: C.accent, family: mono, anchor: 'middle', spacing: 5 })}
${title.map((line, i) => t(W / 2, titleY + i * 60, titleSize, line, { weight: 700, anchor: 'middle' })).join('\n')}
${t(W / 2, afterTitle + 58, 38, place.main, { weight: 600, anchor: 'middle' })}
${place.sub ? t(W / 2, afterTitle + 98, 30, place.sub, { fill: C.muted, anchor: 'middle' }) : ''}
<rect x="${L}" y="${lowerTop}" width="${W - 2 * L}" height="${lowerH}" rx="18" fill="${C.panel}"/>
${t(L + 36, lowerTop + 100, 88, pct(input.carbonReduction), { weight: 700, fill: C.accent })}
${t(L + 36, lowerTop + 138, 28, `${direction(input.carbonReduction)} carbon`, { weight: 600 })}
${t(L + 36, lowerTop + 222, 64, pct(input.energyReduction), { weight: 700 })}
${t(L + 36, lowerTop + 258, 26, `${direction(input.energyReduction)} energy`, { weight: 600 })}
${t(L + 36, lowerTop + 300, 20, 'than the same buildings today', { fill: C.muted })}
${outlineMarkup(input.outline, outlineX, lowerTop, outlineW, lowerH)}
<line x1="${L}" y1="1232" x2="${W - L}" y2="1232" stroke="${C.rule}" stroke-width="2"/>
${t(L, 1278, 26, input.url, { weight: 500, fill: C.accent, family: mono })}
${t(L, 1314, 19, 'Conveys an idea; does not predict a saving. Buildings © OpenStreetMap contributors.', { fill: C.muted })}
</svg>`;
}
