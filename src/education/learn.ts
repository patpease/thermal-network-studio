/**
 * The Learn tab's content: short statements of fact, each with its source.
 *
 * Numbers with a unit are written through the formatters passed in, so a
 * unit switch converts them like every other figure (rule 2). A statement
 * about how THIS tool works cites the tool ("tool") rather than a report.
 */
import { EXISTING_NETWORKS, NETWORK_SOURCES } from '../site/generated/networks';
import { NEARBY_NETWORK_M } from '../site/networks';
import { BOREHOLE_PEAK_W } from '../engine/design';
import type { SiteMetrics } from '../engine/demand';
import { BORE_DEFAULTS, FLUID_LIMITS } from '../engine/ground';
import { DEFAULT_BAND, GLYCOL_BELOW_C } from '../engine/network';
import { TOWER_APPROACH } from '../engine/sources';
import { AIR_SOURCE_LIMITS } from '../engine/heatpumps';
import { BLE } from '../engine/grid';
import type { Challenge } from '../challenges/challenges';
import { SCOPE_STATEMENT } from '../config/copy';
import { boreholeRoom, HOME_AVERAGE_HEAT_W, SUPERMARKET_HOMES, TRANSMISSION_KV } from '../site/classify';
import { DESIGN_DIVERSITY } from '../engine/balance';
import { SCALE_POINT_TONS, scaleOf } from '../engine/scale';
import { RULE_OF_THUMB_W_PER_M2 } from '../engine/ruleOfThumb';
import { RECOVERABLE_DT_K, wastewaterCapacityW } from '../site/wastewater';
import { LL84_MIN_FLOOR_M2 } from '../site/steam';
import { SOURCE_SEARCH_M, SUBSTATION_SEARCH_M } from '../site/osm';
import type { Site } from '../site/classify';

export type RefId = 'epri' | 'bdc' | 'heet' | 'vctn' | 'nlr' | 'cambium' | 'epa' | 'claesson' | 'stull' | 'osm' | 'fema' | 'nsi' | 'cwns' | 'll84' | 'doe-hc' | 'nrel-gdr' | 'idea' | 'tool';

export const REFERENCES: Record<RefId, { short: string; full: string; url?: string }> = {
  epri: {
    short: 'EPRI 2024',
    full: 'EPRI. Mapping Heating and Cooling Loads to Assess the Potential of Thermal Energy Networks. Technical Update 3002029431, 2024.',
    url: 'https://restservice.epri.com/publicdownload/000000003002029431/0/Product',
  },
  bdc: {
    short: 'BDC',
    full: 'Building Decarbonization Coalition. Thermal Energy Networks. Initiative page, 2026.',
    url: 'https://buildingdecarb.org/initiatives/tens',
  },
  heet: {
    short: 'HEET',
    full: 'HEET (Home Energy Efficiency Team). Networked Geothermal Toolkit: Definition of Geothermal Networks (2023); Networked Geothermal Site & Design Considerations (Massachusetts); Understanding Local Geological Assets; Building Stock: What to Look For; Mitigating Future Peaks.',
    url: 'https://heet.org/',
  },
  vctn: {
    short: 'VCTN',
    full: 'Vermont Community Thermal Networks, in the HEET toolkit. Moving Heat; Energy from Wastewater; Thermal Energy Network Opportunities Chart.',
    url: 'https://www.vctn.org/toolkit',
  },
  nlr: {
    short: 'NLR ComStock/ResStock',
    full: 'National Laboratory of the Rockies. ComStock 2025 R3 and ResStock 2025 R1, AMY2018.',
    url: 'https://comstock.nlr.gov/page/datasets',
  },
  cambium: {
    short: 'Cambium 2023',
    full: 'Gagnon, P. Long-run Marginal Emission Rates for Electricity — Workbooks for 2023 Cambium Data. NREL, 2024.',
    url: 'https://data.nlr.gov/submissions/230',
  },
  epa: { short: 'EPA', full: 'US EPA. GHG Emission Factors Hub, Table 1 (stationary combustion).', url: 'https://www.epa.gov/climateleadership/ghg-emission-factors-hub' },
  claesson: { short: 'Claesson & Javed 2011', full: 'Claesson, J. and Javed, S. An analytical method to calculate borehole fluid temperatures for time-scales from minutes to decades. ASHRAE Transactions 117(2), 2011.' },
  stull: { short: 'Stull 2011', full: 'Stull, R. Wet-bulb temperature from relative humidity and air temperature. J. Appl. Meteor. Climatol. 50: 2267–2269, 2011.' },
  osm: { short: 'OpenStreetMap', full: 'OpenStreetMap contributors. Data under the Open Database Licence.', url: 'https://www.openstreetmap.org/copyright' },
  fema: { short: 'FEMA USA Structures', full: 'FEMA and Oak Ridge National Laboratory, USA Structures. CC BY 4.0.', url: 'https://gis-fema.hub.arcgis.com/datasets/fedmaps::usa-structures/about' },
  cwns: {
    short: 'EPA CWNS 2022',
    full: 'U.S. Environmental Protection Agency. Clean Watersheds Needs Survey 2022, national data download (September 2026 file).',
    url: 'https://www.epa.gov/cwns',
  },
  ll84: {
    short: 'NYC LL84',
    full: 'City of New York. NYC Building Energy and Water Data Disclosure for Local Law 84 (Data for Calendar Year 2022–Present). NYC Open Data, dataset 5zyy-y8am.',
    url: 'https://data.cityofnewyork.us/Environment/NYC-Building-Energy-and-Water-Data-Disclosure-for-/5zyy-y8am',
  },
  'doe-hc': {
    short: 'DOE hosting capacity atlas',
    full: 'U.S. Department of Energy. U.S. Atlas of Electric Distribution System Hosting Capacity Maps. Linked here; its data is not part of this tool.',
    url: 'https://www.energy.gov/cmei/vehicles/us-atlas-electric-distribution-system-hosting-capacity-maps',
  },
  nsi: { short: 'National Structure Inventory', full: 'U.S. Army Corps of Engineers, National Structure Inventory.', url: 'https://www.hec.usace.army.mil/confluence/nsi' },
  'nrel-gdr': {
    short: 'NREL GDR 2020',
    full: NETWORK_SOURCES.find((s) => s.id === 'nrel-gdr-1282')!.citation + ' CC BY 4.0.',
    url: 'https://gdr.openei.org/submissions/1282',
  },
  idea: {
    short: 'IDEA',
    full: 'International District Energy Association. District Energy Systems Map: North America, United States and Canada, as of 2015. Linked here; its data is not part of this tool.',
    url: 'https://www.districtenergy.org/resources/resources/system-maps',
  },
  tool: { short: 'This tool', full: 'A modelling choice in this tool. See the source code (MIT).', url: 'https://github.com/patpease/thermal-network-studio' },
};

export interface Formatters {
  readonly temperature: (c: number) => string;
  readonly density: (gwhPerKm2: number) => string;
  readonly densityRange: (lo: number, hi: number) => string;
  readonly area: (m2: number) => string;
  readonly length: (m: number) => string;
  readonly power: (w: number) => string;
  readonly delta: (k: number) => string;
  /** A network size from tons (tons in IP, MW in SI). */
  readonly size: (tons: number) => string;
  /** A distance between places: miles in IP, km in SI. */
  readonly distance: (m: number) => string;
  /** A peak load per floor area, from W/m²: Btu/h·ft² or ft²/ton in IP. */
  readonly intensity: (kind: 'loadIntensity' | 'coolingIntensity', wPerM2: number) => string;
  /** A water flow from MGD, in the displayed unit. */
  readonly flow: (mgd: number) => string;
}

export interface Fact {
  readonly text: string;
  readonly refs: readonly RefId[];
  /** An anchor other screens link to (the glycol flag links to 'learn-glycol'). */
  readonly id?: string;
}

export interface Section {
  readonly id: string;
  readonly title: string;
  readonly facts: readonly Fact[];
}

function existingNetworkFacts(f: Formatters): Fact[] {
  const count = (k: string) => EXISTING_NETWORKS.filter((n) => n.kind === k).length;
  const towns = EXISTING_NETWORKS.filter((n) => n.placement === 'town').length;
  const states = new Set(EXISTING_NETWORKS.map((n) => n.state).filter(Boolean)).size;
  return [
    {
      text: `This tool shows ${count('geothermal-network')} geothermal heat pump networks and ${count('geothermal-district-heating')} geothermal district heating systems running in the United States, in ${states} states.`,
      refs: ['nrel-gdr'],
    },
    { text: 'A geothermal heat pump network shares one ground loop between buildings, each with its own heat pump. Geothermal district heating pipes hot water from underground to buildings.', refs: ['nrel-gdr'] },
    { text: `The Site tab lists those within ${f.distance(NEARBY_NETWORK_M)} of a drawn neighbourhood. They are for learning and cannot be connected.`, refs: ['tool'] },
    { text: `${towns} of the district heating systems have no published location and are drawn at their town, fainter.`, refs: ['nrel-gdr', 'tool'] },
    { text: 'District energy systems also run on steam, hot water and chilled water in many cities and campuses. IDEA maps them across North America.', refs: ['idea'] },
  ];
}

export function sections(f: Formatters): Section[] {
  return [
    {
      id: 'network',
      title: 'A thermal energy network',
      facts: [
        { text: 'A thermal energy network uses underground, water-filled pipes to move heat between buildings and sources such as the ground, lakes, rivers and wastewater.', refs: ['bdc'] },
        { text: 'Each building has a ground-source heat pump on the shared loop.', refs: ['bdc', 'heet'] },
        { text: 'A building that heats takes heat from the loop. A building that cools puts heat into it.', refs: ['epri'] },
        { text: `HEET describes a single closed loop held between about ${f.temperature(4.4)} and ${f.temperature(32.2)}, the range where ground-source heat pumps run most efficiently.`, refs: ['heet'] },
        { text: 'Boreholes store summer heat in the bedrock for use in winter. Part of it dissipates; much of it is available weeks or months later.', refs: ['heet'] },
        { text: 'With load cancelling between buildings, HEET reports systems designed at about 80% of the combined peak load.', refs: ['heet'] },
        { text: 'Thirteen US states have passed thermal energy network legislation, including laws that allow or require utility pilots.', refs: ['bdc'] },
        { text: `This tool models an ambient loop held between two temperatures you set. The default is ${f.temperature(DEFAULT_BAND.min)} to ${f.temperature(DEFAULT_BAND.max)}.`, refs: ['tool'] },
        { text: 'Heat the loop cannot supply or remove goes to electric backup and is counted as unmet hours.', refs: ['tool'] },
      ],
    },
    {
      id: 'suitability',
      title: 'Not every location suits a network',
      facts: [
        { text: `Existing networks typically serve ${f.densityRange(50, 150)} of thermal demand.`, refs: ['epri'] },
        { text: 'Heat moves between buildings only in hours when some heat and others cool. EPRI’s Framingham study found 1.5% overlap with space conditioning alone.', refs: ['epri'] },
        { text: 'Hot water, data centres, ice rinks and supermarkets add demand in hours that space heating and cooling do not.', refs: ['epri'] },
        { text: 'Mixing buildings that cool with buildings that heat — an office beside homes — raises system efficiency and shrinks the bore field.', refs: ['heet'] },
        { text: `HEET’s Massachusetts checklist puts the economies-of-scale point at about ${f.size(SCALE_POINT_TONS)} of shared load, with heating and cooling balanced over the year, and advises that minimum. The Site and Design tabs show it as the recommended minimum size.`, refs: ['heet'] },
        { text: `Waste heat can serve buildings within about a quarter mile (${f.length(402)}) of its source. Refrigeration heat from one large supermarket can heat about 15–30 nearby homes.`, refs: ['vctn'] },
        { text: 'Buildings on steam heat need a new heating system to connect. Many older homes need an electrical panel upgrade for a heat pump.', refs: ['heet'] },
        {
          text: `In New York City, this tool outlines in orange the buildings that report district steam use under Local Law 84, in each property's latest year. Local Law 84 covers properties over ${f.area(LL84_MIN_FLOOR_M2)}; a smaller building on steam is not marked. The flag does not change any load or the score.`,
          refs: ['ll84', 'tool'],
        },
        { text: 'HEET lists weatherization — air sealing and insulation — as an essential part of electrification.', refs: ['heet'] },
        { text: 'Planned street works, repaving and leak-prone gas mains lower the cost of installing a loop. This tool does not see them.', refs: ['heet', 'tool'] },
        { text: 'Bedrock depth, groundwater, well yield and contaminated sites affect drilling. This tool does not see them.', refs: ['heet', 'tool'] },
        { text: `This tool looks for data centres, ice rinks, breweries, food processing, wastewater plants, supermarkets, lakes and rivers within ${f.length(SOURCE_SEARCH_M)} of the boundary.`, refs: ['tool', 'osm'] },
        { text: 'A challenge can be impossible at a given site. A dense downtown may lack open ground for a bore field; a site with no waste heat or water nearby cannot take heat from them.', refs: ['tool'] },
      ],
    },
    {
      id: 'sources',
      title: 'What you can connect',
      facts: [
        { text: `A bore field stores heat in the ground between seasons. This tool places boreholes ${f.length(BORE_DEFAULTS.spacing)} apart, ${f.length(BORE_DEFAULTS.depth)} deep, in ground of conductivity ${BORE_DEFAULTS.conductivity} W/m·K.`, refs: ['tool', 'claesson'] },
        { text: `Bore field fluid is held between ${f.temperature(FLUID_LIMITS.min)} and ${f.temperature(FLUID_LIMITS.max)} in this tool.`, refs: ['tool'] },
        { text: `At about ${f.power(BOREHOLE_PEAK_W)} per borehole at peak, a field of 100 boreholes gives about ${f.power(100 * BOREHOLE_PEAK_W)}.`, refs: ['tool'] },
        { text: `Boreholes run about ${f.length(61)} to ${f.length(213)} deep, as close as ${f.length(6.1)} apart, and can sit in streets or parking lots.`, refs: ['heet'] },
        { id: 'learn-glycol', text: `A loop colder than ${f.temperature(GLYCOL_BELOW_C)} needs antifreeze (glycol). Glycol adds installation and maintenance cost. Plain-water systems operate in Canada.`, refs: ['heet'] },
        { text: `HEET’s horizontal loop runs in the street below the frost line, where the ground is typically ${f.temperature(10)} to ${f.temperature(15)}. This tool does not model the pipes or their exchange with the ground.`, refs: ['heet', 'tool'] },
        { text: `A bore field needs open ground. This tool counts parks, pitches and surface parking from OpenStreetMap at one borehole per ${f.area(BORE_DEFAULTS.spacing ** 2)}.`, refs: ['tool', 'osm'] },
        { text: `An air-source heat pump warms or cools the loop with outdoor air, one or the other at a time. In this tool it heats down to ${f.temperature(AIR_SOURCE_LIMITS.min)} and cools up to ${f.temperature(AIR_SOURCE_LIMITS.max)}.`, refs: ['tool'] },
        { text: 'In cooling hours this tool runs a cooling tower first and the air-source heat pump for the rest. A tower uses less electricity.', refs: ['tool'] },
        { text: `A cooling tower cools water to ${f.delta(TOWER_APPROACH)} above the wet-bulb temperature.`, refs: ['stull', 'tool'] },
        { text: 'Waste heat gives heat only, while it is warmer than the loop.', refs: ['tool'] },
        { text: `This tool counts a supermarket outside the boundary as heat for ${SUPERMARKET_HOMES} homes: ${f.power(SUPERMARKET_HOMES * HOME_AVERAGE_HEAT_W)}, every hour. Inside the boundary its refrigeration is part of its own load.`, refs: ['vctn', 'tool'] },
        { text: `This tool sizes balancing plant at ${Math.round(DESIGN_DIVERSITY * 100)}% of the worst hour’s net heat to add or remove, the figure HEET reports for networks where loads cancel.`, refs: ['heet', 'tool'] },
        { text: 'A Vancouver ice rink supplies heat and hot water equal to 43 homes from its refrigeration.', refs: ['vctn'] },
        { text: `Residential wastewater leaves buildings at about ${f.temperature(21)}. A wastewater system can be a heat source or a heat sink.`, refs: ['vctn'] },
        { text: 'A Vancouver neighbourhood meets about 70% of its heating and cooling needs with heat recovered from wastewater.', refs: ['vctn'] },
        {
          text: `This tool finds wastewater treatment plants in OpenStreetMap and in EPA’s Clean Watersheds Needs Survey 2022, with each plant’s design flow. A plant’s heat is its flow cooled by ${f.delta(RECOVERABLE_DT_K)}: 1 MGD (${f.flow(1)}) gives about ${f.power(wastewaterCapacityW(1))}.`,
          refs: ['cwns', 'tool'],
        },
        { text: 'Design flow is the flow a plant is built to treat. Measured flows are reported to EPA separately and are usually lower.', refs: ['cwns'] },
        { text: `Sewer water runs about ${f.temperature(12)} to ${f.temperature(22)} through the year. Lake and river water follow the air a month late and stay above ${f.temperature(4)}.`, refs: ['tool'] },
      ],
    },
    {
      id: 'existing',
      title: 'Networks already running',
      facts: existingNetworkFacts(f),
    },
    {
      id: 'score',
      title: 'The score',
      facts: [
        { text: 'The score is half energy and half carbon, each the reduction on the same buildings as they are today.', refs: ['tool'] },
        { text: 'Today’s buildings use the regional mix of fuels and equipment in NLR’s building stock data.', refs: ['nlr'] },
        { text: 'Electricity carbon is the long-run marginal rate for the hour, month and region. Fuel carbon uses EPA factors.', refs: ['cambium', 'epa'] },
        { text: 'HEET shows networked geothermal giving a lower winter electric peak than air-source heat pumps or electric resistance heat.', refs: ['heet'] },
        { text: `Building-level electrification (BLE) puts an air-source heat pump in each building. In this tool its heating COP follows outdoor air, with resistance heat below ${f.temperature(BLE.resistanceBelow)}, and hot water comes from a heat pump water heater at COP ${BLE.dhwCop}.`, refs: ['tool'] },
        { text: 'The winter electric peak is the largest hour of electricity from December to February. The Results tab compares the network (TEN) with BLE on the same loads. It is not scored.', refs: ['tool'] },
        { text: `After a boundary is drawn, the Site tab lists the substations OpenStreetMap maps within ${f.distance(SUBSTATION_SEARCH_M)}, with their voltage where recorded. They do not change any load or the score.`, refs: ['osm', 'tool'] },
        { text: `A substation's type is its OpenStreetMap substation tag, such as transmission or distribution. Where that is missing, its highest voltage sets the class: ${TRANSMISSION_KV} kV and above is transmission voltage.`, refs: ['osm', 'tool'] },
        { text: 'OpenStreetMap does not map every substation, and often records no voltage.', refs: ['osm'] },
        { text: 'A utility’s hosting capacity map shows the load or generation a substation or circuit can take without upgrades. DOE’s atlas lists the published maps by state and utility.', refs: ['doe-hc'] },
        { text: 'In the coldest hours a network uses the plant that still runs. Heat left to electric backup adds to its winter peak.', refs: ['tool'] },
        { text: 'The ground over 25 years is shown and not scored. A challenge may require it.', refs: ['tool'] },
        { text: 'Annual loads match NLR’s building stock data. The hour-by-hour shape is this tool’s model.', refs: ['nlr', 'tool'] },
        {
          text: `The Site tab compares a selected building’s peak hour with rules of thumb: ${f.intensity('coolingIntensity', RULE_OF_THUMB_W_PER_M2.cooling)} for cooling and ${f.intensity('loadIntensity', RULE_OF_THUMB_W_PER_M2.heating)} for heating, the same for every building type. A peak is one hour, not an annual total. A rule of thumb is a check on a calculated load, not a design value.`,
          refs: ['tool'],
        },
        { text: 'Where OpenStreetMap has no building, this tool adds the footprints in FEMA USA Structures. Where OpenStreetMap records no use or storeys, it takes them from the National Structure Inventory, else from FEMA.', refs: ['osm', 'fema', 'nsi', 'tool'] },
        { text: 'Where OpenStreetMap names no school, hospital, civic, emergency or worship building, this tool takes it from FEMA USA Structures, then the National Structure Inventory. Buildings either calls industrial are listed as possible process loads and not modelled.', refs: ['fema', 'nsi', 'tool'] },
        { text: 'The National Structure Inventory gives each structure the median year built of its census block group, not its own. This tool uses it as a guessed age.', refs: ['nsi', 'tool'] },
        { text: `${SCOPE_STATEMENT.body} ${SCOPE_STATEMENT.emphasis}`, refs: ['tool'] },
      ],
    },
  ];
}

/** Facts about the site that is drawn, against the same references. */
export function siteFacts(site: Site, metrics: SiteMetrics, f: Formatters): Fact[] {
  const room = boreholeRoom(site.openSpaceM2);
  const needFull = Math.ceil((metrics.peakHeatingW * 0.72) / BOREHOLE_PEAK_W);
  const found = site.sources.filter((s) => s.exchange !== 'in-load');
  return [
    {
      text: `Thermal demand density here is ${f.density(metrics.densityGWhPerKm2)}. The typical range for networks is ${f.densityRange(50, 150)}.`,
      refs: ['epri'],
    },
    {
      text: `Heating is ${Math.round(metrics.heatingShare * 100)}% of heating plus cooling demand here.`,
      refs: ['epri'],
    },
    { text: `Demand overlap here is ${Math.round(metrics.doc * 100)}%.`, refs: ['epri'] },
    (() => {
      const scale = scaleOf(metrics, site.buildings.filter((b) => b.archetype).length);
      return {
        text: scale.belowPoint
          ? `Peak load here is ${f.size(scale.tons)}, below HEET’s economies-of-scale point of ${f.size(SCALE_POINT_TONS)}.`
          : `Peak load here is ${f.size(scale.tons)}, at or above HEET’s economies-of-scale point of ${f.size(SCALE_POINT_TONS)}.`,
        refs: ['heet'] as RefId[],
      };
    })(),
    {
      text: `Open space here is ${f.area(site.openSpaceM2)}, room for about ${room.toLocaleString('en-US')} boreholes. A field for the whole peak heat extraction would need about ${needFull.toLocaleString('en-US')}.`,
      refs: ['tool', 'osm'],
    },
    {
      text: found.length
        ? `${found.length} waste heat or water ${found.length === 1 ? 'source was' : 'sources were'} found within ${f.length(SOURCE_SEARCH_M)}.`
        : `No waste heat or water source was found within ${f.length(SOURCE_SEARCH_M)}.`,
      refs: ['osm', 'tool'],
    },
  ];
}

/** One fact about the drawn site that bears on a challenge, or null. */
export function challengeSiteFact(challenge: Challenge, site: Site, metrics: SiteMetrics, distance: (m: number) => string): string | null {
  const room = boreholeRoom(site.openSpaceM2);
  const needFull = Math.ceil((metrics.peakHeatingW * 0.72) / BOREHOLE_PEAK_W);
  const found = site.sources.filter((s) => s.exchange !== 'in-load').length;
  const usesGround = challenge.goals.some((g) => g.kind === 'ground-holds' || (g.kind === 'with' && g.sources.includes('bore-field'))) || challenge.id === 'off-the-air';
  if (usesGround) return `This site: open space for about ${room.toLocaleString('en-US')} boreholes; the whole peak heat extraction would need about ${needFull.toLocaleString('en-US')}.`;
  if (challenge.goals.some((g) => g.kind === 'heat-from')) return found
      ? `This site: ${found} waste heat or water ${found === 1 ? 'source' : 'sources'} within ${distance(SOURCE_SEARCH_M)}.`
      : `This site: no waste heat or water source within ${distance(SOURCE_SEARCH_M)}.`;
  return null;
}
