/**
 * The Learn tab's content: short statements of fact, each with its source.
 *
 * Numbers with a unit are written through the formatters passed in, so a
 * unit switch converts them like every other figure (rule 2). A statement
 * about how THIS tool works cites the tool ("tool") rather than a report.
 */
import { BOREHOLE_PEAK_W } from '../engine/design';
import type { SiteMetrics } from '../engine/demand';
import { BORE_DEFAULTS, FLUID_LIMITS } from '../engine/ground';
import { DEFAULT_BAND, GLYCOL_BELOW_C } from '../engine/network';
import { TOWER_APPROACH } from '../engine/sources';
import type { Challenge } from '../challenges/challenges';
import { boreholeRoom, HOME_AVERAGE_HEAT_W, SUPERMARKET_HOMES } from '../site/classify';
import { DESIGN_DIVERSITY } from '../engine/balance';
import { SOURCE_SEARCH_M } from '../site/osm';
import type { Site } from '../site/classify';

export type RefId = 'epri' | 'bdc' | 'heet' | 'vctn' | 'nlr' | 'cambium' | 'epa' | 'claesson' | 'stull' | 'osm' | 'tool';

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
        { text: `HEET’s Massachusetts checklist puts the economies-of-scale point at about 300 tons (${f.power(300 * 3517)}) of shared load, with heating and cooling balanced over the year.`, refs: ['heet'] },
        { text: `Waste heat can serve buildings within about a quarter mile (${f.length(402)}) of its source. Refrigeration heat from one large supermarket can heat about 15–30 nearby homes.`, refs: ['vctn'] },
        { text: 'Buildings on steam heat need a new heating system to connect. Many older homes need an electrical panel upgrade for a heat pump.', refs: ['heet'] },
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
        { text: `An air-source heat pump warms the loop from outdoor air. In this tool it stops below ${f.temperature(-20)}.`, refs: ['tool'] },
        { text: `A cooling tower cools water to ${f.delta(TOWER_APPROACH)} above the wet-bulb temperature.`, refs: ['stull', 'tool'] },
        { text: 'Waste heat gives heat only, while it is warmer than the loop.', refs: ['tool'] },
        { text: `This tool counts a supermarket outside the boundary as heat for ${SUPERMARKET_HOMES} homes: ${f.power(SUPERMARKET_HOMES * HOME_AVERAGE_HEAT_W)}, every hour. Inside the boundary its refrigeration is part of its own load.`, refs: ['vctn', 'tool'] },
        { text: `This tool sizes balancing plant at ${Math.round(DESIGN_DIVERSITY * 100)}% of the worst hour’s net heat to add or remove.`, refs: ['heet', 'tool'] },
        { text: 'A Vancouver ice rink supplies heat and hot water equal to 43 homes from its refrigeration.', refs: ['vctn'] },
        { text: `Residential wastewater leaves buildings at about ${f.temperature(21)}. A wastewater system can be a heat source or a heat sink.`, refs: ['vctn'] },
        { text: 'A Vancouver neighbourhood meets about 70% of its heating and cooling needs with heat recovered from wastewater.', refs: ['vctn'] },
        { text: `Sewer water runs about ${f.temperature(12)} to ${f.temperature(22)} through the year. Lake and river water follow the air a month late and stay above ${f.temperature(4)}.`, refs: ['tool'] },
      ],
    },
    {
      id: 'score',
      title: 'The score',
      facts: [
        { text: 'The score is half energy and half carbon, each the reduction on the same buildings as they are today.', refs: ['tool'] },
        { text: 'Today’s buildings use the regional mix of fuels and equipment in NLR’s building stock data.', refs: ['nlr'] },
        { text: 'Electricity carbon is the long-run marginal rate for the hour, month and region. Fuel carbon uses EPA factors.', refs: ['cambium', 'epa'] },
        { text: 'HEET shows networked geothermal giving a lower winter electric peak than air-source heat pumps or electric resistance heat.', refs: ['heet'] },
        { text: 'The ground over 25 years is shown and not scored. A challenge may require it.', refs: ['tool'] },
        { text: 'Annual loads match NLR’s building stock data. The hour-by-hour shape is this tool’s model.', refs: ['nlr', 'tool'] },
        { text: 'The tool conveys an idea. It does not predict a saving.', refs: ['tool'] },
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
