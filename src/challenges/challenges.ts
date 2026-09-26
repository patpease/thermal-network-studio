/**
 * Challenges: generic goals on any map (D16). A challenge is DATA — a list of
 * goals, each a threshold on something the engine already computes — so a
 * new one is a new record, never new code.
 *
 * A challenge is met when every goal is. The award (D34) is for a met
 * challenge only; sandbox play earns none.
 *
 * Goals may use the 25-year drift (D31): the score never counts it, but a
 * challenge may still demand a field that holds.
 */
import type { Design, DesignSourceKind } from '../engine/design';
import { FLUID_LIMITS } from '../engine/ground';
import type { ScenarioResult } from '../engine/scenario';

export type Goal =
  /** Fractional carbon reduction on business as usual, at least. */
  | { readonly kind: 'carbon-reduction'; readonly atLeast: number }
  /** Hours with anything left to electric backup, at most. */
  | { readonly kind: 'unmet-hours'; readonly atMost: number }
  /** None of these kinds in the design. */
  | { readonly kind: 'without'; readonly sources: readonly DesignSourceKind[] }
  /** At least one of these kinds in the design. */
  | { readonly kind: 'with'; readonly sources: readonly DesignSourceKind[] }
  /** The bore field's fluid inside its design limits for every one of 25 years. */
  | { readonly kind: 'ground-holds' }
  /**
   * Every bore field fits the site's open space (parks, pitches, surface
   * parking at a 6 m grid). Applied to EVERY challenge, not listed per
   * challenge: an award for boreholes under buildings would be a fiction.
   */
  | { readonly kind: 'bores-fit' }
  /** Share of all heat put into the loop that came from these kinds, at least. */
  | { readonly kind: 'heat-from'; readonly sources: readonly DesignSourceKind[]; readonly atLeast: number };

export type ChallengeIcon = 'half-carbon' | 'ground-balance' | 'waste-not' | 'off-the-air';

export interface Challenge {
  readonly id: string;
  readonly title: string;
  /** One sentence: what it asks, in plain words. */
  readonly brief: string;
  /** Why it is worth doing — the idea the award carries. */
  readonly idea: string;
  readonly icon: ChallengeIcon;
  readonly goals: readonly Goal[];
}

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'half-carbon',
    title: 'Half the carbon',
    brief: 'Cut the neighbourhood’s heating and cooling carbon by half, and leave no more than 50 hours to backup.',
    idea: 'A shared loop and heat pumps can halve a neighbourhood’s heating and cooling carbon before anything else changes.',
    icon: 'half-carbon',
    goals: [
      { kind: 'carbon-reduction', atLeast: 0.5 },
      { kind: 'unmet-hours', atMost: 50 },
    ],
  },
  {
    id: 'ground-balance',
    title: 'Ground in balance',
    brief: 'Build a bore field that stays inside its design limits for 25 years, and cut carbon by half.',
    idea: 'The ground is a battery for seasons: give back in summer what you take in winter, and it lasts.',
    icon: 'ground-balance',
    goals: [
      { kind: 'with', sources: ['bore-field'] },
      { kind: 'ground-holds' },
      { kind: 'carbon-reduction', atLeast: 0.5 },
      { kind: 'unmet-hours', atMost: 100 },
    ],
  },
  {
    id: 'waste-not',
    title: 'Waste not',
    brief: 'Take at least 15% of the loop’s heat from waste heat or water — a data centre, a rink, a sewer, a lake or a river — with no more than 100 hours to backup.',
    idea: 'Heat someone else is already throwing away is the cheapest heat there is.',
    icon: 'waste-not',
    goals: [
      { kind: 'heat-from', sources: ['waste-heat', 'water'], atLeast: 0.15 },
      // Without it, a data centre and electric backup for the rest would earn it.
      { kind: 'unmet-hours', atMost: 100 },
    ],
  },
  {
    id: 'off-the-air',
    title: 'Off the air',
    brief: 'No air-source heat pump and no cooling tower: ground, water and waste heat only, with no more than 100 hours to backup.',
    idea: 'A neighbourhood can heat and cool itself from the ground and the water under it, with nothing blowing on the roof.',
    icon: 'off-the-air',
    goals: [
      { kind: 'without', sources: ['air-source', 'cooling-tower'] },
      { kind: 'unmet-hours', atMost: 100 },
    ],
  },
];

export const challengeById = (id: string | null | undefined) => CHALLENGES.find((c) => c.id === id) ?? null;

export interface GoalResult {
  readonly goal: Goal;
  readonly met: boolean;
  /** What the goal asks, in words. */
  readonly asks: string;
  /** Where the design stands, in words; no unit, or a unit-free percentage. */
  readonly now: string;
}

const pct = (f: number) => `${Math.round(f * 100)}%`;

const KIND_WORDS: Record<DesignSourceKind, string> = {
  'bore-field': 'bore field',
  'air-source': 'air-source heat pump',
  'cooling-tower': 'cooling tower',
  'waste-heat': 'waste heat',
  water: 'water exchanger',
};

const list = (kinds: readonly DesignSourceKind[], joiner: string) => kinds.map((k) => KIND_WORDS[k]).join(joiner);

/** Share of heat INTO the loop from sources of these kinds (buildings' own rejection included in the whole). */
export function heatShareFrom(result: ScenarioResult, design: Design, kinds: readonly DesignSourceKind[]): number {
  const n = result.network;
  const into = n.rejectedKWh + Object.values(n.sourceInKWh).reduce((a, v) => a + v, 0);
  if (into <= 0) return 0;
  const ids = new Set(design.sources.filter((s) => kinds.includes(s.kind)).map((s) => s.id));
  let from = 0;
  for (const [id, kWh] of Object.entries(n.sourceInKWh)) if (ids.has(id)) from += kWh;
  return from / into;
}

/** What a challenge needs to know about the site, beyond the result. */
export interface SiteLimits {
  /** Boreholes the open space holds (`boreholeRoom`). */
  readonly boreholeRoom: number;
}

export function evaluateGoal(goal: Goal, result: ScenarioResult, design: Design, limits: SiteLimits): GoalResult {
  const kinds = new Set(design.sources.map((s) => s.kind));
  switch (goal.kind) {
    case 'carbon-reduction': {
      const r = result.score.carbonReduction;
      return { goal, met: r >= goal.atLeast, asks: `Carbon at least ${pct(goal.atLeast)} below today`, now: r >= 0 ? `${pct(r)} below` : `${pct(-r)} above` };
    }
    case 'unmet-hours': {
      const h = result.network.unmetHours;
      return { goal, met: h <= goal.atMost, asks: `No more than ${goal.atMost} hours to backup`, now: `${h.toLocaleString('en-US')} hours` };
    }
    case 'without': {
      const found = goal.sources.filter((k) => kinds.has(k));
      return { goal, met: found.length === 0, asks: `No ${list(goal.sources, ' and no ')}`, now: found.length ? `has ${list(found, ' and ')}` : 'none' };
    }
    case 'with': {
      const found = goal.sources.some((k) => kinds.has(k));
      return { goal, met: found, asks: `A ${list(goal.sources, ' or ')}`, now: found ? 'yes' : 'not yet' };
    }
    case 'ground-holds': {
      const drift = result.network.drift;
      if (!drift || drift.length === 0) return { goal, met: false, asks: 'Ground fluid inside its limits for 25 years', now: 'no bore field' };
      const bad = drift.find((d) => d.minFluid < FLUID_LIMITS.min || d.maxFluid > FLUID_LIMITS.max);
      return { goal, met: !bad, asks: 'Ground fluid inside its limits for 25 years', now: bad ? `leaves them in year ${bad.year}` : 'holds all 25' };
    }
    case 'bores-fit': {
      const n = design.sources.reduce((a, s) => a + (s.kind === 'bore-field' ? s.boreholes : 0), 0);
      return {
        goal,
        met: n <= limits.boreholeRoom,
        asks: `Boreholes fit the open space (about ${limits.boreholeRoom.toLocaleString('en-US')})`,
        now: `${n.toLocaleString('en-US')} boreholes`,
      };
    }
    case 'heat-from': {
      const share = heatShareFrom(result, design, goal.sources);
      return { goal, met: share >= goal.atLeast, asks: `At least ${pct(goal.atLeast)} of the loop’s heat from ${list(goal.sources, ' or ')}`, now: pct(share) };
    }
  }
}

export interface ChallengeResult {
  readonly challenge: Challenge;
  readonly goals: readonly GoalResult[];
  readonly met: boolean;
}

/** Goals every challenge carries whenever the design makes them relevant. */
function universalGoals(design: Design): Goal[] {
  return design.sources.some((s) => s.kind === 'bore-field') ? [{ kind: 'bores-fit' }] : [];
}

export function evaluate(challenge: Challenge, result: ScenarioResult, design: Design, limits: SiteLimits): ChallengeResult {
  const goals = [...challenge.goals, ...universalGoals(design)].map((g) => evaluateGoal(g, result, design, limits));
  return { challenge, goals, met: goals.every((g) => g.met) };
}
