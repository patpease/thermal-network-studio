/**
 * The site's state, from a drawn boundary to the engine's first answer.
 *
 *   draw → boundary → (site, weather, buildings in parallel) → classify →
 *   neighbourhood → engine (no sources yet: business as usual and the
 *   site metrics) → ready
 *
 * Every step can fail on its own and says so in plain words; a failure never
 * leaves a stale site on the map. A newer boundary supersedes an older one
 * still loading — its answers are dropped when they arrive.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { createEngine } from '../engine/client';
import type { EngineClient } from '../engine/client';
import type { ScenarioResult } from '../engine/scenario';
import type { WeatherYear } from '../loads/model';
import type { SitePayload, WeatherPayload } from '../relay/relay';
import { classifySite, MAX_BUILDINGS } from '../site/classify';
import type { Site } from '../site/classify';
import { centroid, ringArea } from '../site/geometry';
import type { LonLat, Ring } from '../site/geometry';
import { connected, EMPTY_SELECTION, toNeighbourhood } from '../site/neighbourhood';
import type { BuildingOverride, Selection } from '../site/neighbourhood';
import { boundaryProblem } from '../site/osm';
import type { SiteData } from '../site/osm';

export type Phase = 'idle' | 'drawing' | 'loading' | 'ready' | 'error';

export interface SiteState {
  readonly phase: Phase;
  readonly draft: readonly LonLat[];
  readonly boundary: Ring | null;
  readonly place: SitePayload | null;
  readonly site: Site | null;
  readonly weather: (WeatherYear & { attribution: string; year: number }) | null;
  readonly selection: Selection;
  readonly result: ScenarioResult | null;
  readonly running: boolean;
  readonly message: string | null;
}

const INITIAL: SiteState = {
  phase: 'idle',
  draft: [],
  boundary: null,
  place: null,
  site: null,
  weather: null,
  selection: EMPTY_SELECTION,
  result: null,
  running: false,
  message: null,
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `The request failed (${response.status}).`);
  return body;
}

export function useSite() {
  const [state, setState] = useState<SiteState>(INITIAL);
  // Read by callbacks that must act on the CURRENT state without re-creating
  // themselves (and without side effects inside a state updater, which
  // StrictMode runs twice).
  const current = useRef(state);
  current.current = state;
  const generation = useRef(0);
  const engine = useRef<EngineClient | null>(null);

  useEffect(() => {
    // No Worker (a test DOM, a very old browser): the page still works up to
    // the point of running the year, and says so there.
    if (typeof Worker === 'undefined') return;
    engine.current = createEngine();
    return () => engine.current?.terminate();
  }, []);

  const startDrawing = useCallback(() => {
    generation.current++;
    setState({ ...INITIAL, phase: 'drawing' });
  }, []);

  const addPoint = useCallback((p: LonLat) => {
    setState((s) => (s.phase === 'drawing' ? { ...s, draft: [...s.draft, p] } : s));
  }, []);

  const undoPoint = useCallback(() => {
    setState((s) => (s.phase === 'drawing' ? { ...s, draft: s.draft.slice(0, -1) } : s));
  }, []);

  const clear = useCallback(() => {
    generation.current++;
    setState(INITIAL);
  }, []);

  const load = useCallback(async (boundary: Ring) => {
    const mine = ++generation.current;
    const stillMine = () => mine === generation.current;
    setState({ ...INITIAL, phase: 'loading', boundary });

    const [lon, lat] = centroid(boundary);
    try {
      const [place, weather, buildings] = await Promise.all([
        getJson<SitePayload>(`/api/site?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`),
        getJson<WeatherPayload>(`/api/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`),
        getJson<{ site: SiteData }>('/api/buildings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boundary }),
        }),
      ]);
      if (!stillMine()) return;
      const site = classifySite({ ...buildings.site, boundary });
      const w = {
        temperature: Float64Array.from(weather.temperature),
        ghi: Float64Array.from(weather.ghi),
        relativeHumidity: Float64Array.from(weather.relativeHumidity),
        firstWeekday: weather.firstWeekday,
        attribution: weather.attribution,
        year: weather.year,
      };
      setState((s) => ({ ...s, phase: 'ready', place, site, weather: w, selection: EMPTY_SELECTION }));
    } catch (error) {
      if (!stillMine()) return;
      setState((s) => ({ ...s, phase: 'error', message: error instanceof Error ? error.message : String(error) }));
    }
  }, []);

  const finishDrawing = useCallback(() => {
    const s = current.current;
    if (s.phase !== 'drawing') return;
    const ring: Ring = [...s.draft, s.draft[0]!];
    const why = s.draft.length < 3 ? 'Place at least three points.' : boundaryProblem(ring);
    if (why) setState({ ...s, message: why });
    else void load(ring);
  }, [load]);

  const toggleBuilding = useCallback((id: string) => {
    setState((s) => {
      const excluded = new Set(s.selection.excluded);
      if (excluded.has(id)) excluded.delete(id);
      else excluded.add(id);
      return { ...s, selection: { ...s.selection, excluded } };
    });
  }, []);

  const overrideBuilding = useCallback((id: string, override: BuildingOverride) => {
    setState((s) => {
      const overrides = new Map(s.selection.overrides);
      overrides.set(id, { ...overrides.get(id), ...override });
      return { ...s, selection: { ...s.selection, overrides } };
    });
  }, []);

  // Re-run the engine whenever what is connected changes.
  const { site, selection, place, weather, phase } = state;
  useEffect(() => {
    if (phase !== 'ready' || !site || !place || !weather || !engine.current) return;
    const count = connected(site, selection).length;
    if (count === 0 || count > MAX_BUILDINGS) {
      setState((s) => ({ ...s, result: null, running: false }));
      return;
    }
    const neighbourhood = toNeighbourhood(site, selection, place.zone, place.region);
    setState((s) => ({ ...s, running: true }));
    void engine.current
      .run(neighbourhood, { sources: [] }, weather)
      .then((r) => {
        if (r) setState((s) => ({ ...s, result: r.result, running: false }));
      })
      .catch((error: unknown) => setState((s) => ({ ...s, running: false, message: error instanceof Error ? error.message : String(error) })));
  }, [site, selection, place, weather, phase]);

  return { state, startDrawing, addPoint, undoPoint, finishDrawing, clear, toggleBuilding, overrideBuilding, load };
}

/** The area of the draft so far, m², for the live readout. */
export function draftArea(draft: readonly LonLat[]): number {
  return draft.length >= 3 ? ringArea([...draft, draft[0]!]) : 0;
}
