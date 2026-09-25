import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The palette is declared in THREE blocks and two of them must stay
 * byte-for-byte equal. Plain CSS cannot share one declaration block between a
 * media query and a bare selector, so the duplication is forced — and a token
 * added to one and not the other produces a colour that falls back to an
 * initial value, which for `fill` is opaque black.
 *
 * This is the failure that a browser does not report and a screenshot in the
 * wrong theme does not catch.
 */

const css = readFileSync(
  resolve(import.meta.dirname, '../src/ui/tokens.css'),
  'utf8',
);

/** Pull the declarations out of the block whose selector line matches. */
function block(startPattern: RegExp): Map<string, string> {
  const from = css.search(startPattern);
  if (from === -1) throw new Error(`No block matching ${startPattern}`);

  // Walk braces from the first `{` after the selector so a nested media query
  // is handled without a CSS parser.
  const open = css.indexOf('{', from);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = css.slice(open + 1, end);
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

const light = block(/^:root,\n\[data-theme='light'\] \{/m);
const darkMedia = block(/@media \(prefers-color-scheme: dark\) \{/);
const darkStamped = block(/^\[data-theme='dark'\] \{/m);

describe('token declarations', () => {
  it('declares a non-trivial palette in the light block', () => {
    expect(light.size).toBeGreaterThan(10);
  });

  it('the two dark blocks are token-for-token equal', () => {
    // Compare as sorted entries so a reordering is not a failure but a
    // missing or differing token is.
    const a = [...darkMedia.entries()].sort(([x], [y]) => x.localeCompare(y));
    const b = [...darkStamped.entries()].sort(([x], [y]) => x.localeCompare(y));
    expect(a).toEqual(b);
  });

  it('every light token is redefined in dark, and vice versa', () => {
    const lightKeys = [...light.keys()].sort();
    const darkKeys = [...darkMedia.keys()].sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it('defines no colour only inside a dark block', () => {
    for (const key of darkMedia.keys()) {
      expect(light.has(key)).toBe(true);
    }
  });
});

describe('heat and cool', () => {
  it('heat is orange and cool is blue in both themes — a physical convention, not styling', () => {
    // Hue in degrees from a hex, enough to tell orange from blue.
    const hue = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    for (const map of [light, darkMedia]) {
      for (const key of ['--heat', '--heat-ink', '--mark-heat']) {
        const h = hue(map.get(key)!);
        expect(h, key).toBeGreaterThan(15);
        expect(h, key).toBeLessThan(45);
      }
      for (const key of ['--cool', '--cool-ink', '--mark-cool']) {
        const h = hue(map.get(key)!);
        expect(h, key).toBeGreaterThan(190);
        expect(h, key).toBeLessThan(220);
      }
    }
  });

  it('the accent is never one of the series hues', () => {
    for (const map of [light, darkMedia]) {
      const accent = map.get('--accent');
      for (const key of ['--heat', '--cool']) expect(map.get(key)).not.toBe(accent);
    }
  });
});
