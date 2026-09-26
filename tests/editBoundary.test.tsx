// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import type { Design } from '../src/engine/design';
import { EMPTY_DESIGN } from '../src/engine/design';
import { siteForCounty } from '../src/relay/relay';
import type { Ring } from '../src/site/geometry';
import { useSite } from '../src/ui/useSite';

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/sites/mankato-downtown.json'), 'utf8')) as { data: { boundary: Ring } };
const boundary = fixture.data.boundary;
const w = calibrationWeather('6A');

const fetchCalls: string[] = [];
function mockFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    fetchCalls.push(url);
    const body = url.includes('/api/site')
      ? { ...siteForCounty('27013'), town: 'Mankato', state: 'MN' }
      : url.includes('/api/weather')
        ? { year: 2018, timezone: 'x', temperature: Array.from(w.temperature), ghi: Array.from(w.ghi), relativeHumidity: Array.from(w.relativeHumidity ?? []), firstWeekday: w.firstWeekday, attribution: 'x' }
        : { site: fixture.data };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

afterEach(() => {
  fetchCalls.length = 0;
});

const design: Design = { ...EMPTY_DESIGN, sources: [{ id: 'air-source-1', kind: 'air-source', capacityW: 1e6 }] };

async function ready() {
  mockFetch();
  const hook = renderHook(() => useSite());
  await act(async () => {
    await hook.result.current.load(boundary, { selection: { excluded: new Set(['x']), overrides: new Map() }, design });
  });
  await waitFor(() => expect(hook.result.current.state.phase).toBe('ready'));
  return hook;
}

describe('editing the boundary', () => {
  it('reopens the drawn boundary with its corners, and a corner can be moved', async () => {
    const { result } = await ready();
    act(() => result.current.startEditing());
    expect(result.current.state.phase).toBe('editing');
    expect(result.current.state.draft).toEqual(boundary.slice(0, -1));
    act(() => result.current.moveVertex(1, [-94.0, 44.165]));
    expect(result.current.state.draft[1]).toEqual([-94.0, 44.165]);
    expect(result.current.state.draft[0]).toEqual(boundary[0]);
  });

  it('Cancel puts everything back as it was, with no new fetch', async () => {
    const { result } = await ready();
    const before = result.current.state;
    const calls = fetchCalls.length;
    act(() => result.current.startEditing());
    act(() => result.current.moveVertex(0, [-94.1, 44.1]));
    act(() => result.current.cancelEditing());
    expect(result.current.state).toBe(before);
    expect(fetchCalls.length).toBe(calls);
  });

  it('Done re-reads the site inside the new boundary and keeps the design and building changes', async () => {
    const { result } = await ready();
    act(() => result.current.startEditing());
    act(() => result.current.moveVertex(2, [boundary[2]![0] + 0.001, boundary[2]![1]]));
    await act(async () => {
      result.current.finishEditing();
    });
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    expect(result.current.state.boundary![2]).toEqual([boundary[2]![0] + 0.001, boundary[2]![1]]);
    expect(result.current.state.design).toEqual(design);
    expect([...result.current.state.selection.excluded]).toEqual(['x']);
  });

  it('a drawing in progress can move its corners too', () => {
    const { result } = renderHook(() => useSite());
    act(() => result.current.startDrawing());
    act(() => result.current.addPoint([0, 0]));
    act(() => result.current.addPoint([1, 0]));
    act(() => result.current.moveVertex(0, [0.5, 0.5]));
    expect(result.current.state.draft).toEqual([
      [0.5, 0.5],
      [1, 0],
    ]);
  });
});
