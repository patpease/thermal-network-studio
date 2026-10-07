/**
 * Learn: how a thermal energy network works, what makes a site suit one, and
 * what each source does — short statements of fact with their sources. When
 * a site is drawn, its own facts come first.
 */
import { LEARN_COPY } from '../config/copy';
import { DATA_SOURCES } from '../config/sources';
import type { SiteMetrics } from '../engine/demand';
import { REFERENCES, sections, siteFacts } from '../education/learn';
import type { Fact, Formatters, RefId } from '../education/learn';
import type { Site } from '../site/classify';
import { M3_PER_MGD } from '../site/wastewater';
import type { UnitSystem } from '../units/units';
import { networkSize, rangeWithUnit, withUnit } from './format';

function formatters(units: UnitSystem): Formatters {
  return {
    temperature: (c) => withUnit('temperature', c, units, 3),
    density: (d) => withUnit('density', d, units),
    densityRange: (lo, hi) => rangeWithUnit('density', lo, hi, units),
    area: (m2) => withUnit('area', m2, units),
    length: (m) => withUnit('length', m, units, 3),
    power: (w) => (w >= 1e6 ? withUnit('powerLarge', w / 1e6, units, 2) : withUnit('power', w, units, 2)),
    delta: (k) => withUnit('temperatureDelta', k, units, 2),
    size: (tons) => networkSize(tons, units),
    distance: (m) => withUnit('distance', m, units, 2),
    intensity: (kind, w) => withUnit(kind, w, units, 3),
    flow: (mgd) => withUnit('waterFlow', mgd * M3_PER_MGD, units, 3),
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
        <li key={f.text} id={f.id} tabIndex={f.id ? -1 : undefined}>
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
        <p className="card__note">{LEARN_COPY.notEndorsed}</p>
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
        <h3 id="learn-data" className="card__subheading">
          {LEARN_COPY.dataSources}
        </h3>
        <p className="card__note">{LEARN_COPY.dataNote}</p>
        <ul className="learn__sources" aria-labelledby="learn-data">
          {DATA_SOURCES.map((s) => (
            <li key={s.id} id={`data-${s.id}`}>
              <p className="learn__source-name">
                <strong>{s.name}</strong> · {s.publisher}{' '}
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  Link
                </a>
              </p>
              <dl className="learn__source-facts">
                <dt>{LEARN_COPY.labels.use}</dt>
                <dd>{s.use}</dd>
                <dt>{LEARN_COPY.labels.licence}</dt>
                <dd>
                  {s.licenceUrl ? (
                    <a href={s.licenceUrl} target="_blank" rel="noopener noreferrer">
                      {s.licence}
                    </a>
                  ) : (
                    s.licence
                  )}
                  {s.shareAlike && <> {LEARN_COPY.labels.shareAlike}</>}
                </dd>
                <dt>{LEARN_COPY.labels.release}</dt>
                <dd>{s.vintage}</dd>
                <dt>{LEARN_COPY.labels.updated}</dt>
                <dd>{s.refresh}</dd>
                <dt>{LEARN_COPY.labels.credit}</dt>
                <dd>{s.attribution}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
