/**
 * The data source register: every dataset the tool loads, with its licence,
 * the attribution it asks for, which release is used, and how it is
 * refreshed. One place, read by the Learn tab's references card, the Site
 * panel's attribution line, chart exports and the award.
 *
 * `tests/sources.test.ts` fails if the relay can reach a host, or a
 * GENERATED file exists, that no entry here names — so a new source cannot
 * ship without its licence being written down.
 *
 * Every string is a statement of fact (D37); the wording test reads them.
 * Where a release is not known, the entry says so rather than guessing.
 */
import { NETWORK_SOURCES } from '../site/generated/networks';

/** How the data reaches the tool. */
export type Delivery =
  /** Fetched when a site is drawn, through the relay or the map. */
  | 'live'
  /** Extracted once by a script and committed as generated data. */
  | 'generated';

export interface DataSource {
  readonly id: string;
  readonly name: string;
  readonly publisher: string;
  /** What the tool takes from it. */
  readonly use: string;
  readonly licence: string;
  readonly licenceUrl?: string;
  /** The credit the licence or the publisher asks for, verbatim where given. */
  readonly attribution: string;
  /** ODbL and similar: a derived database must carry the same licence. */
  readonly shareAlike: boolean;
  /** Which release the tool uses. */
  readonly vintage: string;
  /** How often it changes upstream, and what refreshes it here. */
  readonly refresh: string;
  /** The name and release, short enough for an attribution line. */
  readonly short: string;
  readonly delivery: Delivery;
  readonly url: string;
  /** Hosts it is fetched from (live data). */
  readonly hosts?: readonly string[];
  /** Committed files generated from it (generated data). */
  readonly files?: readonly string[];
}

const NETWORK_ENTRIES: DataSource[] = NETWORK_SOURCES.map((n) => ({
  id: n.id,
  name: n.short.replace(/\s*\(.*\)$/, ''),
  publisher: n.citation.split('.')[0]!.trim(),
  use: 'Thermal networks already running, shown for learning.',
  licence: n.licence,
  attribution: n.citation,
  shareAlike: false,
  vintage: `${/\((\d{4})\)/.exec(n.citation)?.[1] ?? 'Year not stated'}; retrieved ${n.retrieved}.`,
  refresh: n.maintained ? 'Maintained upstream: re-import with npm run import:networks.' : 'Not maintained upstream. Not refreshed.',
  short: `${n.short.replace(/\s*\(.*\)$/, '')} ${/\((\d{4})\)/.exec(n.citation)?.[1] ?? ''}`.trim(),
  delivery: 'generated',
  url: n.url,
  // The importer names each source's CSV after its id.
  files: ['src/site/generated/networks.ts', `data/networks/${n.id}.csv`],
}));

export const DATA_SOURCES: readonly DataSource[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    publisher: 'OpenStreetMap contributors',
    use: 'Building footprints, uses and storeys; heat sources, open space, land use and place names; substations within a mile.',
    licence: 'Open Database Licence (ODbL) 1.0',
    licenceUrl: 'https://www.openstreetmap.org/copyright',
    attribution: '© OpenStreetMap contributors',
    shareAlike: true,
    vintage: 'Read live when a boundary is drawn. A saved project file keeps that copy.',
    refresh: 'Live. The relay keeps an answer for up to 7 days.',
    short: '© OpenStreetMap contributors (ODbL)',
    delivery: 'live',
    url: 'https://www.openstreetmap.org',
    hosts: ['overpass.private.coffee', 'overpass-api.de'],
    files: ['public/tour/mankato.thermal-network.json', 'src/education/generated/tourDesigns.ts'],
  },
  {
    id: 'openfreemap',
    name: 'OpenFreeMap basemap',
    publisher: 'OpenFreeMap, with the OpenMapTiles schema',
    use: 'The map underneath the site.',
    licence: 'OpenMapTiles CC BY 4.0; map data ODbL',
    licenceUrl: 'https://openfreemap.org',
    attribution: 'OpenFreeMap © OpenMapTiles. Data from OpenStreetMap.',
    shareAlike: true,
    vintage: 'Live tiles, as served.',
    refresh: 'Live. Fetched by the browser.',
    short: 'Basemap OpenFreeMap © OpenMapTiles',
    delivery: 'live',
    url: 'https://openfreemap.org',
    hosts: ['tiles.openfreemap.org'],
  },
  {
    id: 'fema-structures',
    name: 'USA Structures',
    publisher: 'FEMA and Oak Ridge National Laboratory',
    use: 'Building footprints where OpenStreetMap has none; occupancy and height.',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'FEMA USA Structures (FEMA, ORNL), CC BY 4.0',
    shareAlike: false,
    vintage: 'Live service. The release is whichever FEMA serves on the day.',
    refresh: 'Live. The relay keeps an answer for up to 7 days.',
    short: 'FEMA USA Structures (CC BY 4.0)',
    delivery: 'live',
    url: 'https://gis-fema.hub.arcgis.com/datasets/fedmaps::usa-structures/about',
    hosts: ['services2.arcgis.com'],
    files: ['tests/fixtures/structures'],
  },
  {
    id: 'nsi',
    name: 'National Structure Inventory',
    publisher: 'U.S. Army Corps of Engineers',
    use: 'Occupancy, storeys and the census block group’s median year built.',
    licence: 'U.S. Government data. No licence is stated.',
    attribution: 'USACE National Structure Inventory',
    shareAlike: false,
    vintage: 'Live API. Its answers name no release. Year built is a block-group median.',
    refresh: 'Live. The relay keeps an answer for up to 7 days.',
    short: 'USACE NSI',
    delivery: 'live',
    url: 'https://www.hec.usace.army.mil/confluence/nsi',
    hosts: ['nsi.sec.usace.army.mil'],
    files: ['tests/fixtures/structures'],
  },
  {
    id: 'open-meteo-weather',
    name: 'Open-Meteo Historical Weather API (ERA5)',
    publisher: 'Open-Meteo, from the Copernicus Climate Change Service ERA5 reanalysis',
    use: 'A year of hourly air temperature, humidity and solar radiation for the site.',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://open-meteo.com/en/licence',
    attribution: 'Weather data by Open-Meteo.com, CC BY 4.0. Contains modified Copernicus Climate Change Service information.',
    shareAlike: false,
    vintage: 'The last full calendar year when the site is drawn. The Site tab prints the year.',
    refresh: 'Live. The relay keeps an answer for up to 30 days.',
    short: 'Weather by Open-Meteo.com (ERA5, Copernicus)',
    delivery: 'live',
    url: 'https://open-meteo.com',
    hosts: ['archive-api.open-meteo.com'],
  },
  {
    id: 'open-meteo-geocoding',
    name: 'Open-Meteo Geocoding API',
    publisher: 'Open-Meteo, from GeoNames',
    use: 'Place search.',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://open-meteo.com/en/licence',
    attribution: 'Place search by Open-Meteo.com, CC BY 4.0, from GeoNames',
    shareAlike: false,
    vintage: 'Live, as served.',
    refresh: 'Live. The relay keeps an answer for up to 30 days.',
    short: 'Place search by Open-Meteo.com',
    delivery: 'live',
    url: 'https://open-meteo.com/en/docs/geocoding-api',
    hosts: ['geocoding-api.open-meteo.com'],
  },
  {
    id: 'census-geocoder',
    name: 'Census Geocoder',
    publisher: 'U.S. Census Bureau',
    use: 'The site’s county, which sets its climate zone and grid region; town and state names.',
    licence: 'U.S. Government work, public domain',
    attribution: 'County from the U.S. Census Bureau geocoder',
    shareAlike: false,
    vintage: 'The current benchmark and vintage (Public_AR_Current, Current_Current).',
    refresh: 'Live. The relay keeps an answer for up to 365 days.',
    short: 'U.S. Census Bureau geocoder',
    delivery: 'live',
    url: 'https://geocoding.geo.census.gov',
    hosts: ['geocoding.geo.census.gov'],
  },
  {
    id: 'nlr-stock',
    name: 'ComStock™ and ResStock™',
    publisher: 'National Laboratory of the Rockies (NLR), for the U.S. Department of Energy',
    use: 'Annual heating, cooling, hot water and refrigeration loads by building type and climate zone, which calibrate the load model; today’s fuels and equipment; the county climate zones.',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution:
      'Data includes information from the ComStock™ and ResStock™ datasets developed by the National Laboratory of the Rockies (NLR) with funding from the U.S. Department of Energy (DOE).',
    shareAlike: false,
    vintage: 'ComStock 2025 Release 3 and ResStock 2025 Release 1, both on AMY2018 weather.',
    refresh: 'Each NLR release: npm run calibrate:extract, then npm run calibrate:fit and npm run geo:counties.',
    short: 'Loads calibrated to NLR ComStock™ 2025 R3 and ResStock™ 2025 R1',
    delivery: 'generated',
    url: 'https://comstock.nlr.gov/page/datasets',
    files: ['data/calibration/targets.json', 'src/loads/generated/calibration.ts', 'src/engine/generated/counties.ts'],
  },
  {
    id: 'nlr-weather',
    name: 'AMY2018 county weather',
    publisher: 'National Laboratory of the Rockies (NLR)',
    use: 'One 2018 weather year per climate zone, the year the building stock was simulated on, for the load calibration.',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'NLR AMY2018 weather, from the ComStock™ and ResStock™ datasets',
    shareAlike: false,
    vintage: 'Calendar year 2018.',
    refresh: 'Fixed to the year the stock was simulated on: npm run calibrate:weather with a new stock release.',
    short: 'NLR AMY2018 weather',
    delivery: 'generated',
    url: 'https://comstock.nlr.gov/page/datasets',
    files: ['data/calibration/weather.json.gz'],
  },
  {
    id: 'cambium',
    name: 'Cambium long-run marginal emission rates',
    publisher: 'National Laboratory of the Rockies (formerly NREL), for the U.S. Department of Energy',
    use: 'Electricity carbon by grid region, month and hour.',
    licence: 'NREL data licence: free use with credit to DOE/NREL/ALLIANCE',
    licenceUrl: 'https://data.nlr.gov/submissions/230',
    attribution: 'Cambium 2023 data courtesy of DOE/NREL/ALLIANCE. Gagnon, P. Long-run Marginal Emission Rates for Electricity — Workbooks for 2023 Cambium Data. NREL, 2024.',
    shareAlike: false,
    vintage: 'Cambium 2023 (published 2024), Mid-case, levelized 2025–2044.',
    refresh: 'Each Cambium release, about yearly: npm run carbon:extract.',
    short: 'Grid carbon NLR Cambium 2023 (DOE/NREL/ALLIANCE)',
    delivery: 'generated',
    url: 'https://data.nlr.gov/submissions/230',
    files: ['src/engine/generated/cambium.ts'],
  },
  {
    id: 'cwns',
    name: 'Clean Watersheds Needs Survey 2022',
    publisher: 'U.S. Environmental Protection Agency',
    use: 'Wastewater treatment plants, their locations and design flows, which set a plant’s heat estimate.',
    licence: 'U.S. Government work, public domain',
    attribution: 'U.S. EPA Clean Watersheds Needs Survey 2022',
    shareAlike: false,
    vintage: 'CWNS 2022, EPA’s national file of September 2026 (2022CWNS_NATIONAL_Sept2026). Flows are design flows, not measured.',
    refresh: 'Each survey, about every four years, and each EPA re-issue: download the national CSVs by hand, then npm run import:cwns -- <zip>.',
    short: 'Wastewater plants EPA CWNS 2022',
    delivery: 'generated',
    url: 'https://www.epa.gov/cwns',
    files: ['public/data/cwns/index.json'],
  },
  {
    id: 'nyc-ll84',
    name: 'NYC Building Energy and Water Data Disclosure (Local Law 84)',
    publisher: 'City of New York, Mayor’s Office of Climate and Environmental Justice, on NYC Open Data',
    use: 'Which buildings in New York City report district steam use: how they are heated today.',
    licence: 'NYC Open Data Terms of Use. No licence is stated on the dataset.',
    licenceUrl: 'https://www.nyc.gov/main/terms-of-use',
    attribution: 'NYC Local Law 84 benchmarking data, NYC Open Data',
    shareAlike: false,
    vintage: 'Live. Each property’s latest report year (calendar years 2022 onward); the Site tab prints the year.',
    refresh: 'Live, in New York City only. The relay keeps an answer for up to 30 days.',
    short: 'District steam NYC LL84',
    delivery: 'live',
    url: 'https://data.cityofnewyork.us/Environment/NYC-Building-Energy-and-Water-Data-Disclosure-for-/5zyy-y8am',
    hosts: ['data.cityofnewyork.us'],
  },
  {
    id: 'epa-factors',
    name: 'GHG Emission Factors Hub, Table 1',
    publisher: 'U.S. Environmental Protection Agency',
    use: 'Carbon per unit of natural gas, propane and fuel oil burned.',
    licence: 'U.S. Government work, public domain',
    attribution: 'US EPA GHG Emission Factors Hub',
    shareAlike: false,
    vintage: 'Three factors typed into engine/carbon.ts. The edition is not recorded.',
    refresh: 'By hand, with the source checked.',
    short: 'Fuel carbon US EPA',
    delivery: 'generated',
    url: 'https://www.epa.gov/climateleadership/ghg-emission-factors-hub',
  },
  ...NETWORK_ENTRIES,
];

export const sourceById = (id: string): DataSource => {
  const s = DATA_SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`No data source "${id}" in the register`);
  return s;
};

/** One attribution line from the register: each source's short name and release. */
export const sourceLine = (ids: readonly string[]): string => ids.map((id) => sourceById(id).short).join(' · ');
