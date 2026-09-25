/**
 * Every sentence the tool says, in one place.
 *
 * Components import from here and nowhere else, so editing the prose never
 * means touching a component.
 */

/**
 * Permanent page furniture, never a dismissible modal, and burned into every
 * export from phase 07 — an exported figure reaches people who never saw the
 * page that explained it. ZEEL's framing, and the reason is the same: a score
 * is not a saving.
 */
export const SCOPE_STATEMENT = {
  lead: 'Scope',
  body: 'Explores how a shared thermal network could work. It conveys an idea; it does not predict a saving.',
  emphasis: 'Not for feasibility studies, utility filings or design submissions.',
} as const;

/** The five steps of play, in order. Shown now as the road map for the build. */
export const STEPS = [
  { key: 'neighbourhood', title: 'Pick a neighbourhood', body: 'Draw a boundary on the map. Buildings come from OpenStreetMap.' },
  { key: 'loads', title: 'See the demand', body: 'Each building gets an hourly heating and cooling load for a year.' },
  { key: 'design', title: 'Build the network', body: 'Add bore fields, air-source heat pumps, cooling towers and waste heat.' },
  { key: 'simulate', title: 'Run the year', body: 'Every hour, the loop balances what the buildings take and give.' },
  { key: 'score', title: 'Score it', body: 'Efficiency and carbon, against the buildings as they are today.' },
] as const;

export const COMING_SOON = 'In development. The map arrives in phase 03.';

export const MAP_ATTRIBUTION = '© OpenStreetMap contributors';
