/**
 * The map: basemap, the drawn boundary, the site's buildings, what was found
 * nearby, and what the player has built — a bore field at its true footprint,
 * everything else as a marker.
 *
 * MapLibre is loaded lazily — it is most of the bundle, and the page is
 * useful (and the scope line readable) before it arrives.
 *
 * Overlays live INSIDE the style, not added after it: a theme change rebuilds
 * the whole style (see style.ts), and overlays added with addLayer would be
 * wiped by setStyle and have to be re-added in the right order every time.
 * Data changes only call setData on the overlay sources.
 *
 * Touch (D14): a tap is a click in MapLibre, so drawing works by tapping
 * vertices; double-tap zoom is switched off while drawing so a quick second
 * tap is a vertex, not a zoom. Finishing is a button in the panel as well as
 * a tap on the first vertex, because a double-tap is not discoverable.
 */
import { useEffect, useRef, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

import { boreFieldArea } from '../engine/design';
import type { Design } from '../engine/design';
import { metresPerDegree } from '../site/geometry';
import type { LonLat, Ring } from '../site/geometry';
import type { Site } from '../site/classify';
import { effective } from '../site/neighbourhood';
import type { Selection } from '../site/neighbourhood';
import { baseStyle } from './style';
import type { MapPalette } from './style';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

const RESIDENTIAL = new Set(['single-family', 'small-multifamily', 'large-multifamily']);

export interface MapViewProps {
  readonly palette: MapPalette;
  readonly drawing: boolean;
  /** An existing boundary reopened: corners draggable, no new corners. */
  readonly editing: boolean;
  readonly draft: readonly LonLat[];
  readonly onMoveVertex: (index: number, p: LonLat) => void;
  readonly boundary: Ring | null;
  readonly site: Site | null;
  readonly selection: Selection;
  readonly selectedId: string | null;
  readonly flyTo: { readonly center: LonLat; readonly zoom: number; readonly key: number } | null;
  readonly onDraftPoint: (p: LonLat) => void;
  readonly onFinishDraft: () => void;
  readonly onSelectBuilding: (id: string | null) => void;
  readonly design: Design;
  /** A source is waiting for a tap to say where it goes. */
  readonly placing: boolean;
  readonly onPlace: (p: LonLat) => void;
}

function draftData(draft: readonly LonLat[], closed: boolean): FeatureCollection {
  if (draft.length === 0) return EMPTY;
  const features: Feature[] = draft.map((p, i) => ({
    type: 'Feature',
    properties: { first: i === 0 && !closed, i },
    geometry: { type: 'Point', coordinates: [p[0], p[1]] },
  }));
  if (draft.length > 1) {
    const line = closed ? [...draft, draft[0]!] : draft;
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.map((p) => [p[0], p[1]]) } });
  }
  return { type: 'FeatureCollection', features };
}

function boundaryData(boundary: Ring | null): FeatureCollection {
  if (!boundary) return EMPTY;
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [boundary.map((p) => [p[0], p[1]])] } }],
  };
}

function buildingData(site: Site | null, selection: Selection, selectedId: string | null): FeatureCollection {
  if (!site) return EMPTY;
  return {
    type: 'FeatureCollection',
    features: site.buildings.map((raw) => {
      const b = effective(raw, selection);
      const state = b.archetype === null ? 'unheated' : selection.excluded.has(b.id) ? 'excluded' : 'connected';
      return {
        type: 'Feature',
        id: b.id,
        properties: {
          id: b.id,
          state,
          sector: b.archetype && RESIDENTIAL.has(b.archetype) ? 'home' : 'work',
          guessed: b.archetypeGuessed,
          selected: b.id === selectedId,
        },
        geometry: { type: 'Polygon', coordinates: [b.footprint.map((p) => [p[0], p[1]])] },
      };
    }),
  };
}

function sourceData(site: Site | null, design: Design): FeatureCollection {
  if (!site) return EMPTY;
  // A connected candidate is drawn once, as part of the design.
  const connected = new Set(design.sources.flatMap((s) => ('origin' in s && s.origin ? [s.origin] : [])));
  return {
    type: 'FeatureCollection',
    features: site.sources
      .filter((s) => s.exchange !== 'in-load' && !connected.has(s.id))
      .map((s) => ({
        type: 'Feature',
        properties: { kind: s.kind, water: s.exchange === 'water', name: s.name ?? '' },
        geometry: { type: 'Point', coordinates: [s.at[0], s.at[1]] },
      })),
  };
}

/** A square of the given area centred on a point, as a polygon ring. */
function squareAround(at: LonLat, areaM2: number): number[][] {
  const m = metresPerDegree(at[1]);
  const half = Math.sqrt(areaM2) / 2;
  const dx = half / m.x;
  const dy = half / m.y;
  return [
    [at[0] - dx, at[1] - dy],
    [at[0] + dx, at[1] - dy],
    [at[0] + dx, at[1] + dy],
    [at[0] - dx, at[1] + dy],
    [at[0] - dx, at[1] - dy],
  ];
}

/** Heat, cooling or both: what the marker's colour means. */
const ROLE = { 'bore-field': 'ground', 'air-source': 'heat', 'cooling-tower': 'cool', 'waste-heat': 'heat', water: 'cool' } as const;
const SHORT = { 'bore-field': 'Bore field', 'air-source': 'Air-source HP', 'cooling-tower': 'Cooling tower', 'waste-heat': 'Waste heat', water: 'Water' } as const;

function designData(design: Design): FeatureCollection {
  const features: Feature[] = [];
  for (const s of design.sources) {
    if (!s.at) continue;
    const name = 'label' in s ? s.label : SHORT[s.kind];
    if (s.kind === 'bore-field') {
      features.push({
        type: 'Feature',
        properties: { role: 'ground', name, field: true },
        geometry: { type: 'Polygon', coordinates: [squareAround(s.at, boreFieldArea(s))] },
      });
    }
    features.push({ type: 'Feature', properties: { role: ROLE[s.kind], name, field: false }, geometry: { type: 'Point', coordinates: [s.at[0], s.at[1]] } });
  }
  return { type: 'FeatureCollection', features };
}

function withOverlays(p: MapPalette): StyleSpecification {
  const base = baseStyle(p);
  return {
    ...base,
    sources: {
      ...base.sources,
      boundary: { type: 'geojson', data: EMPTY },
      buildings: { type: 'geojson', data: EMPTY },
      draft: { type: 'geojson', data: EMPTY },
      sources: { type: 'geojson', data: EMPTY },
      design: { type: 'geojson', data: EMPTY },
    },
    layers: [
      ...base.layers,
      {
        id: 'boundary-fill',
        type: 'fill',
        source: 'boundary',
        paint: { 'fill-color': p.boundary, 'fill-opacity': 0.05 },
      },
      {
        id: 'site-building-fill',
        type: 'fill',
        source: 'buildings',
        paint: {
          'fill-color': ['match', ['get', 'state'], 'connected', ['match', ['get', 'sector'], 'home', p.home, p.work], p.excluded],
          // Guessed buildings are drawn fainter; excluded and unheated, hollow.
          'fill-opacity': ['match', ['get', 'state'], 'connected', ['case', ['get', 'guessed'], 0.45, 0.9], 0.15],
        },
      },
      {
        id: 'site-building-outline',
        type: 'line',
        source: 'buildings',
        paint: {
          'line-color': ['case', ['get', 'selected'], p.ink, ['match', ['get', 'state'], 'connected', ['match', ['get', 'sector'], 'home', p.home, p.work], p.excluded]],
          'line-width': ['case', ['get', 'selected'], 2.5, 1],
        },
      },
      {
        // Dashed outline for guessed buildings: a second line layer, because
        // line-dasharray cannot be data-driven.
        id: 'site-building-guessed',
        type: 'line',
        source: 'buildings',
        filter: ['all', ['get', 'guessed'], ['==', ['get', 'state'], 'connected']],
        paint: { 'line-color': p.ink, 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0.55 },
      },
      {
        id: 'boundary-line',
        type: 'line',
        source: 'boundary',
        paint: { 'line-color': p.boundary, 'line-width': 2.5 },
      },
      {
        id: 'draft-line',
        type: 'line',
        source: 'draft',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': p.boundary, 'line-width': 2, 'line-dasharray': [2, 1.5] },
      },
      {
        id: 'draft-points',
        type: 'circle',
        source: 'draft',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': ['case', ['get', 'first'], 8, 5],
          'circle-color': p.surface,
          'circle-stroke-color': p.boundary,
          'circle-stroke-width': 2.5,
        },
      },
      {
        // A finger-sized target over each corner, for press-and-drag. Never seen.
        id: 'draft-hit',
        type: 'circle',
        source: 'draft',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 18, 'circle-color': p.boundary, 'circle-opacity': 0 },
      },
      {
        id: 'source-points',
        type: 'circle',
        source: 'sources',
        paint: {
          'circle-radius': 9,
          // Waste heat is heat: orange. A water exchanger is water: blue.
          'circle-color': ['case', ['get', 'water'], p.cool, p.heat],
          'circle-stroke-color': p.surface,
          'circle-stroke-width': 2.5,
        },
      },
      {
        id: 'source-labels',
        type: 'symbol',
        source: 'sources',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: { 'text-color': p.ink, 'text-halo-color': p.surface, 'text-halo-width': 1.5 },
      },
      {
        id: 'design-field',
        type: 'fill',
        source: 'design',
        filter: ['==', ['get', 'field'], true],
        paint: { 'fill-color': p.ground, 'fill-opacity': 0.25, 'fill-outline-color': p.ground },
      },
      {
        id: 'design-points',
        type: 'circle',
        source: 'design',
        filter: ['==', ['get', 'field'], false],
        paint: {
          'circle-radius': 7,
          'circle-color': ['match', ['get', 'role'], 'ground', p.ground, 'heat', p.heat, p.cool],
          'circle-stroke-color': p.ink,
          'circle-stroke-width': 2,
        },
      },
      {
        id: 'design-labels',
        type: 'symbol',
        source: 'design',
        filter: ['==', ['get', 'field'], false],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, -1.3],
          'text-anchor': 'bottom',
          'text-optional': true,
        },
        paint: { 'text-color': p.ink, 'text-halo-color': p.surface, 'text-halo-width': 1.5 },
      },
    ],
  };
}

/** Pixels within which a tap on the first vertex closes the boundary. */
const CLOSE_PX = 14;

export function MapView(props: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  // Handlers and data read through a ref, so the map's listeners — attached
  // once — always see the latest props. (Psychrometric Studio: a callback that
  // captured a stale setter wrote to the wrong case.)
  const latest = useRef(props);
  latest.current = props;
  const [failed, setFailed] = useState<string | null>(null);

  const push = () => {
    const m = map.current;
    // Not isStyleLoaded(): that stays false while ANY tile is loading, so a
    // site arriving mid-load was never drawn. setData only needs the source.
    if (!m || !m.getSource('buildings')) return;
    const p = latest.current;
    // While editing, the draft IS the boundary; the old line would double it.
    (m.getSource('boundary') as GeoJSONSource | undefined)?.setData(boundaryData(p.editing ? null : p.boundary));
    (m.getSource('buildings') as GeoJSONSource | undefined)?.setData(buildingData(p.site, p.selection, p.selectedId));
    (m.getSource('draft') as GeoJSONSource | undefined)?.setData(draftData(p.drawing || p.editing ? p.draft : [], p.editing));
    (m.getSource('sources') as GeoJSONSource | undefined)?.setData(sourceData(p.site, p.design));
    (m.getSource('design') as GeoJSONSource | undefined)?.setData(designData(p.design));
  };

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    void (async () => {
      const maplibre = await import('maplibre-gl');
      await import('maplibre-gl/dist/maplibre-gl.css');
      if (cancelled || !container.current) return;
      if (!('WebGL2RenderingContext' in window) && !('WebGLRenderingContext' in window)) {
        setFailed('This browser cannot draw the map (no WebGL).');
        return;
      }
      instance = new maplibre.Map({
        container: container.current,
        style: withOverlays(latest.current.palette),
        center: [-93.2, 44.95],
        zoom: 11,
        attributionControl: { compact: true },
      });
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-left');
      instance.on('style.load', push);
      // Press and hold a corner, then drag it — mouse or finger. The map's own
      // panning is off for the length of the drag, and the click that ends a
      // drag is swallowed so it does not also add a corner.
      let dragging: number | null = null;
      let moved = false;
      let swallowClick = false;
      const grab = (e: { preventDefault: () => void; features?: { properties: Record<string, unknown> }[] }) => {
        const p = latest.current;
        if (!(p.drawing || p.editing)) return;
        const index = Number(e.features?.[0]?.properties['i']);
        if (!Number.isInteger(index)) return;
        e.preventDefault();
        dragging = index;
        moved = false;
        instance!.dragPan.disable();
        instance!.getCanvas().style.cursor = 'grabbing';
      };
      const drag = (e: { lngLat: { lng: number; lat: number } }) => {
        if (dragging === null) return;
        moved = true;
        latest.current.onMoveVertex(dragging, [e.lngLat.lng, e.lngLat.lat]);
      };
      const release = () => {
        if (dragging === null) return;
        dragging = null;
        swallowClick = moved;
        instance!.dragPan.enable();
        instance!.getCanvas().style.cursor = latest.current.drawing ? 'crosshair' : '';
      };
      instance.on('mousedown', 'draft-hit', grab);
      instance.on('touchstart', 'draft-hit', grab);
      instance.on('mousemove', drag);
      instance.on('touchmove', drag);
      instance.on('mouseup', release);
      instance.on('touchend', release);
      instance.on('touchcancel', release);
      instance.on('mouseenter', 'draft-hit', () => {
        if (dragging === null && (latest.current.drawing || latest.current.editing)) instance!.getCanvas().style.cursor = 'grab';
      });
      instance.on('mouseleave', 'draft-hit', () => {
        if (dragging === null) instance!.getCanvas().style.cursor = latest.current.drawing ? 'crosshair' : '';
      });

      instance.on('click', (e) => {
        const p = latest.current;
        if (swallowClick) {
          swallowClick = false;
          return;
        }
        // Editing moves corners only; a click adds nothing and selects nothing.
        if (p.editing) return;
        if (p.drawing) {
          const first = p.draft[0];
          if (first && p.draft.length >= 3) {
            const a = instance!.project([first[0], first[1]]);
            if (Math.hypot(a.x - e.point.x, a.y - e.point.y) <= CLOSE_PX) {
              p.onFinishDraft();
              return;
            }
          }
          p.onDraftPoint([e.lngLat.lng, e.lngLat.lat]);
          return;
        }
        if (p.placing) {
          p.onPlace([e.lngLat.lng, e.lngLat.lat]);
          return;
        }
        const hit = instance!.queryRenderedFeatures(e.point, { layers: ['site-building-fill'] })[0];
        p.onSelectBuilding(hit ? String(hit.properties['id']) : null);
      });
      instance.on('dblclick', (e) => {
        if (latest.current.drawing) {
          e.preventDefault();
          latest.current.onFinishDraft();
        }
      });
      map.current = instance;
      // The phone shows the map as a tab of its own; MapLibre only tracks
      // WINDOW resizes, so a pane going from hidden to shown needs telling.
      if (typeof ResizeObserver !== 'undefined' && container.current) {
        const observer = new ResizeObserver(() => instance?.resize());
        observer.observe(container.current);
        instance.once('remove', () => observer.disconnect());
      }
      // A place picked while MapLibre was still loading: its fly-to fired
      // against no map and was lost, leaving the player looking at the whole
      // metro. Land there now instead.
      const pending = latest.current.flyTo;
      if (pending) instance.jumpTo({ center: [pending.center[0], pending.center[1]], zoom: pending.zoom });
      // Development only: lets a browser test ask the map what it holds.
      if (import.meta.env.DEV) (window as unknown as { __map?: MapLibreMap }).__map = instance;
    })().catch((error: unknown) => {
      if (!cancelled) setFailed(`The map could not start: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => {
      cancelled = true;
      instance?.remove();
      map.current = null;
    };
  }, []);

  // Theme: rebuild the style, overlays included. diff: false forces a full
  // reload, which fires 'style.load' and so re-pushes the overlay data; a
  // diffed setStyle fires no such event and left every overlay empty.
  const firstPalette = useRef(true);
  useEffect(() => {
    if (firstPalette.current) {
      firstPalette.current = false;
      return;
    }
    map.current?.setStyle(withOverlays(props.palette), { diff: false });
  }, [props.palette]);

  useEffect(push, [props.boundary, props.site, props.selection, props.selectedId, props.draft, props.drawing, props.editing, props.design]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (props.drawing || props.editing) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
    m.getCanvas().style.cursor = props.drawing || props.placing ? 'crosshair' : '';
  }, [props.drawing, props.editing, props.placing]);

  useEffect(() => {
    if (props.flyTo) map.current?.flyTo({ center: [props.flyTo.center[0], props.flyTo.center[1]], zoom: props.flyTo.zoom });
  }, [props.flyTo]);

  return (
    <div ref={container} className="map" role="region" aria-label="Map">
      {failed && <p className="map__failed">{failed}</p>}
    </div>
  );
}
