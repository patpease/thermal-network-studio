/**
 * EPA Clean Watersheds Needs Survey 2022 → wastewater treatment plants, the
 * pure half of `npm run import:cwns` (tested by tests/cwns.test.ts).
 *
 * Kept: facilities with a Treatment Plant facility type, a Point location
 * (not a city, county or watershed centroid), and a current design flow.
 * Dropped, and counted: plants whose change type is New (not built: the
 * no-prospective-projects rule, D47) or Abandonment.
 *
 * The flow is DESIGN flow, million gallons a day: CWNS publishes design
 * flows; measured flows go to EPA through discharge monitoring reports, not
 * this survey. Total Flow is used when given, else municipal + industrial +
 * infiltration.
 */

export interface CwnsPlant {
  /** CWNS_ID. */
  readonly id: string;
  readonly name: string;
  readonly city: string | null;
  readonly state: string;
  readonly lat: number;
  readonly lon: number;
  /** Current design flow, million gallons a day. */
  readonly designMgd: number;
  /** "Secondary", "Advanced Treatment II" …, or null. */
  readonly treatment: string | null;
}

export interface CwnsTables {
  readonly facilities: readonly Record<string, string>[];
  readonly facilityTypes: readonly Record<string, string>[];
  readonly locations: readonly Record<string, string>[];
  readonly flow: readonly Record<string, string>[];
  readonly effluent: readonly Record<string, string>[];
}

export interface Selected {
  readonly plants: CwnsPlant[];
  readonly dropped: { readonly notBuilt: number; readonly noPoint: number; readonly noFlow: number };
}

const num = (s: string | undefined) => {
  const v = Number.parseFloat(s ?? '');
  return Number.isFinite(v) ? v : null;
};

export function selectPlants(t: CwnsTables): Selected {
  const facility = new Map(t.facilities.map((r) => [r['CWNS_ID']!, r]));
  const location = new Map(t.locations.map((r) => [r['CWNS_ID']!, r]));
  const effluent = new Map(t.effluent.map((r) => [r['CWNS_ID']!, r]));
  const flows = new Map<string, Map<string, string>>();
  for (const r of t.flow) {
    const id = r['CWNS_ID']!;
    if (!flows.has(id)) flows.set(id, new Map());
    flows.get(id)!.set(r['FLOW_TYPE']!, r['CURRENT_DESIGN_FLOW'] ?? '');
  }
  const changes = new Map<string, string[]>();
  for (const r of t.facilityTypes) {
    if (r['FACILITY_TYPE'] !== 'Treatment Plant') continue;
    const id = r['CWNS_ID']!;
    changes.set(id, [...(changes.get(id) ?? []), r['CHANGE_TYPE'] ?? '']);
  }

  const plants: CwnsPlant[] = [];
  const dropped = { notBuilt: 0, noPoint: 0, noFlow: 0 };
  for (const [id, change] of changes) {
    if (change.some((c) => c === 'New' || c === 'Abandonment')) {
      dropped.notBuilt++;
      continue;
    }
    const loc = location.get(id);
    const lat = num(loc?.['LATITUDE']);
    const lon = num(loc?.['LONGITUDE']);
    if (!loc || loc['LOCATION_TYPE'] !== 'Point' || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      dropped.noPoint++;
      continue;
    }
    const f = flows.get(id);
    const total = num(f?.get('Total Flow'));
    const parts = ['Municipal Flow', 'Industrial Flow', 'Infiltration Flow'].map((k) => num(f?.get(k)) ?? 0).reduce((a, b) => a + b, 0);
    const designMgd = total ?? parts;
    if (!(designMgd > 0)) {
      dropped.noFlow++;
      continue;
    }
    const fac = facility.get(id);
    plants.push({
      id,
      name: (fac?.['FACILITY_NAME'] ?? '').trim() || `CWNS ${id}`,
      city: (loc['CITY'] ?? '').trim() || null,
      state: (loc['STATE_CODE'] ?? fac?.['STATE_CODE'] ?? '').trim(),
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      designMgd: Math.round(designMgd * 1000) / 1000,
      treatment: (effluent.get(id)?.['CURRENT_EFFLUENT_TREATMENT_LEVEL'] ?? '').trim() || null,
    });
  }
  plants.sort((a, b) => a.state.localeCompare(b.state) || a.id.localeCompare(b.id));
  return { plants, dropped };
}

export type Bbox = readonly [number, number, number, number];

/** Plants grouped by state, with each state's bounding box. */
export function byState(plants: readonly CwnsPlant[]): Map<string, { plants: CwnsPlant[]; bbox: Bbox }> {
  const out = new Map<string, { plants: CwnsPlant[]; bbox: [number, number, number, number] }>();
  for (const p of plants) {
    const g = out.get(p.state) ?? { plants: [], bbox: [Infinity, Infinity, -Infinity, -Infinity] };
    g.plants.push(p);
    g.bbox = [Math.min(g.bbox[0], p.lon), Math.min(g.bbox[1], p.lat), Math.max(g.bbox[2], p.lon), Math.max(g.bbox[3], p.lat)];
    out.set(p.state, g);
  }
  return out;
}
