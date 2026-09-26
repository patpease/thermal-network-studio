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
  body: 'Use to explore how a shared thermal network could work in a neighborhood. Uses first-principle physics and publicly accessible building data. Use it to convey an idea, learn about thermal energy networks and your neighborhood.',
  emphasis: 'Not for a full feasibility study, to learn more find an expert and start a dialog.',
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
  searchPlaceholder: 'Boston, Massachusetts',
  drawButton: 'Draw a neighbourhood',
  redrawButton: 'Draw again',
  finishButton: 'Finish',
  undoButton: 'Undo point',
  cancelButton: 'Cancel',
  drawHint: 'Tap the map to place corners. Press and drag a corner to move it. Tap the first corner, or Finish, to close the boundary.',
  editButton: 'Edit boundary',
  retryButton: 'Try again',
  editHint: 'Press and drag a corner to move it. Done re-reads the buildings inside the new boundary. The design and building changes carry over.',
  doneButton: 'Done',
  intro:
    'Draw a boundary around a neighbourhood: a campus, a downtown or a few blocks of homes. Buildings come from OpenStreetMap. Each building gets an hourly heating and cooling load for one year.',
  loading: 'Reading buildings from OpenStreetMap, a year of weather, and the local grid…',
  guessedNote:
    'Faint, dashed buildings have a guessed type. OpenStreetMap does not record their use; the type comes from nearby features or building size. Tap a building to change its type.',
  tooMany: (n: number, max: number) =>
    `${n.toLocaleString('en-US')} heated buildings. A network in this tool connects at most ${max}. Draw a smaller area or remove buildings.`,
  none: 'No heated buildings inside that boundary.',
  contextHeading: 'Site features',
  contextNote:
    'What this tool finds about the site. None of it affects the score.',
  notKnown: 'Not known to this tool',
  sourcesHeading: 'Heat sources nearby',
  sourcesNote: 'Capacities are estimates. Change them on the Design tab.',
  noSources: (within: string) => `None found in OpenStreetMap within ${within}. Sources can be added on the Design tab.`,
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
  'air-source': 'Warms or cools the loop with outdoor air, one or the other at a time. Gives and takes heat. Stops in extreme cold and heat.',
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
    'Annual loads are calibrated to NLR ComStock™ and ResStock™. The hour-by-hour shape is this tool’s model and is not checked against them. Not for a full feasibility study, to learn more find an expert and start a dialog.',
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
  notEndorsed: 'Sources are cited for the facts taken from them. None of these organizations reviewed or endorses this tool.',
  thisSite: 'This site',
  references: 'References',
} as const;

export const SCALE_COPY = {
  label: 'Network size',
  note: (point: string) => `peak load; ${point} is the recommended minimum`,
  below: (size: string, point: string) => `This network is ${size}, below the recommended minimum size of ${point} of shared, balanced load.`,
  more: (n: number) => `About ${n.toLocaleString('en-US')} more buildings like these would reach it. Edit the boundary or draw a larger one.`,
  at: (size: string, point: string) => `This network is ${size}, at or above the recommended minimum size of ${point}.`,
  edit: 'Edit boundary',
} as const;

export const GLYCOL_COPY = {
  flag: (coldest: string, limit: string, year: number) =>
    year <= 1 ? `Needs glycol. The loop reaches ${coldest}, below ${limit}.` : `Needs glycol from year ${year}. The bore field drifts to ${coldest}, below ${limit}.`,
  learn: 'About glycol',
} as const;

export const BALANCE_COPY = {
  heading: 'Balancing the loop',
  taken: 'Buildings take from the loop',
  given: 'Buildings put into the loop',
  shared: 'Shared between buildings',
  heatingShare: 'Heating share of demand',
  overlap: 'Demand overlap',
  perYear: 'a year',
  netTaken: (x: string) => `The buildings take ${x} a year more than they give. The plant adds the difference.`,
  netGiven: (x: string) => `The buildings give ${x} a year more than they take. The plant removes the difference.`,
  peakAdd: 'Heat to add, design',
  peakRemove: 'Heat to remove, design',
  sizedAt: (pct: string, worst: string) => `${pct} of the worst hour (${worst}), where loads between buildings cancel.`,
  connected: (x: string, pct: string) => `Connected: ${x} (${pct})`,
  addsHeat: 'Adds heat: bore field, air-source heat pump, waste heat, water.',
  removesHeat: 'Removes heat: bore field, air-source heat pump, cooling tower, water.',
  boreBalance: 'A bore field keeps its temperature over the years when the heat it gives and takes in a year are close.',
  boreRate: (x: string) => `Bore fields are counted at ${x} per borehole.`,
} as const;
