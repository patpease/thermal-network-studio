/**
 * The challenge being played, and where the design stands against it — every
 * goal with a mark and words, never colour alone. When all are met, the
 * award opens.
 */
import { CHALLENGE_COPY } from '../config/copy';
import { CHALLENGES } from '../challenges/challenges';
import type { ChallengeResult } from '../challenges/challenges';
import { ChallengeIcon } from './ChallengeIcon';

export interface ChallengeCardProps {
  readonly challengeId: string | null;
  readonly evaluation: ChallengeResult | null;
  readonly running: boolean;
  readonly onChange: (id: string | null) => void;
  readonly onAward: () => void;
}

export function ChallengeCard({ challengeId, evaluation, running, onChange, onAward }: ChallengeCardProps) {
  const challenge = CHALLENGES.find((c) => c.id === challengeId) ?? null;
  return (
    <section className={`card challenge${evaluation?.met ? ' challenge--met' : ''}`} aria-labelledby="challenge-heading">
      <h2 id="challenge-heading" className="card__heading">
        {CHALLENGE_COPY.heading}
      </h2>
      <label className="field-label" htmlFor="challenge">
        {CHALLENGE_COPY.label}
      </label>
      <select id="challenge" value={challengeId ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        {/* Every value the state can hold is an option (Heat Balance Studio's picker). */}
        <option value="">{CHALLENGE_COPY.sandbox}</option>
        {CHALLENGES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      {!challenge ? (
        <p className="card__note">{CHALLENGE_COPY.sandboxNote}</p>
      ) : (
        <>
          <div className="challenge__head">
            <ChallengeIcon icon={challenge.icon} />
            <p className="card__note">{challenge.brief}</p>
          </div>
          {evaluation ? (
            <ul className="goals" aria-busy={running}>
              {evaluation.goals.map((g, i) => (
                <li key={i} className={g.met ? 'goal goal--met' : 'goal'}>
                  <span className="goal__mark" aria-hidden="true">
                    {g.met ? '✓' : '○'}
                  </span>
                  <span>
                    {g.asks}
                    <span className="muted"> · {g.now}</span>
                    <span className="visually-hidden">{g.met ? ' — met' : ' — not yet met'}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card__note">{CHALLENGE_COPY.runFirst}</p>
          )}
          {evaluation?.met && (
            <div className="challenge__met">
              <p className="challenge__met-label">{CHALLENGE_COPY.met}</p>
              <button type="button" className="button button--primary" onClick={onAward}>
                {CHALLENGE_COPY.award}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
