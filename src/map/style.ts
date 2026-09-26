/**
 * The basemap style, built from the suite's tokens (D13).
 *
 * MapLibre paints a canvas from a style object and cannot read CSS custom
 * properties, so the colours are READ from the document and baked into the
 * style — and the style is rebuilt when the resolved theme changes. Rebuilt
 * from `theme.resolved`, never `theme.preference`: with no stored choice the
 * preference is null, and a basemap keyed on it would stay light under a dark
 * system theme (CLAUDE.md, "The map").
 *
 * OpenFreeMap serves the OpenMapTiles schema. This style draws only what a
 * neighbourhood needs underneath it — land, parks, water, roads, the base
 * buildings in a muted fill, and place and road names — so the site's own
 * buildings on top are the loudest thing on the map.
 */
import type { StyleSpecification } from 'maplibre-gl';

export const TILES = 'https://tiles.openfreemap.org/planet';
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export interface MapPalette {
  readonly land: string;
  readonly park: string;
  readonly water: string;
  readonly road: string;
  readonly roadMajor: string;
  readonly roadCasing: string;
  readonly building: string;
  readonly label: string;
  readonly labelHalo: string;
  readonly boundary: string;
  readonly home: string;
  readonly work: string;
  readonly excluded: string;
  readonly heat: string;
  readonly cool: string;
  readonly ink: string;
  readonly surface: string;
}

const TOKENS: Record<keyof MapPalette, string> = {
  land: '--map-land',
  park: '--map-park',
  water: '--map-water',
  road: '--map-road',
  roadMajor: '--map-road-major',
  roadCasing: '--map-road-casing',
  building: '--map-building',
  label: '--map-label',
  labelHalo: '--map-label-halo',
  boundary: '--site-boundary',
  home: '--site-home',
  work: '--site-work',
  excluded: '--site-excluded',
  heat: '--heat',
  cool: '--cool',
  ink: '--ink',
  surface: '--surface',
};

/** Read the palette from an element's computed style (the document, normally). */
export function readPalette(element: Element = document.documentElement): MapPalette {
  const style = getComputedStyle(element);
  const out = {} as Record<keyof MapPalette, string>;
  for (const [key, token] of Object.entries(TOKENS) as [keyof MapPalette, string][]) {
    out[key] = style.getPropertyValue(token).trim() || '#888888';
  }
  return out;
}

export function baseStyle(p: MapPalette): StyleSpecification {
  const minorRoads = ['minor', 'service', 'track'];
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      openmaptiles: { type: 'vector', url: TILES, attribution: MAP_ATTRIBUTION },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': p.land } },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': p.park },
      },
      {
        id: 'landcover-grass',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood']]],
        paint: { 'fill-color': p.park, 'fill-opacity': 0.7 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': p.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: { 'line-color': p.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 4] },
      },
      {
        id: 'road-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['!', ['in', ['get', 'class'], ['literal', ['rail', 'transit', 'path']]]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.roadCasing,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 9, 19, 26],
        },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', minorRoads]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 6, 19, 20] },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.roadMajor, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 8, 19, 24] },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': p.label, 'line-width': 1, 'line-dasharray': [3, 3], 'line-opacity': 0.6 },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        paint: { 'fill-color': p.building, 'fill-outline-color': p.roadCasing },
      },
      {
        id: 'road-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: { 'text-color': p.label, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.5 },
      },
      {
        id: 'place-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 14],
        },
        paint: { 'text-color': p.label, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.5 },
      },
    ],
  };
}
