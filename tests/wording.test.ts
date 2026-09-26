import { describe, expect, it } from 'vitest';

import { CHALLENGES } from '../src/challenges/challenges';
import * as COPY from '../src/config/copy';

/**
 * The tool's wording states facts; it does not argue with the reader (D37).
 * Every string in copy.ts and every challenge's brief and idea is held to it.
 */
const ARGUING = /\b(because|so that|which is why|that is why|this means|deliberately|the game|we|our|you'll|you’ll)\b/i;

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') return [String((value as (...a: number[]) => string)(1, 2))];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('wording', () => {
  const all = [...strings(COPY), ...CHALLENGES.flatMap((c) => [c.brief, c.idea])];

  it('covers a real amount of text', () => {
    expect(all.length).toBeGreaterThan(80);
  });

  for (const s of all) {
    it(`states facts: “${s.slice(0, 60)}${s.length > 60 ? '…' : ''}”`, () => {
      expect(s).not.toMatch(ARGUING);
    });
  }
});
