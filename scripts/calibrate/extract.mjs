/**
 * Extract calibration targets from NLR's ComStock and ResStock.
 *
 *   npm run calibrate:extract
 *
 * Streams two national files straight off OEDI — about 2.3 GB of ComStock
 * component loads and 0.9 GB of gzipped ResStock results — and keeps only
 * weighted sums. Nothing raw is written to disk and nothing raw is committed.
 * The output, `data/calibration/targets.json`, is small, committed, and the
 * only thing the fitting step reads.
 *
 * The targets are THERMAL LOADS, not fuel: ComStock's component loads
 * (`out.loads.htg.*`, `out.loads.clg.*`) and ResStock's delivered loads
 * (`out.load.*.energy_delivered`). A thermal network serves the load; the fuel
 * a building burns today is the business-as-usual baseline (D21), and is kept
 * separately for that.
 *
 * Grouped by source building type × climate zone × vintage band. Mapping those
 * onto the game's archetypes is the fitting step's job, so a mapping change
 * never needs a 3 GB download.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { streamCsv } from './csv.mjs';

const OEDI = 'https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock';

export const SOURCES = {
  comstock: {
    release: 'ComStock 2025 Release 3 (AMY2018)',
    url: `${OEDI}/2025/comstock_amy2018_release_3/component_loads/metadata_and_annual_results_aggregates/national_by_state/full/csv/upgrade0_agg.csv`,
  },
  resstock: {
    release: 'ResStock 2025 Release 1 (AMY2018)',
    url: `${OEDI}/2025/resstock_amy2018_release_1/metadata_and_annual_results/national/full/csv/upgrade0.csv.gz`,
  },
};

const KWH_PER_GJ = 277.7777778;
const KWH_PER_KBTU = 0.29307107;
const M2_PER_FT2 = 0.09290304;

/**
 * Four vintage bands, not EPRI's five. ComStock's bins straddle EPRI's
 * boundaries (1946–1959, 2000–2012), so EPRI's bands cannot be formed from
 * this data without splitting a bin. These four can be formed exactly from
 * ResStock and to within one straddling bin from ComStock.
 */
export const VINTAGE_BANDS = ['pre-1950', '1950-1979', '1980-1999', '2000+'];

const COMSTOCK_VINTAGE = {
  'Before 1946': 'pre-1950',
  '1946 to 1959': '1950-1979', // straddles 1950; most of the bin is after it
  '1960 to 1969': '1950-1979',
  '1970 to 1979': '1950-1979',
  '1980 to 1989': '1980-1999',
  '1990 to 1999': '1980-1999',
  '2000 to 2012': '2000+',
  '2013 to 2018': '2000+',
};

const RESSTOCK_VINTAGE = {
  '<1940': 'pre-1950',
  '1940s': 'pre-1950',
  '1950s': '1950-1979',
  '1960s': '1950-1979',
  '1970s': '1950-1979',
  '1980s': '1980-1999',
  '1990s': '1980-1999',
  '2000s': '2000+',
  '2010s': '2000+',
};

/** ComStock component groups, as the 1R1C model sees them. */
const COMPONENT_GROUPS = {
  envelope: ['door', 'ext_flr', 'ext_wall', 'fnd_wall', 'gnd_flr', 'roof', 'win_cond'],
  solar: ['win_sol'],
  infiltration: ['infil'],
  ventilation: ['vent'],
  gains: ['equip_gain', 'light_gain', 'people_gain', 'ref_equip_gain'],
};

const FUELS = ['electricity', 'natural_gas', 'fuel_oil', 'propane', 'other_fuel', 'district_heating', 'district_cooling'];

/** One accumulator per group key: weights, weighted floor area, weighted sums. */
function accumulator() {
  return { models: 0, weight: 0, floorArea: 0, dhwFloorArea: 0, sums: {} };
}

function add(acc, metric, value) {
  acc.sums[metric] = (acc.sums[metric] ?? 0) + value;
}

function headerIndex(header, names) {
  const index = {};
  for (const name of names) {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Column missing: ${name}. The release changed; update extract.mjs.`);
    index[name] = i;
  }
  return index;
}

async function extractComstock(groups) {
  const loadCols = [];
  for (const mode of ['htg', 'clg']) {
    for (const parts of Object.values(COMPONENT_GROUPS)) {
      for (const part of parts) loadCols.push(`out.loads.${mode}.${part}..gj`);
    }
  }
  const energyCols = [];
  for (const fuel of FUELS) {
    for (const use of ['heating', 'cooling', 'water_systems', 'refrigeration']) {
      energyCols.push(`out.${fuel}.${use}.energy_consumption..kwh`);
    }
  }

  let index = null;
  let energyPresent = [];
  let rows = 0;

  await streamCsv(SOURCES.comstock.url, (row) => {
    if (!index) {
      index = headerIndex(row, [
        'weight',
        'in.sqft..ft2',
        'in.comstock_building_type',
        'in.as_simulated_ashrae_iecc_climate_zone_2006',
        'in.vintage',
        'in.state',
        ...loadCols,
      ]);
      // Not every fuel × end use exists as a column (no propane cooling).
      energyPresent = energyCols.filter((c) => row.includes(c)).map((c) => [c, row.indexOf(c)]);
      return;
    }
    if (row.length < 10) return;
    rows++;

    const weight = Number(row[index.weight]);
    const area = Number(row[index['in.sqft..ft2']]) * M2_PER_FT2;
    const type = row[index['in.comstock_building_type']];
    const zone = row[index['in.as_simulated_ashrae_iecc_climate_zone_2006']];
    const band = COMSTOCK_VINTAGE[row[index['in.vintage']]];
    if (!band) throw new Error(`Unmapped ComStock vintage: ${row[index['in.vintage']]}`);
    if (!(weight > 0) || !(area > 0)) return;

    const key = `comstock|${type}|${zone}|${band}`;
    const acc = (groups[key] ??= accumulator());
    acc.models++;
    acc.weight += weight;
    acc.floorArea += weight * area;

    // Known issue in this release: service water heating was not modelled in
    // any California building. Those rows would pull every DHW intensity in
    // their zones toward zero, so they are left out of the DHW denominator
    // and the DHW numerators alike.
    const dhwValid = row[index['in.state']] !== 'CA';
    if (dhwValid) acc.dhwFloorArea += weight * area;

    for (const mode of ['htg', 'clg']) {
      let total = 0;
      for (const [group, parts] of Object.entries(COMPONENT_GROUPS)) {
        let sum = 0;
        for (const part of parts) sum += Number(row[index[`out.loads.${mode}.${part}..gj`]]) || 0;
        add(acc, `${mode}.${group}`, weight * sum * KWH_PER_GJ);
        total += sum;
      }
      add(acc, mode === 'htg' ? 'heatingLoad' : 'coolingLoad', weight * total * KWH_PER_GJ);
    }

    for (const [col, i] of energyPresent) {
      const value = Number(row[i]) || 0;
      if (value === 0) continue;
      const [, fuel, use] = col.split('.');
      if (use === 'water_systems' && !dhwValid) continue;
      add(acc, `energy.${use === 'water_systems' ? 'dhw' : use}.${fuel}`, weight * value);
    }
  });
  return rows;
}

async function extractResstock(groups) {
  const energyCols = [];
  for (const fuel of ['electricity', 'natural_gas', 'fuel_oil', 'propane']) {
    for (const use of ['heating', 'cooling', 'hot_water']) {
      energyCols.push(`out.${fuel}.${use}.energy_consumption..kwh`);
    }
  }

  let index = null;
  let energyPresent = [];
  let rows = 0;

  await streamCsv(SOURCES.resstock.url, (row) => {
    if (!index) {
      index = headerIndex(row, [
        'weight',
        'in.sqft..ft2',
        'in.geometry_building_type_recs',
        'in.ashrae_iecc_climate_zone_2004',
        'in.vintage',
        'out.load.heating.energy_delivered..kbtu',
        'out.load.cooling.energy_delivered..kbtu',
        'out.load.hot_water.energy_delivered..kbtu',
      ]);
      energyPresent = energyCols.filter((c) => row.includes(c)).map((c) => [c, row.indexOf(c)]);
      return;
    }
    if (row.length < 10) return;
    rows++;

    const weight = Number(row[index.weight]);
    const area = Number(row[index['in.sqft..ft2']]) * M2_PER_FT2;
    const type = row[index['in.geometry_building_type_recs']];
    const zone = row[index['in.ashrae_iecc_climate_zone_2004']];
    const band = RESSTOCK_VINTAGE[row[index['in.vintage']]];
    if (!band) throw new Error(`Unmapped ResStock vintage: ${row[index['in.vintage']]}`);
    if (!(weight > 0) || !(area > 0)) return;

    const key = `resstock|${type}|${zone}|${band}`;
    const acc = (groups[key] ??= accumulator());
    acc.models++;
    acc.weight += weight;
    acc.floorArea += weight * area;
    acc.dhwFloorArea += weight * area;

    const kbtu = (name) => (Number(row[index[name]]) || 0) * KWH_PER_KBTU;
    add(acc, 'heatingLoad', weight * kbtu('out.load.heating.energy_delivered..kbtu'));
    add(acc, 'coolingLoad', weight * kbtu('out.load.cooling.energy_delivered..kbtu'));
    add(acc, 'dhwLoad', weight * kbtu('out.load.hot_water.energy_delivered..kbtu'));

    for (const [col, i] of energyPresent) {
      const value = Number(row[i]) || 0;
      if (value === 0) continue;
      const [, fuel, use] = col.split('.');
      add(acc, `energy.${use === 'hot_water' ? 'dhw' : use}.${fuel}`, weight * value);
    }
  });
  return rows;
}

/** Weighted sums → intensities per m² of floor, rounded for a stable diff. */
function finish(groups) {
  const out = [];
  for (const [key, acc] of Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))) {
    const [source, type, zone, vintage] = key.split('|');
    const intensity = {};
    for (const [metric, sum] of Object.entries(acc.sums).sort(([a], [b]) => a.localeCompare(b))) {
      const dhw = metric === 'dhwLoad' || metric.startsWith('energy.dhw.');
      const denominator = dhw ? acc.dhwFloorArea : acc.floorArea;
      intensity[metric] = denominator > 0 ? Number((sum / denominator).toPrecision(5)) : null;
    }
    out.push({
      source,
      type,
      zone,
      vintage,
      models: acc.models,
      weight: Number(acc.weight.toPrecision(6)),
      floorAreaM2: Number(acc.floorArea.toPrecision(6)),
      dhwFloorAreaM2: Number(acc.dhwFloorArea.toPrecision(6)),
      kWhPerM2: intensity,
    });
  }
  return out;
}

async function main() {
  const groups = {};
  const started = Date.now();
  const [comstockRows, resstockRows] = await Promise.all([extractComstock(groups), extractResstock(groups)]);

  const output = {
    generatedBy: 'scripts/calibrate/extract.mjs — do not edit by hand',
    attribution:
      'Data includes information from the ComStock™ and ResStock™ datasets developed by the National Laboratory of the Rockies (NLR) with funding from the U.S. Department of Energy (DOE).',
    sources: SOURCES,
    notes: [
      'Loads are thermal (ComStock component loads; ResStock delivered loads), kWh per m² of floor per year.',
      'ComStock heating/cooling loads are the sum of components: losses positive, gains negative in heating; the reverse in cooling.',
      'ComStock 2025 R3 did not model service water heating in California; CA rows are excluded from every DHW figure (dhwFloorAreaM2).',
      'ComStock DHW is energy by fuel only; the fitting step converts it to a thermal load with a stated efficiency.',
      'Vintage bands: pre-1950, 1950-1979, 1980-1999, 2000+. ComStock 1946-1959 is assigned to 1950-1979.',
    ],
    rows: { comstock: comstockRows, resstock: resstockRows },
    groups: finish(groups),
  };

  const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/calibration/targets.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(output, null, 1)}\n`);
  console.log(
    `ComStock ${comstockRows} models, ResStock ${resstockRows} models → ${output.groups.length} groups in ${((Date.now() - started) / 1000).toFixed(0)} s`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
