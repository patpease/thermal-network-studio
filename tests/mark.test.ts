import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MARK_REVERSED, MARK_STANDARD, markSvg } from '../src/brand/mark';
import { BRAND } from '../src/config/branding';

const file = (name: string) => readFileSync(resolve(import.meta.dirname, '../public', name), 'utf8');

describe('the product mark', () => {
  it('the favicons are the mark, drawn from brand/mark.ts (run npm run brand:icons after a change)', () => {
    expect(file('icon.svg')).toBe(markSvg(MARK_STANDARD));
    expect(file('icon-dark.svg')).toBe(markSvg(MARK_REVERSED));
  });

  it('keeps heat orange and cooling blue in both versions', () => {
    for (const c of [MARK_STANDARD, MARK_REVERSED]) {
      expect(c.heat).toBe('#E2842F');
      expect(c.cool).toBe('#2F9BD6');
    }
  });

  it('is no longer a placeholder', () => {
    expect(BRAND.markIsPlaceholder).toBe(false);
  });
});
