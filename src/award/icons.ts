/**
 * Challenge icons, drawn to Psychrometric Studio's icon rules so the suite
 * reads as one hand (docs/design-system.md there):
 *
 *   - a 48 × 48 grid;
 *   - outline in #0B2B28, primary strokes 3, detail 2.4–2.8, round caps and joins;
 *   - accents from exactly three colours, each with a meaning —
 *       blue   #2F9BD6  water, cooling, the cold side
 *       green  #3ECF8E  the loop, the primary path
 *       orange #E2842F  heat, the warm side
 *   - no fills except small solid dots.
 *
 * New drawings, not copies: none of these exists in that set. The award draws
 * them at badge size; the challenge picker at 48. `tests/award.test.ts` holds
 * every icon to the rules above.
 */
import type { ChallengeIcon } from '../challenges/challenges';

export const ICON_INK = '#0B2B28';
export const ICON_BLUE = '#2F9BD6';
export const ICON_GREEN = '#3ECF8E';
export const ICON_ORANGE = '#E2842F';

const s = (d: string, colour: string, width = 3) => `<path d="${d}" stroke="${colour}" stroke-width="${width}"/>`;
const dot = (cx: number, cy: number, r: number, colour: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colour}"/>`;

/** The inner markup of each icon, on the 48 grid. */
export const ICONS: Record<ChallengeIcon, string> = {
  // A cloud of carbon, and the loop carrying half of it away.
  'half-carbon': [
    s('M13 30H33A6.5 6.5 0 0 0 33 17A9 9 0 0 0 16 15.5A7.5 7.5 0 0 0 13 30Z', ICON_INK),
    s('M24 17V30', ICON_INK, 2.4),
    s('M28.5 34V42M25 38.5L28.5 42L32 38.5', ICON_GREEN, 2.8),
  ].join(''),

  // A level beam over the ground; one borehole gives, one takes back.
  'ground-balance': [
    s('M6 20H42', ICON_INK),
    s('M12 9H36', ICON_INK),
    s('M24 9L20 16H28Z', ICON_INK, 2.6),
    dot(12, 9, 2.2, ICON_INK),
    dot(36, 9, 2.2, ICON_INK),
    s('M15 20V36A3 3 0 0 0 21 36V20', ICON_BLUE, 2.8),
    s('M27 20V36A3 3 0 0 0 33 36V20', ICON_ORANGE, 2.8),
  ].join(''),

  // A server rack's heat, carried by the loop to a home.
  'waste-not': [
    s('M7 11H18V35H7Z', ICON_INK),
    s('M10 17H15M10 22H15M10 27H15', ICON_INK, 2.4),
    s('M21 21C23.5 19 25 23 27.5 21M25 17.5L28 21L24.8 24', ICON_ORANGE, 2.6),
    s('M31 35V25L36.5 20.5L42 25V35Z', ICON_INK),
    s('M12.5 35V40H36.5V35', ICON_GREEN, 2.8),
  ].join(''),

  // A home on its ground loop; the fan on the roof, struck out.
  'off-the-air': [
    s('M6 36H42', ICON_INK),
    s('M13 36V25L22 18L31 25V36', ICON_INK),
    s('M18 36V41A4 4 0 0 0 26 41V36', ICON_GREEN, 2.8),
    `<circle cx="36" cy="12" r="6" stroke="${ICON_INK}" stroke-width="2.4"/>`,
    s('M36 12V8M36 12L32.6 14M36 12L39.4 14', ICON_GREEN, 2.4),
    s('M29 5L43 19', ICON_INK, 2.6),
  ].join(''),

  // A transmission tower, and the winter peak brought down.
  'easy-on-the-grid': [
    s('M9 42L15.5 7H21.5L28 42', ICON_INK),
    s('M6 14H31', ICON_INK, 2.6),
    s('M10 23H27', ICON_INK, 2.4),
    s('M12.5 32H24.5', ICON_INK, 2.4),
    s('M35 9L38 14L41 9', ICON_ORANGE, 2.6),
    s('M38 18V38M34 34L38 38L42 34', ICON_GREEN, 2.8),
  ].join(''),
};

/** A standalone 48 × 48 SVG, for the picker. */
export function iconSvg(icon: ChallengeIcon): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`;
}
