/**
 * The AutoBEM check, the pure half: parse what ORNL publishes, map it onto
 * this tool's archetypes, aggregate, and write the report. No network and no
 * files — `autobem.ts` does those — so the suite can test every step here on
 * a few inline rows.
 *
 * What is compared, and why this and not an hourly shape: AutoBEM publishes
 * ANNUAL end-use energy per building (EnergyPlus, TMY3 weather), not hourly
 * loads. The one set with building types, vintages and stock weights is the
 * Arizona archetype extract (Zenodo 10393563): 527 archetypes over zones 2B,
 * 3B, 4B and 5B. So the check is annual heating and cooling DEMAND per type
 * and zone, this tool's model run on the same TMY3 years against AutoBEM's.
 *
 * AutoBEM reports energy in; demand is heat out. The conversion is stated
 * in `EFFICIENCY` and printed in the report, with the raw energy beside it.
 */
import type { ArchetypeId } from '../../src/loads/archetypes.ts';
import type { WeatherYear } from '../../src/loads/model.ts';
import type { ClimateZone, VintageBand } from '../../src/loads/zones.ts';

export const ZONES_CHECKED = ['2B', '3B', '4B', '5B'] as const satisfies readonly ClimateZone[];
export type CheckedZone = (typeof ZONES_CHECKED)[number];

/** One TMY3 station per zone, from climate.onebuilding.org's Arizona list. */
export const STATIONS: Record<CheckedZone, string> = {
  '2B': 'USA_AZ_Phoenix-Sky.Harbor.Intl.AP.722780_TMY3',
  '3B': 'USA_AZ_Kingman.AP.723700_TMY3',
  '4B': 'USA_AZ_Prescott.Muni.AP-Love.Field.723723_TMY3',
  '5B': 'USA_AZ_Flagstaff.Pulliam.AP.723755_TMY3',
};

/** AutoBEM's DOE prototype names → this tool's archetypes. */
export const TYPE_MAP: Record<string, ArchetypeId> = {
  IECC: 'single-family',
  MidriseApartment: 'large-multifamily',
  HighriseApartment: 'large-multifamily',
  SmallOffice: 'office-small',
  MediumOffice: 'office-large',
  LargeOffice: 'office-large',
  RetailStandalone: 'retail-standalone',
  RetailStripmall: 'retail-stripmall',
  PrimarySchool: 'school-primary',
  SecondarySchool: 'school-secondary',
  Outpatient: 'outpatient',
  Hospital: 'hospital',
  FullServiceRestaurant: 'restaurant',
  QuickServiceRestaurant: 'restaurant',
  SmallHotel: 'hotel',
  LargeHotel: 'hotel',
  Warehouse: 'warehouse',
};

/** AutoBEM's energy standard → this tool's vintage band. */
export function vintageOf(standard: string): VintageBand | undefined {
  if (standard === 'DOE-Ref-Pre-1980') return '1950-1979';
  if (standard === 'DOE-Ref-1980-2004') return '1980-1999';
  if (/^90\.1-20\d\d$/.test(standard)) return '2000+';
  return undefined;
}

/**
 * Energy in → heat out, for AutoBEM's side. The DOE prototypes heat with gas
 * furnaces and boilers (0.80), and where they heat electrically it is reheat
 * coils or packaged-unit strips (resistance, 1.0). Cooling is packaged DX
 * (COP 3.0) except the three prototypes with water-cooled chillers (5.5).
 */
export const EFFICIENCY = {
  gasHeating: 0.8,
  electricHeating: 1.0,
  coolingDx: 3.0,
  coolingChiller: 5.5,
  chillerTypes: ['LargeOffice', 'Hospital', 'LargeHotel'] as readonly string[],
} as const;

const KWH_PER_KBTU = 0.29307107;
const M2_PER_FT2 = 0.09290304;

export interface AutobemRow {
  readonly zone: CheckedZone;
  readonly type: string;
  readonly standard: string;
  /** m², the archetype building's floor area. */
  readonly area: number;
  /** m² of stock this archetype stands for (Area × Area_multiplier). */
  readonly stockArea: number;
  /** kWh/yr, energy in. */
  readonly heatingGas: number;
  readonly heatingElectric: number;
  readonly coolingElectric: number;
}

/** A quote-aware CSV parse: header → objects, keys trimmed. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  const keys = (head ?? []).map((k) => k.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export function autobemRows(zone: CheckedZone, text: string): AutobemRow[] {
  const n = (x: string | undefined) => {
    const v = Number(x);
    return Number.isFinite(v) ? v : 0;
  };
  return parseCsv(text)
    .filter((r) => r['BuildingType'] && n(r['Area']) > 0)
    .map((r) => ({
      zone,
      type: r['BuildingType']!,
      standard: r['Standard'] ?? '',
      area: n(r['Area']) * M2_PER_FT2,
      stockArea: n(r['Area']) * n(r['Area_multiplier']) * M2_PER_FT2,
      heatingGas: n(r['Heating_NaturalGas[kBTU]']) * KWH_PER_KBTU,
      heatingElectric: n(r['Heating_Electricity[kBTU]']) * KWH_PER_KBTU,
      coolingElectric: n(r['Cooling_Electricity[kBTU]']) * KWH_PER_KBTU,
    }));
}

/** AutoBEM's demand, kWh/yr, from its energy at `EFFICIENCY`. */
export function autobemDemand(r: AutobemRow): { heating: number; cooling: number } {
  const cop = EFFICIENCY.chillerTypes.includes(r.type) ? EFFICIENCY.coolingChiller : EFFICIENCY.coolingDx;
  return {
    heating: r.heatingGas * EFFICIENCY.gasHeating + r.heatingElectric * EFFICIENCY.electricHeating,
    cooling: r.coolingElectric * cop,
  };
}

/** An EPW file → a weather year. Day of week from the DATA PERIODS header. */
export function parseEpw(text: string): WeatherYear & { location: string } {
  const lines = text.split(/\r?\n/);
  const location = (lines[0] ?? '').split(',').slice(1, 4).join(', ');
  const period = lines.find((l) => l.startsWith('DATA PERIODS')) ?? '';
  const day = period.split(',')[4]?.trim().toLowerCase() ?? 'sunday';
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const temperature: number[] = [];
  const relativeHumidity: number[] = [];
  const ghi: number[] = [];
  for (const line of lines.slice(8)) {
    const f = line.split(',');
    if (f.length < 14) continue;
    temperature.push(Number(f[6]));
    relativeHumidity.push(Number(f[8]));
    ghi.push(Math.max(0, Number(f[13])));
  }
  if (temperature.length !== 8760) throw new Error(`EPW has ${temperature.length} hours, not 8760`);
  return {
    location,
    temperature: Float64Array.from(temperature),
    relativeHumidity: Float64Array.from(relativeHumidity),
    ghi: Float64Array.from(ghi),
    firstWeekday: Math.max(0, days.indexOf(day)),
  };
}

/** The one file in a zip whose name ends with `suffix` (stored or deflated). */
export async function unzipOne(zip: Uint8Array, suffix: string): Promise<Uint8Array> {
  const { inflateRawSync } = await import('node:zlib');
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let e = 0; e < entries; e++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    if (name.toLowerCase().endsWith(suffix)) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = zip.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return new Uint8Array(inflateRawSync(data));
      throw new Error(`Unsupported zip compression ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`No *${suffix} in the zip`);
}

export interface Compared {
  readonly zone: CheckedZone;
  readonly type: string;
  readonly archetype: ArchetypeId;
  readonly stockArea: number;
  /** kWh/m²·yr, stock-weighted over the type's vintages. */
  readonly autobem: { readonly heating: number; readonly cooling: number; readonly heatingEnergy: number; readonly coolingEnergy: number };
  readonly tool: { readonly heating: number; readonly cooling: number };
  /** The NLR stock intensity the tool is calibrated to for this archetype and zone (AMY2018 weather). */
  readonly nlr: { readonly heating: number; readonly cooling: number } | null;
}

/**
 * Aggregate rows into one line per zone × AutoBEM type, weighting each
 * archetype by the stock floor area it stands for. `tool` gives this tool's
 * annual heating and cooling demand, kWh, for one row.
 */
export function compare(
  rows: readonly AutobemRow[],
  tool: (r: AutobemRow) => { heating: number; cooling: number },
  nlr: (archetype: ArchetypeId, zone: CheckedZone) => { heating: number; cooling: number } | null,
): Compared[] {
  const groups = new Map<string, AutobemRow[]>();
  for (const r of rows) {
    if (!TYPE_MAP[r.type] || r.stockArea <= 0) continue;
    const key = `${r.zone}|${r.type}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: Compared[] = [];
  for (const [key, g] of groups) {
    const [zone, type] = key.split('|') as [CheckedZone, string];
    const archetype = TYPE_MAP[type]!;
    let area = 0;
    const sum = { ah: 0, ac: 0, ahe: 0, ace: 0, th: 0, tc: 0 };
    for (const r of g) {
      const w = r.stockArea / r.area; // how many of this building the stock holds
      const d = autobemDemand(r);
      const t = tool(r);
      area += r.stockArea;
      sum.ah += d.heating * w;
      sum.ac += d.cooling * w;
      sum.ahe += (r.heatingGas + r.heatingElectric) * w;
      sum.ace += r.coolingElectric * w;
      sum.th += t.heating * w;
      sum.tc += t.cooling * w;
    }
    out.push({
      zone,
      type,
      archetype,
      stockArea: area,
      autobem: { heating: sum.ah / area, cooling: sum.ac / area, heatingEnergy: sum.ahe / area, coolingEnergy: sum.ace / area },
      tool: { heating: sum.th / area, cooling: sum.tc / area },
      nlr: nlr(archetype, zone),
    });
  }
  return out.sort((a, b) => a.zone.localeCompare(b.zone) || b.stockArea - a.stockArea);
}

export interface Summary {
  readonly zone: CheckedZone | 'all';
  readonly stockArea: number;
  readonly autobem: { readonly heating: number; readonly cooling: number };
  readonly tool: { readonly heating: number; readonly cooling: number };
  /**
   * Σ stock × |tool − AutoBEM| ÷ Σ stock × AutoBEM, over the zone × type
   * groups: the gap with nothing allowed to cancel. A total can agree while
   * every type disagrees in opposite directions.
   */
  readonly absoluteGap: { readonly heating: number; readonly cooling: number };
  /** The NLR stock intensities, weighted the same way, where the tool has them. */
  readonly nlr: { readonly heating: number; readonly cooling: number };
}

/** Stock-weighted totals per zone and over all four. */
export function summarise(rows: readonly Compared[]): Summary[] {
  const one = (zone: Summary['zone'], rs: readonly Compared[]): Summary => {
    const area = rs.reduce((s, r) => s + r.stockArea, 0);
    const w = (f: (r: Compared) => number) => rs.reduce((s, r) => s + f(r) * r.stockArea, 0) / area;
    const abs = (f: (r: Compared) => [number, number]) =>
      rs.reduce((s, r) => s + Math.abs(f(r)[0] - f(r)[1]) * r.stockArea, 0) / rs.reduce((s, r) => s + f(r)[1] * r.stockArea, 0);
    return {
      zone,
      stockArea: area,
      autobem: { heating: w((r) => r.autobem.heating), cooling: w((r) => r.autobem.cooling) },
      tool: { heating: w((r) => r.tool.heating), cooling: w((r) => r.tool.cooling) },
      absoluteGap: { heating: abs((r) => [r.tool.heating, r.autobem.heating]), cooling: abs((r) => [r.tool.cooling, r.autobem.cooling]) },
      nlr: { heating: w((r) => r.nlr?.heating ?? r.tool.heating), cooling: w((r) => r.nlr?.cooling ?? r.tool.cooling) },
    };
  };
  return [...ZONES_CHECKED.map((z) => one(z, rows.filter((r) => r.zone === z))), one('all', rows)];
}

/** Tool ÷ AutoBEM − 1, as a signed percentage; "—" when AutoBEM is ~zero. */
export function gap(tool: number, autobem: number): string {
  if (autobem < 0.5) return '—';
  const g = (tool / autobem - 1) * 100;
  return `${g >= 0 ? '+' : '−'}${Math.abs(Math.round(g))}%`;
}

const f1 = (x: number) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en-US') : x.toFixed(1));

export function reportMarkdown(input: {
  readonly date: string;
  readonly rows: readonly Compared[];
  readonly summary: readonly Summary[];
  readonly stations: Record<CheckedZone, string>;
}): string {
  const s = input.summary;
  const all = s.find((x) => x.zone === 'all')!;
  const lines: string[] = [];
  lines.push('# This tool against ORNL AutoBEM: annual heating and cooling demand');
  lines.push('');
  lines.push(`Generated ${input.date} by \`npm run validate:autobem\`. Not part of the app or \`npm test\`; nothing here is tuned to it.`);
  lines.push('');
  lines.push('## What is compared');
  lines.push('');
  lines.push('- **AutoBEM**: ORNL, *Model America – Arizona extract (archetypes with simulation results)*, Zenodo 10393563. 527 EnergyPlus archetypes over climate zones 2B, 3B, 4B and 5B, each weighted by the stock floor area it stands for. TMY3 weather.');
  lines.push('- **This tool**: its own load model (`src/loads`), calibrated to NLR ComStock/ResStock, run for each archetype at the same floor area and vintage, on the same kind of weather: one TMY3 year per zone from climate.onebuilding.org.');
  lines.push(`  ${ZONES_CHECKED.map((z) => `${z}: ${input.stations[z]}`).join('; ')}.`);
  lines.push('- **Annual, not hourly.** AutoBEM publishes annual end-use energy per building; no public release carries an hourly profile. The hour-by-hour shape remains unchecked.');
  lines.push(`- **Energy → demand.** AutoBEM reports energy in. Its demand here is gas heating × ${EFFICIENCY.gasHeating} + electric heating × ${EFFICIENCY.electricHeating} (furnaces, boilers, resistance reheat), and cooling electricity × ${EFFICIENCY.coolingDx} (packaged DX) or × ${EFFICIENCY.coolingChiller} (water-cooled chillers: ${EFFICIENCY.chillerTypes.join(', ')}). The raw energy is in the tables beside it.`);
  lines.push('- **Gap** is this tool ÷ AutoBEM − 1. Positive: this tool is higher.');
  lines.push('');
  lines.push('## Result');
  lines.push('');
  lines.push(`Over all four zones, weighted by stock floor area (${f1(all.stockArea / 1e6)} million m²):`);
  lines.push('');
  lines.push('| | This tool, kWh/m²·yr | AutoBEM, kWh/m²·yr | Gap |');
  lines.push('|---|---:|---:|---:|');
  lines.push(`| **Heating demand** | ${f1(all.tool.heating)} | ${f1(all.autobem.heating)} | **${gap(all.tool.heating, all.autobem.heating)}** |`);
  lines.push(`| **Cooling demand** | ${f1(all.tool.cooling)} | ${f1(all.autobem.cooling)} | **${gap(all.tool.cooling, all.autobem.cooling)}** |`);
  lines.push('');
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  lines.push(
    `**The totals hide offsetting gaps.** Type by type, with nothing allowed to cancel, the stock-weighted absolute gap is **${pc(all.absoluteGap.heating)} for heating** and **${pc(all.absoluteGap.cooling)} for cooling**.`,
  );
  lines.push('');
  lines.push(
    `**Most of the gap is between the two reference sets, not the tool and its own.** Against NLR — the stock data it is calibrated to — the tool is ${gap(all.tool.heating, all.nlr.heating)} on heating and ${gap(all.tool.cooling, all.nlr.cooling)} on cooling here (TMY3 weather against NLR's 2018). NLR against AutoBEM: ${gap(all.nlr.heating, all.autobem.heating)} heating, ${gap(all.nlr.cooling, all.autobem.cooling)} cooling.`,
  );
  lines.push('');
  lines.push('### By climate zone');
  lines.push('');
  lines.push('| Zone | Stock, million m² | Heating: tool | Heating: AutoBEM | Heating gap | Heating absolute gap | Cooling: tool | Cooling: AutoBEM | Cooling gap | Cooling absolute gap |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const z of s.filter((x) => x.zone !== 'all')) {
    lines.push(
      `| ${z.zone} | ${f1(z.stockArea / 1e6)} | ${f1(z.tool.heating)} | ${f1(z.autobem.heating)} | ${gap(z.tool.heating, z.autobem.heating)} | ${pc(z.absoluteGap.heating)} | ${f1(z.tool.cooling)} | ${f1(z.autobem.cooling)} | ${gap(z.tool.cooling, z.autobem.cooling)} | ${pc(z.absoluteGap.cooling)} |`,
    );
  }
  lines.push('');
  const big = [...input.rows]
    .flatMap((r) => [
      { r, what: 'heating', t: r.tool.heating, a: r.autobem.heating },
      { r, what: 'cooling', t: r.tool.cooling, a: r.autobem.cooling },
    ])
    .filter((x) => x.a >= 5 && x.r.stockArea / all.stockArea > 0.005)
    .sort((x, y) => Math.abs(Math.log(y.t / y.a)) - Math.abs(Math.log(x.t / x.a)))
    .slice(0, 8);
  lines.push('### Largest gaps');
  lines.push('');
  lines.push('Types holding at least 0.5% of the stock and 5 kWh/m²·yr of AutoBEM demand:');
  lines.push('');
  for (const x of big) {
    lines.push(`- ${x.r.zone} ${x.r.type} (${x.r.archetype}), ${x.what}: tool ${f1(x.t)}, AutoBEM ${f1(x.a)} kWh/m²·yr, ${gap(x.t, x.a)}.`);
  }
  lines.push('');
  lines.push('## By zone and building type');
  lines.push('');
  lines.push('kWh/m²·yr. "NLR" is the stock intensity this tool is calibrated to for that archetype and zone (on the 2018 calibration weather, not TMY3). AutoBEM energy is what it reports, before conversion.');
  lines.push('');
  lines.push('| Zone | AutoBEM type | Tool archetype | Stock, 1000 m² | Heat: tool | Heat: AutoBEM | Heat gap | Heat: NLR | Cool: tool | Cool: AutoBEM | Cool gap | Cool: NLR | AutoBEM heating energy | AutoBEM cooling electricity |');
  lines.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of input.rows) {
    lines.push(
      `| ${r.zone} | ${r.type} | ${r.archetype} | ${f1(r.stockArea / 1e3)} | ${f1(r.tool.heating)} | ${f1(r.autobem.heating)} | ${gap(r.tool.heating, r.autobem.heating)} | ${r.nlr ? f1(r.nlr.heating) : '—'} | ${f1(r.tool.cooling)} | ${f1(r.autobem.cooling)} | ${gap(r.tool.cooling, r.autobem.cooling)} | ${r.nlr ? f1(r.nlr.cooling) : '—'} | ${f1(r.autobem.heatingEnergy)} | ${f1(r.autobem.coolingEnergy)} |`,
    );
  }
  lines.push('');
  lines.push('## Reading it');
  lines.push('');
  lines.push('- A gap is a difference between two models, not an error in either. AutoBEM models each building from its footprint and height with DOE prototype systems; this tool matches the NLR stock average for its type and zone.');
  lines.push('- Where the tool agrees with NLR but not AutoBEM, the two reference sets disagree. Where it disagrees with both, look at the tool.');
  lines.push('- The conversion from energy to demand moves every AutoBEM figure by the efficiency assumed. Heating is mostly gas at 0.80; a 0.90 boiler would raise AutoBEM heating demand 12%.');
  lines.push('- Record the gap. Do not tune the tool to it.');
  lines.push('');
  lines.push('Data: ORNL AutoBEM Model America, Arizona extract (Zenodo 10393563). Weather: climate.onebuilding.org TMY3. Loads calibrated to NLR ComStock™ and ResStock™.');
  lines.push('');
  return lines.join('\n');
}
