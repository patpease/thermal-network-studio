/**
 * The guided tour's card. Docked over the map on a desk, and above the tab
 * bar on a phone. It only shows a step; the Workspace applies the step's
 * state (tab, design, challenge) and owns entering and leaving the tour.
 */
import { useEffect, useRef, useState } from 'react';

import { TOUR_COPY } from '../config/copy';
import { TOUR_STEPS } from '../education/tour';
import type { TourFormatters } from '../education/tour';

export interface TourCardProps {
  readonly step: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly f: TourFormatters;
  readonly onStep: (step: number) => void;
  readonly onLearn: (section: string) => void;
  readonly onExit: () => void;
}

export function TourCard({ step, loading, error, f, onStep, onLearn, onExit }: TourCardProps) {
  const s = TOUR_STEPS[step]!;
  const last = step === TOUR_STEPS.length - 1;
  const [chosen, setChosen] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // A new step: its question is unanswered, and focus moves to its title.
  useEffect(() => {
    setChosen(null);
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <section className="tour card" aria-labelledby="tour-title" role="dialog" aria-modal="false">
      <p className="tour__count">{TOUR_COPY.count(step + 1, TOUR_STEPS.length)}</p>
      <h2 id="tour-title" className="tour__title" tabIndex={-1} ref={heading}>
        {s.title}
      </h2>
      {error ? (
        <p className="message message--error">{error}</p>
      ) : loading ? (
        <p className="message">{TOUR_COPY.loading}</p>
      ) : (
        <>
          {s.body(f).map((p) => (
            <p key={p} className="tour__text">
              {p}
            </p>
          ))}
          {s.question && (
            <div className="tour__question" role="group" aria-label={s.question.prompt}>
              <p className="tour__prompt">{s.question.prompt}</p>
              <div className="tour__options">
                {s.question.options.map((o, i) => (
                  <button
                    key={o.label}
                    type="button"
                    className={`button button--small${chosen === i ? (o.correct ? ' tour__option--right' : ' tour__option--wrong') : ''}`}
                    aria-pressed={chosen === i}
                    onClick={() => setChosen(i)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {chosen !== null && (
                <p className="tour__response" role="status">
                  {s.question.options[chosen]!.response}
                </p>
              )}
            </div>
          )}
          {s.learn && (
            <button type="button" className="link-button" onClick={() => onLearn(s.learn!)}>
              {TOUR_COPY.learnMore}
            </button>
          )}
        </>
      )}
      <div className="button-row tour__nav">
        <button type="button" className="button" disabled={step === 0 || loading} onClick={() => onStep(step - 1)}>
          {TOUR_COPY.back}
        </button>
        {last ? (
          <button type="button" className="button button--primary" onClick={onExit}>
            {TOUR_COPY.finish}
          </button>
        ) : (
          <button type="button" className="button button--primary" disabled={loading || error !== null} onClick={() => onStep(step + 1)}>
            {TOUR_COPY.next}
          </button>
        )}
        {!last && (
          <button type="button" className="button" onClick={onExit}>
            {TOUR_COPY.exit}
          </button>
        )}
      </div>
    </section>
  );
}
