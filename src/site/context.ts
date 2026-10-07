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
import { scaleOf } from '../engine/scale.ts';
import { boreholeRoom } from './classify.ts';
import { SOURCE_SEARCH_M } from './osm.ts';
import type { AnchorKind, Site } from './classify.ts';
import { LL84_MIN_FLOOR_M2 } from './steam.ts';

/**
 * How the panel prints a quantity with its unit. Passed in, so this module
 * never picks a unit system itself — the rule every figure in the suite
 * follows (CLAUDE.md: anything printed with a unit reads LABELS[units]).
 */
export interface Formatters {
  readonly area: (m2: number) => string;
  readonly density: (gwhPerKm2: number) => string;
  /** A distance, in the displayed unit. */
  readonly distance: (m: number) => string;
  /** A network size from tons. */
  readonly size: (tons: number) => string;
}

const SI_FORMAT: Formatters = {
  area: (m2) => `${Math.round(m2).toLocaleString('en-US')} m²`,
  density: (d) => `${d.toFixed(0)} GWh/km²·yr`,
  distance: (m) => `${Math.round(m).toLocaleString('en-US')} m`,
  size: (tons) => `${((tons * 3_516.85) / 1e6).toFixed(2)} MW`,
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
  const federalAnchors = anchors.filter((b) => b.anchorSource === 'fema' || b.anchorSource === 'nsi').length;
  const industrial = site.buildings.filter((b) => b.industrial && b.archetype).length;


  return [
    {
      key: 'load-balance',
      criterion: 'Load balance',
      known: metrics !== null,
      finding: metrics ? `${pct(metrics.heatingShare)} of thermal demand is heating` : '',
    },
    {
      key: 'scale',
      criterion: 'Network size',
      known: metrics !== null,
      finding: metrics ? `${format.size(scaleOf(metrics, site.buildings.filter((b) => b.archetype).length).tons)} peak load` : '',
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
          ? `None found within ${format.distance(SOURCE_SEARCH_M)}`
          : `${opportunistic.length} found within ${format.distance(SOURCE_SEARCH_M)}: ${[...new Set(opportunistic.map((s) => s.kind.replace('-', ' ')))].join(', ')}`,
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
              .join(', ')}${anchors.length > 4 ? '…' : ''}${federalAnchors ? ` · ${federalAnchors} from federal occupancy, not OpenStreetMap` : ''}`,
    },
    ...(site.steam
      ? [
          {
            key: 'steam',
            criterion: 'District steam today',
            known: true,
            finding: `${site.steam.buildings} ${site.steam.buildings === 1 ? 'building reports' : 'buildings report'} district steam use (NYC Local Law 84${site.steam.year ? `, ${site.steam.year}` : ''})${site.steam.unmatched ? `, and ${site.steam.unmatched} more ${site.steam.unmatched === 1 ? 'property' : 'properties'} on no mapped footprint` : ''}. Local Law 84 covers properties over ${format.area(LL84_MIN_FLOOR_M2)}.`,
          },
        ]
      : []),
    {
      key: 'process',
      criterion: 'Possible process loads',
      known: site.structures !== undefined,
      finding:
        industrial === 0
          ? 'No industrial buildings in federal structure data'
          : `${industrial} ${industrial === 1 ? 'building' : 'buildings'} federal structure data calls industrial. Process loads are not modelled.`,
    },
  ];
}
