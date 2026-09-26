/**
 * The product mark: two buildings on the ground line, one drawing heat
 * (orange) and one giving it (blue), joined by a loop below grade (green).
 * Chosen from three options after phase 07.
 *
 * Drawn once here, on the suite's 70-unit tile (Psychrometric Studio, ZEEL),
 * and used three ways: the header (`ui/Mark.tsx`, colours as tokens so it
 * follows the theme), the favicons (`public/icon*.svg`, literal colours,
 * checked against this by `tests/mark.test.ts`), and the award (literal).
 */
export interface MarkColours {
  readonly tile: string;
  readonly loop: string;
  readonly heat: string;
  readonly cool: string;
  /** The ground line. */
  readonly ground: string;
}

/** On the dark ink tile: the standard mark. */
export const MARK_STANDARD: MarkColours = { tile: '#0B2B28', loop: '#3ECF8E', heat: '#E2842F', cool: '#2F9BD6', ground: '#F4F7F6' };
/** On the light tile: the reversed mark, for dark surroundings. */
export const MARK_REVERSED: MarkColours = { tile: '#F4F7F6', loop: '#0E5C55', heat: '#E2842F', cool: '#2F9BD6', ground: '#0B2B28' };

/** The mark's inner markup on the 70 × 70 grid. */
export function markInner(c: MarkColours): string {
  return [
    `<rect width="70" height="70" rx="15" fill="${c.tile}"/>`,
    `<rect x="12" y="20" width="14" height="22" rx="2" fill="${c.heat}"/>`,
    `<rect x="44" y="28" width="14" height="14" rx="2" fill="${c.cool}"/>`,
    `<path d="M8 42H62" stroke="${c.ground}" stroke-width="3" stroke-linecap="round" opacity=".55"/>`,
    `<path d="M19 42V51A6 6 0 0 0 25 57H45A6 6 0 0 0 51 51V42" stroke="${c.loop}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  ].join('');
}

/** A standalone SVG file of the mark. */
export function markSvg(c: MarkColours, size = 70): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 70 70" fill="none">${markInner(c)}</svg>\n`;
}
