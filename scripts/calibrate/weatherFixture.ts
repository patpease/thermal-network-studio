/**
 * The calibration weather years, for Node only (the fit and the tests).
 * The browser gets its weather from the relay in phase 03, never from here.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import type { WeatherYear } from '../../src/loads/model.ts';
import type { ClimateZone } from '../../src/loads/zones.ts';

interface Fixture {
  zones: Record<string, { gisjoin: string; place: string; temperatureTenthsC: number[]; ghiWm2: number[] }>;
}

const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/calibration/weather.json.gz');

let cache: Fixture | null = null;

export function calibrationWeather(zone: ClimateZone): WeatherYear & { place: string } {
  cache ??= JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as Fixture;
  const z = cache.zones[zone];
  if (!z) throw new Error(`No calibration weather for zone ${zone}`);
  return {
    place: z.place,
    temperature: Float64Array.from(z.temperatureTenthsC, (t) => t / 10),
    ghi: Float64Array.from(z.ghiWm2),
    // 1 January 2018 was a Monday.
    firstWeekday: 0,
  };
}
