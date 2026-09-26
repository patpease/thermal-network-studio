import { describe, expect, it } from 'vitest';

import { EMPTY_DESIGN } from '../src/engine/design';
import type { Design } from '../src/engine/design';
import { decodeShare, encodeShare, readLocation, SHARE_VERSION, shareUrl } from '../src/io/share';
import type { Shared } from '../src/io/share';

const design: Design = {
  ...EMPTY_DESIGN,
  band: { min: -3, max: 30 },
  retrofit: 0.6,
  sources: [
    { id: 'bores-1', kind: 'bore-field', boreholes: 400, at: [-94.0012345678, 44.1612345678] },
    { id: 'water-1', kind: 'water', label: 'Minnesota River', capacityW: 2e6, water: 'surface', origin: 'w123' },
    { id: 'waste-heat-1', kind: 'waste-heat', label: 'Rink', capacityW: 3e5, temperature: 30 },
  ],
};
const shared: Shared = {
  boundary: [
    [-94.01, 44.16],
    [-94.0, 44.16],
    [-94.0, 44.17],
    [-94.01, 44.16],
  ],
  selection: { excluded: new Set(['w1']), overrides: new Map([['w2', { archetype: 'hotel' as const }]]) },
  design,
  challenge: 'waste-not',
};

describe('share links', () => {
  it('round-trips the boundary, the player’s changes, the design and the challenge', () => {
    const back = decodeShare(encodeShare(shared))!;
    expect(back.challenge).toBe('waste-not');
    expect([...back.selection.excluded]).toEqual(['w1']);
    expect(back.selection.overrides.get('w2')).toEqual({ archetype: 'hotel' });
    expect(back.design.band).toEqual({ min: -3, max: 30 });
    expect(back.design.retrofit).toBe(0.6);
    expect(back.design.sources).toHaveLength(3);
    expect(back.design.sources[0]!.at).toEqual([-94.001235, 44.161235]);
  });

  it('is URL-safe and short', () => {
    const code = encodeShare(shared);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(shareUrl('https://x.test', shared).length).toBeLessThan(2000);
  });

  it('refuses a link from a future version rather than half-reading it', () => {
    const future = btoa(JSON.stringify({ v: SHARE_VERSION + 1, b: [], d: {} })).replace(/=+$/, '');
    expect(decodeShare(future)).toBeNull();
  });

  it('returns null for anything malformed', () => {
    for (const bad of ['', 'not-base64!!', btoa('{"v":1}'), btoa(JSON.stringify({ v: 1, b: [[0, 0]], d: { s: [], b: [2, 30], r: 1 } }))]) {
      expect(decodeShare(bad)).toBeNull();
    }
    const badSource = encodeShare({ ...shared, design: { ...design, sources: [{ id: 'x', kind: 'bore-field', boreholes: 'many' } as never] } });
    expect(decodeShare(badSource)).toBeNull();
  });

  it('reads a full link from the fragment and a challenge link from the query', () => {
    expect(readLocation({ hash: `#s=${encodeShare(shared)}`, search: '' }).challenge).toBe('waste-not');
    expect(readLocation({ hash: '', search: '?challenge=half-carbon' })).toEqual({ shared: null, challenge: 'half-carbon' });
    expect(readLocation({ hash: '#s=garbage', search: '' })).toEqual({ shared: null, challenge: null });
  });
});
