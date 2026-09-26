import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { calibrationWeather } from '../scripts/calibrate/weatherFixture';
import { suggestDesign, toNetworkDesign } from '../src/engine/design';
import { runScenario } from '../src/engine/scenario';
import { MIGRATIONS, openProject, PROJECT_FORMAT, PROJECT_VERSION, projectFilename, projectJson } from '../src/io/project';
import type { Project } from '../src/io/project';
import { siteForCounty } from '../src/relay/relay';
import type { WeatherPayload } from '../src/relay/relay';
import { boreholeRoom, classifySite } from '../src/site/classify';
import { centroid } from '../src/site/geometry';
import { EMPTY_SELECTION, toNeighbourhood } from '../src/site/neighbourhood';
import type { SiteData } from '../src/site/osm';

const raw = (JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/sites/mankato-downtown.json'), 'utf8')) as { data: SiteData }).data;
const place = siteForCounty('27013')!;
const w = calibrationWeather(place.zone);
const weather: WeatherPayload = {
  year: 2018,
  timezone: 'America/Chicago',
  temperature: Array.from(w.temperature),
  relativeHumidity: Array.from(w.relativeHumidity!),
  ghi: Array.from(w.ghi),
  firstWeekday: w.firstWeekday,
  attribution: 'test',
};
const site = classifySite(raw);
const firstBuilding = site.buildings[0]!.id;
const asIs = runScenario(toNeighbourhood(site, EMPTY_SELECTION, place.zone, place.region), { sources: [] }, w);
const design = suggestDesign({
  peakHeatingW: asIs.site.peakHeatingW,
  peakCoolingW: asIs.site.peakCoolingW,
  sources: site.sources,
  centre: centroid(site.boundary),
  boreholeRoom: boreholeRoom(site.openSpaceM2),
});

const project: Project = {
  saved: '2026-09-26T12:00:00.000Z',
  boundary: raw.boundary,
  selection: { excluded: new Set([firstBuilding]), overrides: new Map([[site.buildings[1]!.id, { archetype: 'office-small' as never, levels: 3 }]]) },
  design: { ...design, band: { min: 2, max: 30 }, retrofit: 0.8 },
  challenge: 'easy-on-the-grid',
  placeEdits: { neighbourhood: 'Old Town', town: 'Mankato', state: 'MN' },
  units: 'si',
  snapshot: { place, buildings: raw, weather },
};

const reopen = (p: Project) => {
  const r = openProject(projectJson(p));
  if (!r.ok) throw new Error(r.reason);
  return r.project;
};

describe('the project file', () => {
  it('round-trips everything the player made', () => {
    const back = reopen(project);
    expect(back.boundary).toEqual(project.boundary.map(([a, b]) => [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6]));
    expect([...back.selection.excluded]).toEqual([firstBuilding]);
    expect(back.selection.overrides.get(site.buildings[1]!.id)).toEqual({ archetype: 'office-small', levels: 3 });
    expect(back.design.band).toEqual({ min: 2, max: 30 });
    expect(back.design.retrofit).toBe(0.8);
    expect(back.design.sources.map((s) => s.id)).toEqual(project.design.sources.map((s) => s.id));
    expect(back.challenge).toBe('easy-on-the-grid');
    expect(back.placeEdits).toEqual(project.placeEdits);
    expect(back.units).toBe('si');
    expect(back.saved).toBe(project.saved);
  });

  it('opens to the same answer, to the watt, with no network call', () => {
    const run = (p: Project) => {
      const s = classifySite({ ...p.snapshot.buildings, boundary: p.boundary });
      const wy = { temperature: Float64Array.from(p.snapshot.weather.temperature), ghi: Float64Array.from(p.snapshot.weather.ghi), relativeHumidity: Float64Array.from(p.snapshot.weather.relativeHumidity), firstWeekday: p.snapshot.weather.firstWeekday };
      return runScenario(toNeighbourhood(s, p.selection, p.snapshot.place.zone, p.snapshot.place.region), toNetworkDesign(p.design, wy), wy);
    };
    const before = run(project);
    const after = run(reopen(project));
    expect(after.score).toEqual(before.score);
    expect(after.network.totalSiteKWh).toBeCloseTo(before.network.totalSiteKWh, 3);
    expect(after.grid.network.winterW).toBeCloseTo(before.grid.network.winterW, 3);
  });

  it('refuses what is not ours, what is newer, and what is damaged — never half-read', () => {
    expect(openProject('not json')).toEqual({ ok: false, reason: 'format' });
    expect(openProject(JSON.stringify({ format: 'psychrometric-studio', version: 1 }))).toEqual({ ok: false, reason: 'format' });
    const body = JSON.parse(projectJson(project)) as Record<string, unknown>;
    expect(openProject(JSON.stringify({ ...body, version: PROJECT_VERSION + 1 }))).toEqual({ ok: false, reason: 'newer' });
    expect(openProject(JSON.stringify({ ...body, boundary: [[0, 0]] }))).toEqual({ ok: false, reason: 'malformed' });
    const weatherShort = { ...(body.snapshot as object), weather: { ...weather, temperature: weather.temperature.slice(0, 100) } };
    expect(openProject(JSON.stringify({ ...body, snapshot: weatherShort }))).toEqual({ ok: false, reason: 'malformed' });
    const badSource = { ...(body.design as object), sources: [{ id: 'x', kind: 'volcano', capacityW: 1 }] };
    expect(openProject(JSON.stringify({ ...body, design: badSource }))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('upgrades an older version through MIGRATIONS, one step at a time', () => {
    const body = JSON.parse(projectJson(project)) as Record<string, unknown>;
    // No migrations yet: an older version with no step is refused, not guessed at.
    expect(openProject(JSON.stringify({ ...body, version: 0 }))).toEqual({ ok: false, reason: 'malformed' });
    MIGRATIONS[0] = (o) => ({ ...o, version: 1, challenge: 'half-carbon' });
    try {
      const r = openProject(JSON.stringify({ ...body, version: 0 }));
      expect(r.ok && r.project.challenge).toBe('half-carbon');
    } finally {
      delete MIGRATIONS[0];
    }
  });

  it('names the file from the place', () => {
    expect(projectFilename(['Highland Park', 'St. Paul', 'MN'])).toBe('highland-park-st-paul-mn.thermal-network.json');
    expect(projectFilename([null, undefined, ''])).toBe('neighbourhood.thermal-network.json');
  });
});

describe('the schema', () => {
  const schema = JSON.parse(readFileSync(resolve(import.meta.dirname, '../schema/project.schema.json'), 'utf8')) as {
    required: string[];
    properties: Record<string, { const?: unknown }>;
  };
  const body = JSON.parse(projectJson(project)) as Record<string, unknown>;

  it('names exactly the fields the writer writes, with the same format and version', () => {
    expect(Object.keys(body).sort()).toEqual([...schema.required].sort());
    expect(Object.keys(schema.properties).sort()).toEqual([...schema.required].sort());
    expect(schema.properties.format!.const).toBe(PROJECT_FORMAT);
    expect(schema.properties.version!.const).toBe(PROJECT_VERSION);
  });
});
