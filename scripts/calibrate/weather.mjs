/**
 * Fetch one representative weather year per climate zone.
 *
 *   npm run calibrate:weather
 *
 * The weather ComStock and ResStock were SIMULATED on: NLR's AMY2018 county
 * files, from the ComStock 2025 R3 weather folder. Calibrating against a
 * different year would fit the parameters to the difference between two
 * weathers, not to the buildings.
 *
 * One county per zone, chosen as the zone's usual representative city —
 * or, where the stock is concentrated elsewhere, where the stock is. That
 * is the approximation this step makes: the stock in a zone is spread across
 * many counties, and its loads are fitted against one. The choice is listed
 * here and in the output so it can be argued with.
 *
 * Output: data/calibration/weather.json.gz — dry bulb in tenths of a °C,
 * global horizontal irradiance in W/m² and relative humidity in %, 8760 hours
 * each, 2018. Humidity is for the cooling tower's wet bulb, not the loads. Committed; the
 * tests and the fitting step read it and never touch the network.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { streamCsv } from './csv.mjs';

const WEATHER =
  'https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2025/comstock_amy2018_release_3/weather/amy2018';

/** Zone → [NHGIS county GISJOIN, place]. */
export const REPRESENTATIVE = {
  '1A': ['G1200860', 'Miami-Dade County, FL'],
  '2A': ['G4802010', 'Harris County, TX (Houston)'],
  '2B': ['G0400130', 'Maricopa County, AZ (Phoenix)'],
  '3A': ['G1301210', 'Fulton County, GA (Atlanta)'],
  // Not Las Vegas: most of 3B's floor area is in Southern California, and
  // fitting it to the Mojave cost 30–60% on heating for every home type.
  '3B': ['G0600370', 'Los Angeles County, CA'],
  '3C': ['G0600750', 'San Francisco County, CA'],
  '4A': ['G2405100', 'Baltimore city, MD'],
  '4B': ['G3500010', 'Bernalillo County, NM (Albuquerque)'],
  '4C': ['G5300330', 'King County, WA (Seattle)'],
  '5A': ['G1700310', 'Cook County, IL (Chicago)'],
  '5B': ['G0800310', 'Denver County, CO'],
  '6A': ['G2700530', 'Hennepin County, MN (Minneapolis)'],
  '6B': ['G3000490', 'Lewis and Clark County, MT (Helena)'],
  '7': ['G2701370', 'St. Louis County, MN (Duluth)'],
  '8': ['G0200900', 'Fairbanks North Star Borough, AK'],
};

async function fetchZone(gisjoin) {
  const temperature = [];
  const ghi = [];
  const humidity = [];
  let header = null;
  await streamCsv(`${WEATHER}/${gisjoin}_2018.csv`, (row) => {
    if (!header) {
      header = row;
      if (!row[1]?.startsWith('Dry Bulb') || !row[2]?.startsWith('Relative Humidity') || !row[5]?.startsWith('Global Horizontal')) {
        throw new Error(`Unexpected weather columns: ${row.join(', ')}`);
      }
      return;
    }
    if (row.length < 6) return;
    temperature.push(Math.round(Number(row[1]) * 10));
    ghi.push(Math.max(0, Math.round(Number(row[5]))));
    humidity.push(Math.min(100, Math.max(0, Math.round(Number(row[2])))));
  });
  if (temperature.length !== 8760) throw new Error(`${gisjoin}: ${temperature.length} hours, expected 8760`);
  return { temperatureTenthsC: temperature, ghiWm2: ghi, relativeHumidityPct: humidity };
}

async function main() {
  const zones = {};
  for (const [zone, [gisjoin, place]] of Object.entries(REPRESENTATIVE)) {
    zones[zone] = { gisjoin, place, ...(await fetchZone(gisjoin)) };
    const t = zones[zone].temperatureTenthsC;
    const mean = t.reduce((a, b) => a + b, 0) / t.length / 10;
    console.log(`${zone.padEnd(3)} ${place.padEnd(38)} mean ${mean.toFixed(1)} °C`);
  }
  const output = {
    generatedBy: 'scripts/calibrate/weather.mjs — do not edit by hand',
    source: `${WEATHER} (NLR AMY2018, as used by ComStock 2025 R3)`,
    year: 2018,
    zones,
  };
  const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/calibration/weather.json.gz');
  writeFileSync(path, gzipSync(JSON.stringify(output)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
