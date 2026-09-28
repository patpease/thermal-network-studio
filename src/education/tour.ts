/**
 * The guided tour: one worked study of downtown Mankato, from the drawn
 * neighbourhood to a met challenge, in the order a real one goes. Modelled on
 * Psychrometric Studio's walkthrough (education/walkthrough.ts there).
 *
 * Each step declares the WHOLE state it wants — tab, design, challenge — so
 * the steps are cumulative by construction: going back to step 4 restores
 * step 4 exactly, however the player poked at the design in between. The
 * designs are generated (`npm run tour:build`), and tests/tour.test.ts runs
 * each one on the tour's site and checks the claim the step makes about it.
 *
 * Text follows the tool's wording rules (D37): statements of fact, no
 * argument. Temperatures go through the formatters, so the tour reads in the
 * player's units.
 */
import { DEFAULT_BAND } from '../engine/network';
import type { TourDesignId } from './generated/tourDesigns';

export type TourTab = 'site' | 'design' | 'results' | 'learn';

export interface TourFormatters {
  readonly temperature: (c: number) => string;
}

export interface TourQuestion {
  readonly prompt: string;
  readonly options: readonly {
    readonly label: string;
    readonly correct?: boolean;
    /** Shown once chosen; right or wrong, both say something true. */
    readonly response: string;
  }[];
}

export interface TourStep {
  readonly id: string;
  readonly title: string;
  readonly body: (f: TourFormatters) => readonly string[];
  readonly tab: TourTab;
  readonly design: TourDesignId;
  readonly challenge: string | null;
  /** Show the award card (only drawn when the challenge is met). */
  readonly award?: boolean;
  /** The element to bring into view, by id. */
  readonly focus?: string;
  /** A Learn section to offer, by its id in education/learn.ts. */
  readonly learn?: string;
  readonly question?: TourQuestion;
}

export const TOUR_TITLE = 'Take the tour';

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    title: 'A neighbourhood, already drawn',
    tab: 'site',
    design: 'none',
    challenge: null,
    body: () => [
      'This is downtown Mankato, Minnesota, loaded from this tool’s own copy of the data. The tour steps through a full study in the order a real one goes.',
      'Each building gets an hourly heating and cooling load for a year, from its type, size, age and the local weather.',
      'Your own work is put back when the tour ends.',
    ],
  },
  {
    id: 'buildings',
    title: 'Buildings, and where they come from',
    tab: 'site',
    design: 'none',
    challenge: null,
    focus: 'buildings-heading',
    body: () => [
      'Solid buildings have a use recorded in OpenStreetMap. Faint, dashed buildings are guessed: from federal structure data, land use or size.',
      'Tap a building on the map to see where its type came from, and change it if it is wrong.',
    ],
    question: {
      prompt: 'Where do most of these buildings come from?',
      options: [
        { label: 'OpenStreetMap', response: 'OpenStreetMap has few buildings on these blocks. Most come from FEMA USA Structures, with storeys from the National Structure Inventory.' },
        { label: 'FEMA USA Structures', correct: true, response: 'Yes. OpenStreetMap has few buildings on these blocks. FEMA’s footprints fill the gap, and each one is marked guessed.' },
      ],
    },
  },
  {
    id: 'suitability',
    title: 'Does this site suit a network?',
    tab: 'site',
    design: 'none',
    challenge: null,
    focus: 'metrics-heading',
    learn: 'suitability',
    body: () => [
      'Not every site suits a network. The demand card gives the load density, the heating share and how much heating and cooling happen in the same hours.',
      'Here most of the demand is heating, and heating and cooling rarely happen in the same hour. The plant does most of the balancing.',
    ],
    question: {
      prompt: 'Heating is most of the demand. What does that mean for the loop?',
      options: [
        { label: 'Buildings share most of their heat', response: 'Sharing needs heating and cooling in the same hours. Here they rarely coincide.' },
        { label: 'The plant adds heat over the year', correct: true, response: 'Yes. The buildings take more heat from the loop than they give, and the plant adds the difference.' },
        { label: 'Nothing changes', response: 'The balance between heating and cooling decides what plant the loop needs.' },
      ],
    },
  },
  {
    id: 'nearby',
    title: 'Heat nearby, and networks already running',
    tab: 'site',
    design: 'none',
    challenge: null,
    focus: 'sources-heading',
    learn: 'sources',
    body: () => [
      'Heat sources near the boundary are listed: here a river, an ice rink and a brewery. Their capacities are estimates to change on the Design tab.',
      'Thermal networks already running are shown too, for learning. They cannot be connected.',
    ],
  },
  {
    id: 'suggestion',
    title: 'A starting design',
    tab: 'design',
    design: 'suggestion',
    challenge: null,
    focus: 'results-heading',
    body: () => [
      'Suggest a starting design connects the sources found, a bore field sized to the open space, an air-source heat pump and a cooling tower. It is a starting point, not an answer.',
      'Each hour the plant runs in a fixed order: water and waste heat exchangers, then the bore field, then the air-source heat pump or the tower, then electric backup.',
    ],
  },
  {
    id: 'balance',
    title: 'Balancing the loop',
    tab: 'design',
    design: 'suggestion',
    challenge: null,
    focus: 'balance-heading',
    body: () => [
      'The balancing card compares the heat the buildings take from the loop with the heat they give. Here they take more than they give.',
      'Balancing plant is sized for the worst hour, not the year.',
    ],
    question: {
      prompt: 'Which plant can both add heat to the loop and remove it?',
      options: [
        { label: 'A bore field and an air-source heat pump', correct: true, response: 'Yes. A bore field stores heat between seasons; an air-source heat pump heats or cools, one or the other each hour.' },
        { label: 'A cooling tower', response: 'A cooling tower only removes heat.' },
        { label: 'Waste heat', response: 'Waste heat only adds heat, while it is warmer than the loop.' },
      ],
    },
  },
  {
    id: 'ground',
    title: 'The ground over 25 years',
    tab: 'results',
    design: 'suggestion',
    challenge: null,
    focus: 'drift-title',
    body: (f) => [
      'A bore field stores heat between seasons. The chart projects its fluid temperature over 25 years.',
      `This field warms past its upper limit. It takes heat every summer, and with the loop held at ${f.temperature(DEFAULT_BAND.min)} or above it gives little back in winter.`,
    ],
  },
  {
    id: 'colder',
    title: 'A colder loop',
    tab: 'design',
    design: 'colder',
    challenge: null,
    focus: 'loop-heading',
    learn: 'sources',
    body: (f) => [
      `The loop may now fall to ${f.temperature(-1)}. The bore field gives back more heat in winter, and over 25 years it runs far cooler.`,
      `Below ${f.temperature(DEFAULT_BAND.min)} the loop needs antifreeze (glycol), and the flag says so.`,
    ],
  },
  {
    id: 'river',
    title: 'Heat from the river',
    tab: 'design',
    design: 'river',
    challenge: 'waste-not',
    focus: 'challenge-heading',
    body: () => [
      'The river exchanger is raised to 8 MW. River water keeps giving heat through the winter.',
      'At least 15% of the loop’s heat now comes from waste heat or water, with no more than 100 hours to backup: the Waste not challenge is met.',
    ],
  },
  {
    id: 'results',
    title: 'The results',
    tab: 'results',
    design: 'river',
    challenge: 'waste-not',
    focus: 'score-title',
    learn: 'score',
    body: () => [
      'The score is half energy and half carbon, each the reduction on the same buildings as they are today. A score is not a saving.',
      'The charts show where the loop’s heat comes from, the loop temperature through the year, and the heat buildings share.',
    ],
  },
  {
    id: 'grid',
    title: 'The winter electric peak',
    tab: 'results',
    design: 'river',
    challenge: 'waste-not',
    focus: 'grid-title',
    body: () => [
      'The winter peak compares the network with a heat pump in every building. In the coldest hours outdoor-air plant stops and electric backup runs.',
      'Heat that keeps running in the cold, from the ground and the river, lowers the network’s peak.',
    ],
    question: {
      prompt: 'What sets the network’s winter electric peak?',
      options: [
        { label: 'The coldest hours of the year', correct: true, response: 'Yes. Whatever the ground and the river cannot carry in those hours goes to electric backup.' },
        { label: 'The average winter day', response: 'The peak is the single largest hour, in the coldest weather.' },
        { label: 'Summer cooling', response: 'Summer has its own peak. The winter peak comes from heating in the coldest hours.' },
      ],
    },
  },
  {
    id: 'award',
    title: 'A challenge met',
    tab: 'design',
    design: 'final',
    challenge: 'half-carbon',
    award: true,
    focus: 'challenge-heading',
    body: (f) => [
      `An envelope retrofit on every building and a loop down to ${f.temperature(-3)} cut carbon by more than half, with no more than 50 hours to backup: Half the carbon is met.`,
      'The award is an image to post, with the place and the result.',
    ],
  },
  {
    id: 'save',
    title: 'Save, share, learn',
    tab: 'design',
    design: 'final',
    challenge: 'half-carbon',
    focus: 'project-heading',
    learn: 'network',
    body: () => [
      'Save the study as a file and open it later, or copy a link to share it.',
      'The Learn tab has the facts behind every step, with their sources. Draw your own neighbourhood to start.',
    ],
  },
];

/** Every string the tour shows, for the wording test. */
export function tourText(f: TourFormatters): string[] {
  return TOUR_STEPS.flatMap((s) => [
    s.title,
    ...s.body(f),
    ...(s.question ? [s.question.prompt, ...s.question.options.flatMap((o) => [o.label, o.response])] : []),
  ]);
}
