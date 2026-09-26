/**
 * A challenge icon on screen. The award draws the same markup in its own
 * literal ink; here the ink becomes `currentColor`, as Psychrometric Studio's
 * icon build does, so one drawing serves both themes.
 */
import type { ChallengeIcon as IconId } from '../challenges/challenges';
import { ICON_INK, ICONS } from '../award/icons';

export function ChallengeIcon({ icon, size = 40 }: { icon: IconId; size?: number }) {
  return (
    <svg
      className="challenge-icon"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // Our own constant markup, never user text.
      dangerouslySetInnerHTML={{ __html: ICONS[icon].replaceAll(ICON_INK, 'currentColor') }}
    />
  );
}
