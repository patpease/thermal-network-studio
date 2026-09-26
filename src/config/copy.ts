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

/** The five steps of play, in order. */
export const STEPS = [
  { key: 'neighbourhood', title: 'Pick a neighbourhood', body: 'Draw a boundary on the map. Buildings come from OpenStreetMap.' },
  { key: 'loads', title: 'See the demand', body: 'Each building gets an hourly heating and cooling load for a year.' },
  { key: 'design', title: 'Build the network', body: 'Add bore fields, air-source heat pumps, cooling towers and waste heat.' },
  { key: 'simulate', title: 'Run the year', body: 'Every hour, the loop balances what the buildings take and give.' },
  { key: 'score', title: 'Score it', body: 'Efficiency and carbon, against the buildings as they are today.' },
] as const;

export const MAP_ATTRIBUTION = '© OpenStreetMap contributors';

/** The map screen. */
export const MAP_COPY = {
  searchLabel: 'Find a place',
  searchPlaceholder: 'Mankato, Minnesota',
  drawButton: 'Draw a neighbourhood',
  redrawButton: 'Draw again',
  finishButton: 'Finish',
  undoButton: 'Undo point',
  cancelButton: 'Cancel',
  drawHint: 'Tap the map to place corners. Tap the first corner, or Finish, to close it.',
  intro:
    'Draw around a neighbourhood — a campus, a downtown, a few blocks of homes. Buildings come from OpenStreetMap; each gets an hourly heating and cooling load for a year.',
  loading: 'Reading buildings from OpenStreetMap, a year of weather, and the local grid…',
  guessedNote:
    'Faint, dashed buildings are guessed: OpenStreetMap did not say what they are, so the type came from their surroundings or size. Tap one to correct it.',
  tooMany: (n: number, max: number) =>
    `${n.toLocaleString('en-US')} heated buildings — a network connects at most ${max}. Draw a smaller area, or take some out.`,
  none: 'No heated buildings inside that boundary.',
  contextHeading: 'Site context',
  contextNote:
    'Minnesota’s site-suitability criteria, for information. Filled only where this tool can know the answer; the rest is left blank rather than guessed. None of it affects the score.',
  notKnown: 'Not known to this tool',
  sourcesHeading: 'Heat sources nearby',
  sourcesNote: 'Capacities are first estimates. You can change them when you design the network.',
  noSources: 'None found in OpenStreetMap within 500 m. You can still place them yourself.',
  metricsHeading: 'The demand',
  todayHeading: 'Today, without a network',
  selectedHeading: 'Selected building',
  include: 'Connected to the network',
} as const;
