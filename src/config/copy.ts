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
    'Draw a boundary around a neighbourhood: a campus, a downtown or a few blocks of homes. Buildings come from OpenStreetMap. Each building gets an hourly heating and cooling load for one year.',
  loading: 'Reading buildings from OpenStreetMap, a year of weather, and the local grid…',
  guessedNote:
    'Faint, dashed buildings have a guessed type. OpenStreetMap does not record their use; the type comes from nearby features or building size. Tap a building to change its type.',
  tooMany: (n: number, max: number) =>
    `${n.toLocaleString('en-US')} heated buildings. A network in this tool connects at most ${max}. Draw a smaller area or remove buildings.`,
  none: 'No heated buildings inside that boundary.',
  contextHeading: 'Site context',
  contextNote:
    'Minnesota’s site-suitability criteria, for information. Rows this tool cannot determine are blank. None of these rows affect the score.',
  notKnown: 'Not known to this tool',
  sourcesHeading: 'Heat sources nearby',
  sourcesNote: 'Capacities are estimates. Change them on the Design tab.',
  noSources: 'None found in OpenStreetMap within 500 m. Sources can be added on the Design tab.',
  metricsHeading: 'The demand',
  todayHeading: 'Today, without a network',
  selectedHeading: 'Selected building',
  include: 'Connected to the network',
} as const;

export const DESIGN_COPY = {
  tabSite: 'Site',
  tabDesign: 'Design',
  needSite: 'Draw a neighbourhood first.',
  intro:
    'Connect sources found nearby, add plant and set sizes. The year re-runs after each change. Each building has its own heat pump on the loop. The plant keeps the loop between its minimum and maximum temperature.',
  suggest: 'Suggest a starting design',
  suggestNote: 'Sized from the peak loads. Not optimised.',
  addHeading: 'Add',
  foundHeading: 'Found nearby',
  connect: 'Connect',
  connected: 'Connected',
  builtHeading: 'Your network',
  empty: 'Nothing connected. Without plant, every hour the loop needs heat or cooling goes to electric backup.',
  place: 'Place on map',
  move: 'Move',
  placing: 'Tap the map where it goes.',
  cancelPlacing: 'Cancel',
  remove: 'Remove',
  unplaced: 'Not placed. Position is shown on the map and is not used in the calculation.',
  resultsHeading: 'How it performs',
  scoreNote: 'Half energy, half carbon. Each is the reduction on the same buildings today.',
  noSources: 'Add a source to score the design.',
  driftHeading: 'The ground after 25 years',
  driftNote: 'Not scored. The score uses year one.',
  loopHeading: 'Loop and buildings',
  bandNote: 'The loop is held between these temperatures.',
  retrofitLabel: 'Envelope retrofit, every connected building',
  retrofitNote: 'Applies to the network case only. Business as usual is the buildings as they are today.',
  estimate: 'Estimated from OpenStreetMap.',
} as const;

/** What each kind of source does, as shown on its card. */
export const SOURCE_COPY = {
  'bore-field': 'Stores heat in the ground between seasons. Gives and takes heat.',
  'air-source': 'Warms the loop from outdoor air. Heat only. Output falls as the air gets colder.',
  'cooling-tower': 'Removes loop heat to the air by evaporation. Cooling only. Limited by the wet-bulb temperature.',
  'waste-heat': 'Heat from servers, rink chillers or a brewery. Heat only, while warmer than the loop.',
  water: 'A heat exchanger on a sewer main, a lake or a river. Gives or takes heat, depending on the water temperature.',
} as const;

export const RESULTS_COPY = {
  tab: 'Results',
  needSite: 'Draw a neighbourhood first.',
  needDesign: 'Add a source on the Design tab first.',
  updating: 'Updating…',
  noField: 'No bore field in this design.',
  shapeCaveat:
    'Annual loads are calibrated to NLR ComStock™ and ResStock™. The hour-by-hour shape is this tool’s model and is not checked against them. The tool conveys an idea. It does not predict a saving.',
} as const;

export const CHALLENGE_COPY = {
  heading: 'Challenge',
  label: 'Play',
  sandbox: 'Sandbox — no goals',
  sandboxNote: 'No goals. Pick a challenge to earn an award.',
  met: 'Challenge met',
  notYet: 'Not yet',
  award: 'Get your award',
  runFirst: 'Add a source to see progress.',
  share: 'Copy a link to this design',
  shared: 'Link copied. It holds the boundary, building changes, design and challenge. Buildings are re-read from OpenStreetMap when the link opens.',
  shareFailed: 'Copy failed. Select the link below and copy it.',
} as const;

export const AWARD_COPY = {
  heading: 'Your award',
  placeNote: 'Names come from OpenStreetMap and the US Census. A neighbourhood name appears only where OpenStreetMap has one. Edit before posting.',
  neighbourhood: 'Neighbourhood',
  town: 'Town or city',
  state: 'State',
  preview: 'Award preview',
  download: 'Download the award (PNG)',
  postLabel: 'Post text — edit it before you copy',
  copy: 'Copy the text',
  copied: 'Copied.',
  copyFailed: 'Copy failed. Select the text and copy it.',
  openLinkedIn: 'Open LinkedIn',
  steps: '1. Download the award. 2. Copy the text. 3. Open LinkedIn. 4. Add the image to the post. LinkedIn does not accept images from other sites. This tool uploads nothing.',
  drawing: 'Drawing the award…',
} as const;

export const LEARN_COPY = {
  tab: 'Learn',
  thisSite: 'This site',
  references: 'References',
} as const;
