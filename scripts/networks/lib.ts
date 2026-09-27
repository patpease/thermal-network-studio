/**
 * Existing thermal networks: the shared format every source is brought into,
 * its validation, and the generated module the app reads. Pure — no network
 * and no files — so the suite tests it on inline rows.
 *
 *   data/networks/sources.json   one entry per source: its file, citation,
 *                                licence, and whether it is still maintained
 *   data/networks/<file>.csv     one per source, in COLUMNS below
 *
 * Adding data later is a new CSV in these columns and a new sources.json
 * entry, however the rows were gathered. How a CSV was made is that source's
 * own business: NREL's came from a one-off converter
 * (`from-nrel-gdr-1282.ts`), kept as a record, not as a pipeline.
 */

/** The shared columns, in order. */
export const COLUMNS = ['id', 'name', 'kind', 'state', 'latitude', 'longitude', 'placement', 'year_opened', 'capacity_mwt', 'link', 'note'] as const;

export const KINDS = {
  'geothermal-network': 'Geothermal heat pump network',
  'geothermal-district-heating': 'Geothermal district heating',
  'district-energy': 'District energy system',
  'thermal-network': 'Thermal energy network',
} as const;
export type NetworkKind = keyof typeof KINDS;

/** Where the point is: the system itself, or only the town it is in. */
export const PLACEMENTS = ['site', 'town'] as const;
export type Placement = (typeof PLACEMENTS)[number];

export interface NetworkSource {
  readonly id: string;
  readonly file: string;
  /** Short name for the panel's attribution line. */
  readonly short: string;
  /** Full citation, as the publisher asks for it. Shown on Learn. */
  readonly citation: string;
  readonly licence: string;
  readonly url: string;
  /** ISO date the data was taken from the publisher. */
  readonly retrieved: string;
  /** False when the publisher no longer updates it: re-importing will not change it. */
  readonly maintained: boolean;
}

export interface ExistingNetwork {
  /** '<source>:<id>', unique across sources. */
  readonly id: string;
  readonly source: string;
  readonly name: string;
  readonly kind: NetworkKind;
  readonly state: string | null;
  /** [lon, lat] */
  readonly at: readonly [number, number];
  readonly placement: Placement;
  readonly yearOpened: number | null;
  /** Thermal capacity, MW, as published. */
  readonly capacityMWt: number | null;
  readonly link: string | null;
}

export interface Checked {
  readonly networks: ExistingNetwork[];
  /** Why the import refuses to write. Empty means it may. */
  readonly errors: string[];
  /** What a reader should know: kept, not corrected. */
  readonly notes: string[];
}

const US = { south: 17.5, north: 72, west: -180, east: -64 } as const;

/** Validate every source's rows. Refuses on any error; never guesses. */
export function checkSources(sources: readonly NetworkSource[], rowsBySource: ReadonlyMap<string, readonly Record<string, string>[]>): Checked {
  const errors: string[] = [];
  const notes: string[] = [];
  const networks: ExistingNetwork[] = [];
  const seen = new Set<string>();

  const sourceIds = new Set<string>();
  for (const s of sources) {
    if (!/^[a-z0-9-]+$/.test(s.id)) errors.push(`source "${s.id}": id must be lower-case letters, digits and hyphens`);
    if (sourceIds.has(s.id)) errors.push(`source "${s.id}" is listed twice`);
    sourceIds.add(s.id);
    for (const k of ['file', 'short', 'citation', 'licence', 'url', 'retrieved'] as const) if (!s[k]) errors.push(`source "${s.id}": no ${k}`);
    if (typeof s.maintained !== 'boolean') errors.push(`source "${s.id}": say whether it is maintained`);
  }

  for (const s of sources) {
    const rows = rowsBySource.get(s.id);
    if (!rows) {
      errors.push(`source "${s.id}": no rows read from ${s.file}`);
      continue;
    }
    rows.forEach((r, i) => {
      const where = `${s.file} row ${i + 2}`;
      const missing = COLUMNS.filter((c) => !(c in r));
      if (missing.length) {
        errors.push(`${where}: missing columns ${missing.join(', ')}`);
        return;
      }
      const lat = Number(r['latitude']);
      const lon = Number(r['longitude']);
      const kind = r['kind'] as NetworkKind;
      const placement = r['placement'] as Placement;
      const id = `${s.id}:${r['id']}`;
      if (!r['id']) errors.push(`${where}: no id`);
      if (!r['name']) errors.push(`${where}: no name`);
      if (!(kind in KINDS)) errors.push(`${where}: kind "${r['kind']}" is not one of ${Object.keys(KINDS).join(', ')}`);
      if (!PLACEMENTS.includes(placement)) errors.push(`${where}: placement "${r['placement']}" is not site or town`);
      if (!r['latitude'] || !r['longitude'] || !Number.isFinite(lat) || !Number.isFinite(lon)) errors.push(`${where}: no point`);
      else if (lat < US.south || lat > US.north || lon < US.west || lon > US.east) errors.push(`${where}: ${lat}, ${lon} is outside the United States`);
      if (seen.has(id)) errors.push(`${where}: id ${id} is used twice`);
      seen.add(id);
      const year = r['year_opened'] ? Number(r['year_opened']) : null;
      if (year !== null && !(Number.isInteger(year) && year > 1800 && year <= 2100)) errors.push(`${where}: year_opened "${r['year_opened']}"`);
      const capacity = r['capacity_mwt'] ? Number(r['capacity_mwt']) : null;
      if (capacity !== null && !(capacity > 0)) errors.push(`${where}: capacity_mwt "${r['capacity_mwt']}"`);
      if (r['link'] && !/^https?:\/\//.test(r['link'])) errors.push(`${where}: link is not a URL`);
      if (r['note']) notes.push(`${id} (${r['name']}): ${r['note']}`);
      networks.push({
        id,
        source: s.id,
        name: r['name']!,
        kind,
        state: r['state'] || null,
        at: [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5],
        placement,
        yearOpened: year,
        capacityMWt: capacity === null ? null : Math.round(capacity * 100) / 100,
        link: r['link'] || null,
      });
    });
  }

  // The same system from two sources: kept, and said, so a later source is
  // not a silent duplicate on the map.
  for (let i = 0; i < networks.length; i++) {
    for (let j = i + 1; j < networks.length; j++) {
      const a = networks[i]!;
      const b = networks[j]!;
      if (a.source !== b.source && Math.abs(a.at[0] - b.at[0]) < 0.004 && Math.abs(a.at[1] - b.at[1]) < 0.003) {
        notes.push(`${a.id} and ${b.id} are within about 300 m: the same system twice?`);
      }
    }
  }
  return { networks, errors, notes };
}

/** The generated module. */
export function moduleText(sources: readonly NetworkSource[], networks: readonly ExistingNetwork[]): string {
  return `/**
 * GENERATED by \`npm run import:networks\` from data/networks/. Do not edit:
 * change the CSV or sources.json and re-run.
 *
 * Existing thermal networks, for the map and the Site tab. Each carries its
 * source; every source's full citation is on the Learn tab.
 */

export type NetworkKind = ${Object.keys(KINDS).map((k) => `'${k}'`).join(' | ')};

export interface NetworkSourceInfo {
  readonly id: string;
  readonly short: string;
  readonly citation: string;
  readonly licence: string;
  readonly url: string;
  readonly retrieved: string;
  readonly maintained: boolean;
}

export interface ExistingNetwork {
  readonly id: string;
  readonly source: string;
  readonly name: string;
  readonly kind: NetworkKind;
  readonly state: string | null;
  /** [lon, lat] */
  readonly at: readonly [number, number];
  /** 'town': the point is the town the system is in, not the system. */
  readonly placement: 'site' | 'town';
  readonly yearOpened: number | null;
  /** Thermal capacity, MW, as published. */
  readonly capacityMWt: number | null;
  readonly link: string | null;
}

export const NETWORK_KIND_LABEL: Readonly<Record<NetworkKind, string>> = ${JSON.stringify(KINDS)};

export const NETWORK_SOURCES: readonly NetworkSourceInfo[] = ${JSON.stringify(
    sources.map(({ file: _file, ...s }) => s),
    null,
    1,
  )};

export const EXISTING_NETWORKS: readonly ExistingNetwork[] = [
${networks.map((n) => ` ${JSON.stringify(n)},`).join('\n')}
];
`;
}
