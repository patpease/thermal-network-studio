/**
 * The product mark, drawn inline rather than loaded as a file.
 *
 * An `<img>` cannot see the theme, and a `<picture>` with
 * `prefers-color-scheme` still breaks when someone has pinned a theme with the
 * toggle. So the mark is inlined and every colour is a token: the tile inverts
 * as a unit, as ZEEL's does, and the buildings keep their heat and cool hues.
 *
 * The drawing: an ambient loop with four buildings on it, two drawing heat and
 * two rejecting it. That exchange is what the tool is about.
 *
 * PLACEHOLDER until a real tile is drawn (`BRAND.markIsPlaceholder`).
 */
export function Mark({ size = 38 }: { size?: number }) {
  return (
    <svg
      className="brand-icon"
      viewBox="0 0 70 70"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
    >
      <rect width="70" height="70" rx="15" fill="var(--mark-ground)" />
      <circle cx="35" cy="35" r="15" stroke="var(--mark-loop)" strokeWidth="3" />
      <g stroke="var(--mark-loop)" strokeWidth="2.5" strokeLinecap="round">
        <path d="M35 20V15M35 50V55M20 35H15M50 35H55" />
      </g>
      <rect x="29" y="6" width="12" height="10" rx="1.5" fill="var(--mark-heat)" />
      <rect x="29" y="54" width="12" height="10" rx="1.5" fill="var(--mark-heat)" />
      <rect x="6" y="29" width="10" height="12" rx="1.5" fill="var(--mark-cool)" />
      <rect x="54" y="29" width="10" height="12" rx="1.5" fill="var(--mark-cool)" />
    </svg>
  );
}
