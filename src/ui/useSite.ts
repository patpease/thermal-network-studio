/**
 * The site's state, from a drawn boundary to the engine's first answer.
 *
 *   draw → boundary → (site, weather, buildings in parallel) → classify →
 *   neighbourhood → engine (the design; with none yet, business as usual and
 *   the site metrics) → ready
 *
 * The design lives here too, beside the site it was made for: a new boundary
 * starts a new, empty design, because sources placed for one neighbourhood
 * mean nothing in another.
 *
 * Every step can fail on its own and says so in plain words; a failure never
 * leaves a stale site on the map. A newer boundary supersedes an older one
 * still loading — its answers are dropped when they arrive.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { createEngine } from '../engine/client';
import { EMPTY_DESIGN, suggestDesign } from '../engine/design';
import type { Design } from '../engine/design';
import type { EngineClient } from '../engine/client';
import type { ScenarioResult } from '../engine/scenario';
import type { WeatherYear } from '../loads/model';
import type { SitePayload, WeatherPayload } from '../relay/relay';
import { boreholeRoom, classifySite, MAX_BUILDINGS } from '../site/classify';
import { fetchWastewater } from '../site/wastewater';
import { touchesNyc } from '../site/steam';
import type { SteamData } from '../site/steam';
import type { Site } from '../site/classify';
import { bbox, centroid, ringArea } from '../site/geometry';
import type { LonLat, Ring } from '../site/geometry';
import { connected, EMPTY_SELECTION, toNeighbourhood } from '../site/neighbourhood';
import type { BuildingOverride, Selection } from '../site/neighbourhood';
import { boundaryProblem, SOURCE_SEARCH_M } from '../site/osm';
import type { SiteData } from '../site/osm';
import type { Project } from '../io/project';

export type Phase = 'idle' | 'drawing' | 'editing' | 'loading' | 'ready' | 'error';

export interface PlaceEdits {
  readonly neighbourhood?: string;
  readonly town?: string;
  readonly state?: string;
}

export interface SiteState {
  readonly phase: Phase;
  readonly draft: readonly LonLat[];
  readonly boundary: Ring | null;
  readonly place: SitePayload | null;
  readonly site: Site | null;
  readonly weather: (WeatherYear & { attribution: string; year: number }) | null;
  readonly selection: Selection;
  readonly design: Design;
  /** The source waiting for a tap on the map to say where it goes. */
  readonly placing: string | null;
  readonly result: ScenarioResult | null;
  readonly running: boolean;
  /** The challenge being played, or null for the sandbox. Survives a redraw. */
  readonly challengeId: string | null;
  /** Place names as the player corrected them for the award. */
  readonly placeEdits: PlaceEdits;
  readonly message: string | null;
  /** What the relay returned, kept as it came, for a project file (phase 11). */
  readonly snapshot: { readonly place: SitePayload; readonly buildings: SiteData; readonly weather: WeatherPayload } | null;
  /** When the open project was saved, if it came from a file and has not been re-read. */
  readonly openedFrom: string | null;
}

const INITIAL: SiteState = {
  phase: 'idle',
  draft: [],
  boundary: null,
  place: null,
  site: null,
  weather: null,
  selection: EMPTY_SELECTION,
  design: EMPTY_DESIGN,
  placing: null,
  result: null,
  running: false,
  message: null,
  challengeId: null,
  placeEdits: {},
  snapshot: null,
  openedFrom: null,
};

type Init = { selection: Selection; design: Design; placeEdits?: PlaceEdits };

function weatherYear(weather: WeatherPayload): NonNullable<SiteState['weather']> {
  return {
    temperature: Float64Array.from(weather.temperature),
    ghi: Float64Array.from(weather.ghi),
    relativeHumidity: Float64Array.from(weather.relativeHumidity),
    firstWeekday: weather.firstWeekday,
    attribution: weather.attribution,
    year: weather.year,
  };
}

/**
 * District steam from the relay, for a site in New York City: undefined
 * elsewhere (no request), null if the relay could not read it. Never throws.
 */
async function fetchSteam(boundary: Ring): Promise<SteamData | null | undefined> {
  const box = bbox(boundary);
  if (!touchesNyc(box)) return undefined;
  try {
    const [w, s, e, n] = box.map((x) => x.toFixed(6));
    const r = await fetch(`/api/steam?w=${w}&s=${s}&e=${e}&n=${n}`);
    if (!r.ok) return null;
    return ((await r.json()) as { steam: SteamData | null }).steam;
  } catch {
    return null;
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `The request failed (${response.status}).`);
  return body;
}

/** Quiet time before a changed design is run. */
const RUN_DELAY_MS = 250;

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

  // The challenge is the player's goal, not the site's: it survives a redraw.
  const startDrawing = useCallback(() => {
    generation.current++;
    setState((s) => ({ ...INITIAL, phase: 'drawing', challengeId: s.challengeId }));
  }, []);

  const addPoint = useCallback((p: LonLat) => {
    setState((s) => (s.phase === 'drawing' ? { ...s, draft: [...s.draft, p] } : s));
  }, []);

  const undoPoint = useCallback(() => {
    setState((s) => (s.phase === 'drawing' ? { ...s, draft: s.draft.slice(0, -1) } : s));
  }, []);

  const clear = useCallback(() => {
    generation.current++;
    setState((s) => ({ ...INITIAL, challengeId: s.challengeId }));
  }, []);

  /**
   * Read a boundary's site, weather and buildings. `init` is what a share
   * link carries — the player's building changes and design — applied once
   * the buildings they refer to have arrived.
   */
  // The last load asked for, so a failed one can be tried again as it was —
  // with the design and building changes an edit carried.
  const lastLoad = useRef<{ boundary: Ring; init?: Init } | null>(null);

  const load = useCallback(async (boundary: Ring, init?: Init) => {
    lastLoad.current = init ? { boundary, init } : { boundary };
    const mine = ++generation.current;
    const stillMine = () => mine === generation.current;
    setState((s) => ({ ...INITIAL, phase: 'loading', boundary, challengeId: s.challengeId }));

    const [lon, lat] = centroid(boundary);
    try {
      const [place, weather, buildings, wastewater, steam] = await Promise.all([
        getJson<SitePayload>(`/api/site?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`),
        getJson<WeatherPayload>(`/api/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`),
        getJson<{ site: SiteData }>('/api/buildings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boundary }),
        }),
        // This site's own static files; null (never an error) if unread.
        fetchWastewater(boundary, SOURCE_SEARCH_M),
        // New York City only; elsewhere no request is made.
        fetchSteam(boundary),
      ]);
      if (!stillMine()) return;
      const data: SiteData = { ...buildings.site, wastewater, ...(steam !== undefined ? { steam } : {}) };
      const site = classifySite({ ...data, boundary });
      setState((s) => ({
        ...s,
        phase: 'ready',
        place,
        site,
        weather: weatherYear(weather),
        selection: init?.selection ?? EMPTY_SELECTION,
        design: init?.design ?? EMPTY_DESIGN,
        placeEdits: init?.placeEdits ?? {},
        snapshot: { place, buildings: data, weather },
      }));
    } catch (error) {
      if (!stillMine()) return;
      setState((s) => ({ ...s, phase: 'error', message: error instanceof Error ? error.message : String(error) }));
    }
  }, []);

  /** Move one corner of the boundary being drawn or edited. */
  const moveVertex = useCallback((index: number, p: LonLat) => {
    setState((s) =>
      (s.phase === 'drawing' || s.phase === 'editing') && index >= 0 && index < s.draft.length
        ? { ...s, draft: s.draft.map((q, i) => (i === index ? p : q)) }
        : s,
    );
  }, []);

  // The state before an edit began, for Cancel. A ref, not state: it is
  // never drawn, and a cancelled edit must restore it exactly.
  const beforeEdit = useRef<SiteState | null>(null);

  /** Reopen the drawn boundary with its corners draggable. */
  const startEditing = useCallback(() => {
    const s = current.current;
    if (!s.boundary || (s.phase !== 'ready' && s.phase !== 'error')) return;
    beforeEdit.current = s;
    generation.current++;
    setState({ ...s, phase: 'editing', draft: s.boundary.slice(0, -1), placing: null, message: null });
  }, []);

  const cancelEditing = useCallback(() => {
    const before = beforeEdit.current;
    beforeEdit.current = null;
    if (before) setState(before);
  }, []);

  /**
   * Re-read the site inside the edited boundary. The player's building
   * changes and design carry over; buildings no longer inside simply drop
   * out of the selection's reach.
   */
  const finishEditing = useCallback(() => {
    const s = current.current;
    if (s.phase !== 'editing') return;
    const ring: Ring = [...s.draft, s.draft[0]!];
    const why = boundaryProblem(ring);
    if (why) {
      setState({ ...s, message: why });
      return;
    }
    beforeEdit.current = null;
    void load(ring, { selection: s.selection, design: s.design });
  }, [load]);

  /**
   * Open a project file: the saved snapshot, re-classified, with no network
   * call. The challenge comes from the file, not from what was open.
   */
  const open = useCallback((p: Project, options: { tour?: boolean } = {}) => {
    generation.current++;
    beforeEdit.current = null;
    const init: Init = { selection: p.selection, design: p.design, placeEdits: p.placeEdits };
    lastLoad.current = { boundary: p.boundary, init };
    const { place, buildings, weather } = p.snapshot;
    setState({
      ...INITIAL,
      phase: 'ready',
      boundary: p.boundary,
      place,
      site: classifySite({ ...buildings, boundary: p.boundary }),
      weather: weatherYear(weather),
      selection: p.selection,
      design: p.design,
      challengeId: p.challenge,
      placeEdits: p.placeEdits,
      snapshot: p.snapshot,
      openedFrom: options.tour ? null : p.saved,
    });
  }, []);

  /** The tour: a step's design and challenge, in one write. */
  const setTourStep = useCallback((design: Design, challengeId: string | null) => {
    setState((s) => ({ ...s, design, challengeId, placing: null }));
  }, []);

  /**
   * Put back a state saved earlier (the player's own work, when the tour
   * ends). Supersedes anything still loading, as a new boundary would.
   */
  const restore = useCallback((saved: SiteState) => {
    generation.current++;
    beforeEdit.current = null;
    setState({ ...saved, running: false });
  }, []);

  /** Re-read OpenStreetMap and the weather for the same boundary, keeping the player's work. */
  const reread = useCallback(() => {
    const s = current.current;
    if (!s.boundary) return;
    void load(s.boundary, { selection: s.selection, design: s.design, placeEdits: s.placeEdits });
  }, [load]);

  /** Try the last load again, after a service failure. */
  const retry = useCallback(() => {
    const last = lastLoad.current;
    if (last) void load(last.boundary, last.init);
  }, [load]);

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

  const setChallenge = useCallback((challengeId: string | null) => {
    setState((s) => ({ ...s, challengeId }));
  }, []);

  const editPlace = useCallback((edits: PlaceEdits) => {
    setState((s) => ({ ...s, placeEdits: { ...s.placeEdits, ...edits } }));
  }, []);

  const updateDesign = useCallback((update: (d: Design) => Design) => {
    setState((s) => ({ ...s, design: update(s.design) }));
  }, []);

  /** Wait for a tap on the map to place this source; null stops waiting. */
  const startPlacing = useCallback((id: string | null) => {
    setState((s) => ({ ...s, placing: id }));
  }, []);

  const placeAt = useCallback((p: LonLat) => {
    setState((s) =>
      s.placing ? { ...s, placing: null, design: { ...s.design, sources: s.design.sources.map((x) => (x.id === s.placing ? { ...x, at: p } : x)) } } : s,
    );
  }, []);

  /** Replace the design with a first suggestion sized from the site's peaks. */
  const suggest = useCallback(() => {
    setState((s) => {
      if (!s.site || !s.result) return s;
      const design = suggestDesign({
        peakHeatingW: s.result.site.peakHeatingW,
        peakCoolingW: s.result.site.peakCoolingW,
        sources: s.site.sources,
        centre: centroid(s.site.boundary),
        boreholeRoom: boreholeRoom(s.site.openSpaceM2),
      });
      // Keep the player's loop band and retrofit: a suggestion is sources only.
      return { ...s, placing: null, design: { ...design, band: s.design.band, retrofit: s.design.retrofit } };
    });
  }, []);

  // Re-run the engine whenever what is connected, or the design, changes —
  // after a short pause, so typing a capacity runs the year once, not per key.
  const { site, selection, place, weather, phase, design } = state;
  useEffect(() => {
    if (phase !== 'ready' || !site || !place || !weather || !engine.current) return;
    const count = connected(site, selection).length;
    if (count === 0 || count > MAX_BUILDINGS) {
      setState((s) => ({ ...s, result: null, running: false }));
      return;
    }
    const neighbourhood = toNeighbourhood(site, selection, place.zone, place.region);
    setState((s) => ({ ...s, running: true }));
    const timer = setTimeout(() => {
      void engine.current
        ?.run(neighbourhood, design, weather)
        .then((r) => {
          if (r) setState((s) => ({ ...s, result: r.result, running: false }));
        })
        .catch((error: unknown) => setState((s) => ({ ...s, running: false, message: error instanceof Error ? error.message : String(error) })));
    }, RUN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [site, selection, place, weather, phase, design]);

  return {
    state,
    startDrawing,
    retry,
    startEditing,
    finishEditing,
    cancelEditing,
    moveVertex,
    addPoint,
    undoPoint,
    finishDrawing,
    clear,
    toggleBuilding,
    overrideBuilding,
    load,
    open,
    reread,
    setTourStep,
    restore,
    updateDesign,
    startPlacing,
    placeAt,
    suggest,
    setChallenge,
    editPlace,
  };
}

/** The area of the draft so far, m², for the live readout. */
export function draftArea(draft: readonly LonLat[]): number {
  return draft.length >= 3 ? ringArea([...draft, draft[0]!]) : 0;
}
