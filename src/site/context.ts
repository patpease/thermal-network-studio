/**
 * The site context panel (D25): Minnesota's eight criteria, filled only where
 * this tool genuinely knows the answer.
 *
 * Information, never a score. No weights, no total, and nothing here reaches
 * the game's score. A criterion the tool cannot know is `known: false` and the
 * panel leaves it BLANK — never a plausible default, because a guessed "good
 * bedrock" is worse than an honest gap.
 *
 * Criteria and their wording: Minnesota Department of Commerce, TEN Site
 * Suitability Study (Jan 2026), Table 3-1 and Table D-1.
 */
import type { SiteMetrics } from '../engine/demand.ts';
import { minnesotaBalanceBand } from '../engine/bands.ts';
import { boreholeRoom } from './classify.ts';
import type { AnchorKind, Site } from './classify.ts';

/**
 * How the panel prints a quantity with its unit. Passed in, so this module
 * never picks a unit system itself — the rule every figure in the suite
 * follows (CLAUDE.md: anything printed with a unit reads LABELS[units]).
 */
export interface Formatters {
  readonly area: (m2: number) => string;
  readonly density: (gwhPerKm2: number) => string;
}

const SI_FORMAT: Formatters = {
  area: (m2) => `${Math.round(m2).toLocaleString('en-US')} m²`,
  density: (d) => `${d.toFixed(0)} GWh/km²·yr`,
};

export interface ContextRow {
  readonly key: string;
  readonly criterion: string;
  readonly known: boolean;
  /** Short statement of what the tool found. Empty when not known. */
  readonly finding: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * The order anchors are listed in. Minnesota's report leads with city halls,
 * libraries, courthouses and schools — the buildings whose owners can commit
 * a neighbourhood — so those come before places of worship.
 */
const ANCHOR_ORDER: readonly AnchorKind[] = ['civic', 'hospital', 'school', 'library', 'community', 'emergency', 'worship'];

export function siteContext(site: Site, metrics: SiteMetrics | null, format: Formatters = SI_FORMAT): readonly ContextRow[] {
  const anchors = site.buildings
    .filter((b) => b.anchor)
    .sort((a, b) => ANCHOR_ORDER.indexOf(a.anchor!) - ANCHOR_ORDER.indexOf(b.anchor!));
  const opportunistic = site.sources.filter((s) => s.exchange !== 'in-load' || s.kind === 'supermarket');
  const room = boreholeRoom(site.openSpaceM2);

  const band = metrics ? minnesotaBalanceBand(metrics.heatingShare) : null;
  const bandWords = { balanced: '80% or less heating', typical: '80–90% heating', 'heating-dominant': 'over 90% heating' } as const;

  return [
    {
      key: 'load-balance',
      criterion: 'Load balance',
      known: metrics !== null,
      finding: metrics && band ? `${pct(metrics.heatingShare)} of thermal demand is heating — ${bandWords[band]}` : '',
    },
    {
      key: 'load-density',
      criterion: 'Load density',
      known: metrics !== null,
      finding: metrics ? `${format.density(metrics.densityGWhPerKm2)} of thermal demand` : '',
    },
    {
      key: 'opportunistic',
      criterion: 'Opportunistic thermal resources',
      known: true,
      finding:
        opportunistic.length === 0
          ? 'None found in OpenStreetMap within 500 m'
          : `${opportunistic.length} found within 500 m: ${[...new Set(opportunistic.map((s) => s.kind.replace('-', ' ')))].join(', ')}`,
    },
    {
      key: 'borefield-space',
      criterion: 'Room for a bore field',
      known: true,
      finding:
        site.openSpaceM2 > 0
          ? `${format.area(site.openSpaceM2)} of parks, pitches and surface parking — room for about ${room.toLocaleString('en-US')} boreholes`
          : 'No parks, pitches or surface parking mapped inside the boundary',
    },
    {
      key: 'barriers',
      criterion: 'Dividing infrastructure',
      known: true,
      finding:
        site.barriers.length === 0
          ? 'No major road, railway or river crosses the boundary'
          : site.barriers.map((b) => `${b.name ?? 'unnamed'} (${b.kind})`).join(', '),
    },
    {
      key: 'anchors',
      criterion: 'Anchor tenants',
      known: true,
      finding:
        anchors.length === 0
          ? 'No civic, school, hospital or community buildings mapped'
          : `${anchors.length}: ${anchors
              .slice(0, 4)
              .map((a) => a.name ?? a.anchor)
              .join(', ')}${anchors.length > 4 ? '…' : ''}`,
    },
    // The rest are Minnesota criteria this tool cannot see. Blank, on purpose.
    { key: 'geology', criterion: 'Bedrock and thermal conductivity', known: false, finding: '' },
    { key: 'hvac', criterion: 'Existing HVAC systems', known: false, finding: '' },
    { key: 'grid', criterion: 'Capacity for electrical demand', known: false, finding: '' },
    { key: 'environment', criterion: 'Wetlands and contamination', known: false, finding: '' },
    { key: 'priority', criterion: 'Priority community', known: false, finding: '' },
    { key: 'ownership', criterion: 'Ownership and coordination', known: false, finding: '' },
  ];
}
