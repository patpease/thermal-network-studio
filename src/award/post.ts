/**
 * The LinkedIn post that goes with an award (D34), and the link it carries.
 *
 * LinkedIn's share links can pre-fill a post's text but cannot attach an
 * image, so the flow is: download the award, copy this text (after the
 * player has edited it), open LinkedIn's composer, drag the image in. Nothing
 * is uploaded anywhere by this tool.
 */
import type { Challenge } from '../challenges/challenges';
import { AWARD_LINK_BASE } from '../config/branding';
import { placeLines } from './graphic';
import type { AwardPlace } from './graphic';

/** The link on the award and in the post: the tool, opened on this challenge. */
export function challengeLink(challenge: Challenge): string {
  return `${AWARD_LINK_BASE}/?challenge=${encodeURIComponent(challenge.id)}`;
}

/** The link as printed on the graphic: no scheme, no query. */
export const printedLink = () => AWARD_LINK_BASE.replace(/^https?:\/\//, '');

const pct = (f: number) => `${Math.round(Math.abs(f) * 100)}% ${f >= 0 ? 'less' : 'more'}`;

export function postText(input: {
  challenge: Challenge;
  place: AwardPlace;
  carbonReduction: number;
  energyReduction: number;
}): string {
  const { main, sub } = placeLines(input.place);
  const where = sub ? `${main}, ${sub}` : main;
  return [
    `I earned the “${input.challenge.title}” award in Thermal Network Studio. I designed a shared thermal energy network for ${where} — ${pct(input.carbonReduction)} carbon and ${pct(input.energyReduction)} energy than the same buildings today.`,
    input.challenge.idea,
    `Thermal Network Studio uses first-principle physics and publicly accessible building data to convey an idea. It is not a full feasibility study; to learn more, find an expert and start a dialog. Try the challenge on your own neighbourhood: ${challengeLink(input.challenge)}`,
    '#ThermalEnergyNetworks #Decarbonization',
  ].join('\n\n');
}

/**
 * LinkedIn's composer, opened with the text in it. The `shareActive` form is
 * the one that still pre-fills text; the older share-offsite endpoint takes
 * only a URL. If LinkedIn ignores the text, the player has it on the
 * clipboard already.
 */
export function linkedInComposeUrl(text: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
}
