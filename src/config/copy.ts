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

export const DESIGN_COPY = {
  tabSite: 'Site',
  tabDesign: 'Design',
  needSite: 'Draw a neighbourhood first. The design is built for the buildings inside it.',
  intro:
    'Connect what was found nearby, add plant of your own, and size it. The year re-runs as you go. Every building has its own heat pump on the loop; what you build here keeps the loop inside its band.',
  suggest: 'Suggest a starting design',
  suggestNote: 'A first guess sized from the peaks — deliberately not optimised. Improving it is the game.',
  addHeading: 'Add',
  foundHeading: 'Found nearby',
  connect: 'Connect',
  connected: 'Connected',
  builtHeading: 'Your network',
  empty: 'Nothing connected yet. With no plant, every hour the loop needs heat or cooling falls to electric backup.',
  place: 'Place on map',
  move: 'Move',
  placing: 'Tap the map where it goes.',
  cancelPlacing: 'Cancel',
  remove: 'Remove',
  unplaced: 'Not placed yet — its position is for the map only; the physics does not use it.',
  resultsHeading: 'How it performs',
  scoreNote: 'Half energy, half carbon, each as a reduction on business as usual.',
  noSources: 'Add a source to score the design.',
  driftHeading: 'The ground after 25 years',
  driftNote: 'Shown, not scored: year one is what the score counts.',
  loopHeading: 'Loop and buildings',
  bandNote: 'The loop is held between these. A wider band lets the ground do more; a colder loop costs the heat pumps.',
  retrofitLabel: 'Envelope retrofit, every connected building',
  retrofitNote: 'Business as usual stays the buildings as they are today, so a retrofit earns points against what is there now.',
  estimate: 'Estimated from OpenStreetMap — change it if you know better.',
} as const;

export const RESULTS_COPY = {
  tab: 'Results',
  needSite: 'Draw a neighbourhood first.',
  needDesign: 'Build something on the Design tab first — the results are about what you built.',
  updating: 'Updating…',
  noField: 'No bore field in this design, so there is no ground to drift.',
  shapeCaveat:
    'Annual loads are calibrated to NLR ComStock™ and ResStock™; the hour-by-hour shape is this tool’s own model and is not checked against them. The charts convey how the network behaves, not what a real one would save.',
} as const;
