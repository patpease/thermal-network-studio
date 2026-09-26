/**
 * Learn: how a thermal energy network works, what makes a site suit one, and
 * what each source does — short statements of fact with their sources. When
 * a site is drawn, its own facts come first.
 */
import { LEARN_COPY } from '../config/copy';
import type { SiteMetrics } from '../engine/demand';
import { REFERENCES, sections, siteFacts } from '../education/learn';
import type { Fact, Formatters, RefId } from '../education/learn';
import type { Site } from '../site/classify';
import type { UnitSystem } from '../units/units';
import { rangeWithUnit, withUnit } from './format';

function formatters(units: UnitSystem): Formatters {
  return {
    temperature: (c) => withUnit('temperature', c, units, 3),
    density: (d) => withUnit('density', d, units),
    densityRange: (lo, hi) => rangeWithUnit('density', lo, hi, units),
    area: (m2) => withUnit('area', m2, units),
    length: (m) => withUnit('length', m, units, 3),
    power: (w) => (w >= 1e6 ? withUnit('powerLarge', w / 1e6, units, 2) : withUnit('power', w, units, 2)),
    delta: (k) => withUnit('temperatureDelta', k, units, 2),
  };
}

function Refs({ refs }: { refs: readonly RefId[] }) {
  return (
    <span className="learn__refs">
      {refs.map((r) => (
        <a key={r} href={`#ref-${r}`} className="learn__ref">
          {REFERENCES[r].short}
        </a>
      ))}
    </span>
  );
}

function Facts({ facts }: { facts: readonly Fact[] }) {
  return (
    <ul className="learn__facts">
      {facts.map((f) => (
        <li key={f.text}>
          {f.text} <Refs refs={f.refs} />
        </li>
      ))}
    </ul>
  );
}

export function LearnPanel({ site, metrics, units }: { site: Site | null; metrics: SiteMetrics | null; units: UnitSystem }) {
  const f = formatters(units);
  return (
    <div className="panel-body learn">
      {site && metrics && (
        <section className="card" aria-labelledby="learn-site">
          <h2 id="learn-site" className="card__heading">
            {LEARN_COPY.thisSite}
          </h2>
          <Facts facts={siteFacts(site, metrics, f)} />
        </section>
      )}
      {sections(f).map((s) => (
        <section key={s.id} className="card" aria-labelledby={`learn-${s.id}`}>
          <h2 id={`learn-${s.id}`} className="card__heading">
            {s.title}
          </h2>
          <Facts facts={s.facts} />
        </section>
      ))}
      <section className="card" aria-labelledby="learn-refs">
        <h2 id="learn-refs" className="card__heading">
          {LEARN_COPY.references}
        </h2>
        <ol className="learn__references">
          {(Object.keys(REFERENCES) as RefId[]).map((r) => (
            <li key={r} id={`ref-${r}`}>
              <strong>{REFERENCES[r].short}.</strong> {REFERENCES[r].full}{' '}
              {REFERENCES[r].url && (
                <a href={REFERENCES[r].url} target="_blank" rel="noopener noreferrer">
                  Link
                </a>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
