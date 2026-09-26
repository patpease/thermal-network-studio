/**
 * The product mark, drawn inline rather than loaded as a file.
 *
 * An `<img>` cannot see the theme, and a `<picture>` with
 * `prefers-color-scheme` still breaks when someone has pinned a theme with the
 * toggle. So the mark is inlined and every colour is a token: the tile inverts
 * as a unit, and the buildings keep their heat and cool hues.
 *
 * The drawing lives in `brand/mark.ts`; this passes it the tokens.
 */
import { markInner } from '../brand/mark';

const TOKENS = {
  tile: 'var(--mark-ground)',
  loop: 'var(--mark-loop)',
  heat: 'var(--mark-heat)',
  cool: 'var(--mark-cool)',
  ground: 'var(--mark-base)',
};

export function Mark({ size = 38 }: { size?: number }) {
  return (
    <svg
      className="brand-icon"
      viewBox="0 0 70 70"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      // Our own constant markup; the colours are CSS variables.
      dangerouslySetInnerHTML={{ __html: markInner(TOKENS) }}
    />
  );
}
