import { describe, expect, it } from 'vitest';

import { AWARD_HEIGHT, AWARD_WIDTH, awardSvg, escapeXml, placeLines } from '../src/award/graphic';
import type { AwardInput } from '../src/award/graphic';
import { ICON_BLUE, ICON_GREEN, ICON_INK, ICON_ORANGE, ICONS } from '../src/award/icons';
import { challengeLink, linkedInComposeUrl, postText } from '../src/award/post';
import { CHALLENGES } from '../src/challenges/challenges';
import { AWARD_LINK_BASE } from '../src/config/branding';

describe('challenge icons follow Psychrometric Studio’s rules', () => {
  const allowed = new Set([ICON_INK, ICON_BLUE, ICON_GREEN, ICON_ORANGE]);

  it('has one icon per challenge', () => {
    for (const c of CHALLENGES) expect(ICONS[c.icon]).toBeTruthy();
  });

  for (const [id, markup] of Object.entries(ICONS)) {
    it(`${id}: three accents and the outline ink only, strokes 2.4–3, fills only on dots`, () => {
      for (const [, colour] of markup.matchAll(/(?:stroke|fill)="([^"]+)"/g)) expect(allowed.has(colour!)).toBe(true);
      for (const [, w] of markup.matchAll(/stroke-width="([^"]+)"/g)) {
        const n = Number(w);
        expect(n === 3 || (n >= 2.4 && n <= 2.8)).toBe(true);
      }
      for (const [, tag] of markup.matchAll(/<(\w+)[^>]*\sfill="#/g)) expect(tag).toBe('circle');
      expect(markup).toMatch(new RegExp(ICON_INK));
    });
  }
});

const input = (over: Partial<AwardInput> = {}): AwardInput => ({
  challenge: CHALLENGES[1]!,
  place: { neighbourhood: 'Highland Park', town: 'St. Paul', state: 'MN' },
  carbonReduction: 0.734,
  energyReduction: 0.58,
  outline: {
    boundary: [
      [-93.2, 44.9],
      [-93.19, 44.9],
      [-93.19, 44.91],
      [-93.2, 44.9],
    ],
    buildings: [],
    sources: [{ at: [-93.195, 44.905], role: 'ground' }],
  },
  date: new Date(2026, 8, 26),
  url: 'example.test',
  ...over,
});

describe('the award graphic', () => {
  it('is 1080 × 1350, portrait, for a LinkedIn post', () => {
    expect([AWARD_WIDTH, AWARD_HEIGHT]).toEqual([1080, 1350]);
    expect(awardSvg(input())).toContain('viewBox="0 0 1080 1350"');
  });

  it('names the challenge, the place, the month and the headline results', () => {
    const svg = awardSvg(input());
    for (const s of ['Ground in balance', 'Highland Park', 'St. Paul, MN', 'September 2026', '73%', 'less carbon', '58%', 'CHALLENGE MET']) expect(svg).toContain(s);
  });

  it('ends on one footer line, the app, the link and the month, and draws no NaN', () => {
    const svg = awardSvg(input());
    const drawn = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(drawn.at(-1)).toMatch(/^Thermal Network Studio · .*example\.test.* · September 2026$/);
    expect(drawn.join(' ')).not.toContain('feasibility study');
    expect(drawn.join(' ')).not.toContain('OpenStreetMap');
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('escapes anything a player typed', () => {
    const svg = awardSvg(input({ place: { neighbourhood: '<script>alert(1)</script> & Co', town: null, state: null } }));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(escapeXml(`"'&`)).toBe('&quot;&apos;&amp;');
  });

  it('says "more" rather than printing a negative reduction', () => {
    expect(awardSvg(input({ energyReduction: -0.12 }))).toContain('more energy');
  });

  it('uses whatever place names are known, and never invents one', () => {
    expect(placeLines({ neighbourhood: 'Downtown', town: 'Mankato', state: 'MN' })).toEqual({ main: 'Downtown', sub: 'Mankato, MN' });
    expect(placeLines({ neighbourhood: '  ', town: 'Mankato', state: 'MN' })).toEqual({ main: 'Mankato, MN', sub: null });
    expect(placeLines({})).toEqual({ main: 'A neighbourhood', sub: null });
  });
});

describe('the LinkedIn post', () => {
  const c = CHALLENGES[0]!;
  const text = postText({ challenge: c, place: { neighbourhood: 'Downtown', town: 'Mankato', state: 'MN' }, carbonReduction: 0.7, energyReduction: 0.66 });

  it('names the challenge, the place and the results, and links back to the challenge', () => {
    expect(text).toContain('“Half the carbon”');
    expect(text).toContain('Downtown, Mankato, MN');
    expect(text).toContain('70% less carbon');
    expect(text).toContain(`${AWARD_LINK_BASE}/?challenge=half-carbon`);
    expect(challengeLink(c)).toBe(`${AWARD_LINK_BASE}/?challenge=half-carbon`);
  });

  it('keeps the scope: an idea, not a full feasibility study', () => {
    expect(text).toContain('not a full feasibility study');
  });

  it('opens LinkedIn’s composer with the text encoded', () => {
    const url = new URL(linkedInComposeUrl('a & b\nc'));
    expect(url.hostname).toBe('www.linkedin.com');
    expect(url.searchParams.get('text')).toBe('a & b\nc');
  });
});
