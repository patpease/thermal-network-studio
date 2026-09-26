/**
 * The Learn tab's content: short statements of fact, each with its source.
 *
 * Numbers with a unit are written through the formatters passed in, so a
 * unit switch converts them like every other figure (rule 2). A statement
 * about how THIS tool works cites the tool ("tool") rather than a report.
 */
import { BOREHOLE_PEAK_W } from '../engine/design';
import type { SiteMetrics } from '../engine/demand';
import { minnesotaBalanceBand } from '../engine/bands';
import { BORE_DEFAULTS, FLUID_LIMITS } from '../engine/ground';
import { DEFAULT_BAND } from '../engine/network';
import { TOWER_APPROACH } from '../engine/sources';
import type { Challenge } from '../challenges/challenges';
import { boreholeRoom } from '../site/classify';
import type { Site } from '../site/classify';

export type RefId = 'epri' | 'mn' | 'nlr' | 'cambium' | 'epa' | 'claesson' | 'stull' | 'osm' | 'tool';

export const REFERENCES: Record<RefId, { short: string; full: string; url?: string }> = {
  epri: {
    short: 'EPRI 2024',
    full: 'EPRI. Mapping Heating and Cooling Loads to Assess the Potential of Thermal Energy Networks. Technical Update 3002029431, 2024.',
    url: 'https://restservice.epri.com/publicdownload/000000003002029431/0/Product',
  },
  mn: {
    short: 'Minnesota 2026',
    full: 'Minnesota Department of Commerce. Thermal Energy Network Site Suitability Study. Buro Happold et al., January 2026.',
    url: 'https://www.lrl.mn.gov/docs/2026/mandated/260051.pdf',
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
        { text: 'A thermal energy network connects buildings to a shared water loop. Each building has a heat pump.', refs: ['epri', 'mn'] },
        { text: 'A building that heats takes heat from the loop. A building that cools puts heat into it.', refs: ['epri'] },
        { text: `This tool models an ambient loop held between two temperatures you set. The default is ${f.temperature(DEFAULT_BAND.min)} to ${f.temperature(DEFAULT_BAND.max)}.`, refs: ['tool'] },
        { text: 'Heat the loop cannot supply or remove goes to electric backup and is counted as unmet hours.', refs: ['tool'] },
      ],
    },
    {
      id: 'suitability',
      title: 'Not every location suits a network',
      facts: [
        { text: `Existing networks typically serve ${f.densityRange(50, 150)} of thermal demand.`, refs: ['epri'] },
        { text: 'Minnesota’s study scores a site highest when heating is 80% or less of its thermal demand, and lowest when heating is over 90%.', refs: ['mn'] },
        { text: 'Heat moves between buildings only in hours when some heat and others cool. EPRI’s Framingham study found 1.5% overlap with space conditioning alone.', refs: ['epri'] },
        { text: 'Hot water, data centres, ice rinks and supermarkets add demand in hours that space heating and cooling do not.', refs: ['epri'] },
        { text: 'Bore field access is 15% of Minnesota’s site-suitability weighting, and geology 10%.', refs: ['mn'] },
        { text: 'Data centres, ice rinks, breweries, manufacturing, wastewater plants, supermarkets, lakes, rivers and aquifers are listed as opportunistic thermal resources.', refs: ['mn'] },
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
        { text: `A bore field needs open ground. This tool counts parks, pitches and surface parking from OpenStreetMap at one borehole per ${f.area(BORE_DEFAULTS.spacing ** 2)}.`, refs: ['tool', 'osm'] },
        { text: `An air-source heat pump warms the loop from outdoor air. In this tool it stops below ${f.temperature(-20)}.`, refs: ['tool'] },
        { text: `A cooling tower cools water to ${f.delta(TOWER_APPROACH)} above the wet-bulb temperature.`, refs: ['stull', 'tool'] },
        { text: 'Waste heat gives heat only, while it is warmer than the loop.', refs: ['tool'] },
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
  const band = minnesotaBalanceBand(metrics.heatingShare);
  const found = site.sources.filter((s) => s.exchange !== 'in-load');
  return [
    {
      text: `Thermal demand density here is ${f.density(metrics.densityGWhPerKm2)}. The typical range for networks is ${f.densityRange(50, 150)}.`,
      refs: ['epri'],
    },
    {
      text: `Heating is ${Math.round(metrics.heatingShare * 100)}% of thermal demand here. ${band === 'balanced' ? 'That is in Minnesota’s highest band (80% or less).' : band === 'typical' ? 'That is in Minnesota’s middle band (80–90%).' : 'That is in Minnesota’s lowest band (over 90%).'}`,
      refs: ['mn'],
    },
    { text: `Demand overlap here is ${Math.round(metrics.doc * 100)}%.`, refs: ['epri'] },
    {
      text: `Open space here is ${f.area(site.openSpaceM2)}, room for about ${room.toLocaleString('en-US')} boreholes. A field for the whole peak heat extraction would need about ${needFull.toLocaleString('en-US')}.`,
      refs: ['tool', 'osm'],
    },
    {
      text: found.length ? `${found.length} waste heat or water ${found.length === 1 ? 'source was' : 'sources were'} found within 500 m.` : 'No waste heat or water source was found within 500 m.',
      refs: ['osm', 'mn'],
    },
  ];
}

/** One fact about the drawn site that bears on a challenge, or null. */
export function challengeSiteFact(challenge: Challenge, site: Site, metrics: SiteMetrics): string | null {
  const room = boreholeRoom(site.openSpaceM2);
  const needFull = Math.ceil((metrics.peakHeatingW * 0.72) / BOREHOLE_PEAK_W);
  const found = site.sources.filter((s) => s.exchange !== 'in-load').length;
  const usesGround = challenge.goals.some((g) => g.kind === 'ground-holds' || (g.kind === 'with' && g.sources.includes('bore-field'))) || challenge.id === 'off-the-air';
  if (usesGround) return `This site: open space for about ${room.toLocaleString('en-US')} boreholes; the whole peak heat extraction would need about ${needFull.toLocaleString('en-US')}.`;
  if (challenge.goals.some((g) => g.kind === 'heat-from')) return found ? `This site: ${found} waste heat or water ${found === 1 ? 'source' : 'sources'} within 500 m.` : 'This site: no waste heat or water source within 500 m.';
  return null;
}
