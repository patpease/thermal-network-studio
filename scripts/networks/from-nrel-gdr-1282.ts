/**
 * ONE-OFF: NREL Geothermal Data Repository submission 1282 → the shared CSV.
 *
 *   node scripts/networks/from-nrel-gdr-1282.ts
 *
 * Kept as the record of how data/networks/nrel-gdr-1282.csv was made, not as
 * a pipeline to re-run: the submission is not expected to be maintained, and
 * the next source will arrive in its own shape. It writes the CSV; then
 * `npm run import:networks` validates it with every other source.
 *
 * Read from the two workbooks:
 *   - "Curr TENs" (GHP workbook): current geothermal heat pump networks,
 *     each with a point.
 *   - "US GDH data" (direct-use workbook): geothermal district heating
 *     systems. Closed ones are dropped. A system with no point is placed at
 *     its town by the Open-Meteo geocoder and marked placement=town.
 * Not read: the prospective projects sheet, and every other sheet.
 *
 * Every point's state is checked with the Census geocoder. A label that
 * disagrees is kept as published and recorded in `note` — never corrected.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toCsv } from '../lib/csv.ts';
import { readSheet } from '../lib/xlsx.ts';
import { COLUMNS } from './lib.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../data/networks/nrel-gdr-1282.csv');
const BASE = 'https://gdr.openei.org/files/1282/';
const GHP = 'GHP-based District Heating and Cooling Map Data - Figure 36 (1).xlsx';
const DIRECT = 'US Geothermal District Heating data FINAL.xlsx';
const AGENT = { 'User-Agent': 'thermal-network-studio data import (github.com/patpease)' };

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

async function workbook(name: string): Promise<Uint8Array> {
  const response = await fetch(BASE + encodeURIComponent(name).replace(/%20/g, '%20'), { headers: AGENT });
  if (!response.ok) throw new Error(`${response.status} for ${name}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Header name → column index; the first column wins when a name repeats. */
function columns(header: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => {
    const k = h.trim();
    if (k && !m.has(k)) m.set(k, i);
  });
  return m;
}

async function stateAt(lat: number, lon: number): Promise<string | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=States&format=json`;
  const r = await fetch(url, { headers: AGENT });
  if (!r.ok) return null;
  const j = (await r.json()) as { result?: { geographies?: { States?: { STUSAB?: string }[] } } };
  return j.result?.geographies?.States?.[0]?.STUSAB ?? null;
}

async function town(name: string, state: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&countryCode=US`, { headers: AGENT });
  if (!r.ok) return null;
  const j = (await r.json()) as { results?: { name: string; latitude: number; longitude: number; admin1?: string }[] };
  const hit = (j.results ?? []).find((x) => x.admin1 === STATE_NAMES[state]);
  return hit ? { lat: hit.latitude, lon: hit.longitude, label: `${hit.name}, ${state}` } : null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

const firstUrl = (s: string) => /https?:\/\/[^\s;,]+/.exec(s)?.[0] ?? '';

type Row = Record<(typeof COLUMNS)[number], string | number | null>;
const rows: Row[] = [];
const dropped: string[] = [];

// ---- current geothermal heat pump networks
{
  const sheet = readSheet(await workbook(GHP), 'Curr TENs');
  const col = columns(sheet[0]!);
  for (const r of sheet.slice(1)) {
    const name = (r[col.get('PROJECT_NAME')!] ?? '').trim();
    if (!name) continue;
    const lat = Number(r[col.get('LAT')!]);
    const lon = Number(r[col.get('LONG')!]);
    const state = (r[col.get('ST_ABBR')!] ?? '').trim();
    rows.push({
      id: `ghp-${slug(name)}`,
      name,
      kind: 'geothermal-network',
      state,
      latitude: lat,
      longitude: lon,
      placement: 'site',
      year_opened: null,
      capacity_mwt: null,
      link: firstUrl(r[col.get('NOTES')!] ?? ''),
      note: null,
    });
  }
}

// ---- direct-use geothermal district heating (the header is the SECOND row)
{
  const sheet = readSheet(await workbook(DIRECT), 'US GDH data');
  const col = columns(sheet[1]!);
  const get = (r: readonly string[], k: string) => (r[col.get(k)!] ?? '').trim();
  for (const r of sheet.slice(2)) {
    const name = get(r, 'Site').replace(/\*$/, '').trim();
    if (!name) continue;
    const state = get(r, 'State');
    const closed = get(r, 'Year Closed') !== '' || get(r, 'Status of Project').toLowerCase() === 'closed';
    if (closed) {
      dropped.push(`${name} (${state}): closed`);
      continue;
    }
    let lat = Number(get(r, 'Latitude'));
    let lon = Number(get(r, 'Longitude'));
    let placement: 'site' | 'town' = 'site';
    let note: string | null = null;
    if (!get(r, 'Latitude') || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      // A town, then a place named in brackets ("… (Alturas)").
      const location = get(r, 'General Location').replace(/\(.*?\)/g, '').split(',')[0]!.trim();
      const bracket = /\(([^)]+)\)/.exec(get(r, 'Site'))?.[1] ?? '';
      let found = null;
      for (const candidate of [location, bracket].filter((x) => x && !/county/i.test(x))) {
        found = await town(candidate, state);
        if (found) break;
      }
      if (!found) {
        dropped.push(`${name} (${state}): no point, and the town was not found`);
        continue;
      }
      lat = found.lat;
      lon = found.lon;
      placement = 'town';
      note = `No point published; placed at ${found.label}.`;
    }
    const year = Number(get(r, 'Year Opened'));
    const capacity = Number(get(r, 'Capacity (MWt)'));
    rows.push({
      id: `du-${slug(name)}`,
      name,
      kind: 'geothermal-district-heating',
      state,
      latitude: lat,
      longitude: lon,
      placement,
      year_opened: Number.isInteger(year) && year > 1800 ? year : null,
      capacity_mwt: capacity > 0 ? Math.round(capacity * 100) / 100 : null,
      link: '',
      note,
    });
  }
}

// ---- every label against its point
for (const r of rows) {
  const at = await stateAt(Number(r.latitude), Number(r.longitude));
  if (at && r.state && at !== r.state) {
    const n = `Labelled ${r.state}; the point is in ${at}.`;
    r.note = r.note ? `${r.note} ${n}` : n;
  }
}

writeFileSync(out, toCsv(COLUMNS, rows));
console.log(`wrote ${rows.length} rows to data/networks/nrel-gdr-1282.csv`);
for (const d of dropped) console.log(`dropped: ${d}`);
for (const r of rows.filter((x) => x.note)) console.log(`note: ${r.name}: ${r.note}`);
