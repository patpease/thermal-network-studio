/**
 * The panel beside the map: find a place, draw, and read what was found.
 *
 * Progressive depth (D7): the story first — how many buildings, how the
 * demand is shaped, what is nearby — and the numbers under it. Everything
 * printed with a unit goes through format.ts.
 */
import { useState } from 'react';

import { MAP_COPY } from '../config/copy';
import { ARCHETYPES } from '../loads/archetypes';
import type { ArchetypeId } from '../loads/archetypes';
import { minnesotaBalanceBand } from '../engine/bands';
import type { Place } from '../relay/relay';
import { MAX_BUILDINGS } from '../site/classify';
import type { SiteBuilding } from '../site/classify';
import { siteContext } from '../site/context';
import { connected, effective } from '../site/neighbourhood';
import type { UnitSystem } from '../units/units';
import { percent, rangeWithUnit, sig, tonnes, withUnit } from './format';
import { draftArea } from './useSite';
import type { SiteState } from './useSite';

export interface SitePanelProps {
  readonly state: SiteState;
  readonly units: UnitSystem;
  readonly selectedId: string | null;
  readonly onFly: (place: Place) => void;
  readonly onDraw: () => void;
  readonly onFinish: () => void;
  readonly onUndo: () => void;
  readonly onCancel: () => void;
  readonly onToggle: (id: string) => void;
  readonly onOverride: (id: string, archetype: ArchetypeId | null) => void;
}

function PlaceSearch({ onFly }: { onFly: (p: Place) => void }) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setError(null);
    try {
      const response = await fetch(`/api/place?q=${encodeURIComponent(query)}`);
      const body = (await response.json()) as { places?: Place[]; message?: string };
      if (!response.ok) throw new Error(body.message ?? 'The search failed.');
      setPlaces(body.places ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault();
        void search();
      }}
    >
      <label htmlFor="place" className="field-label">
        {MAP_COPY.searchLabel}
      </label>
      <div className="search__row">
        <input id="place" value={query} placeholder={MAP_COPY.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className="button">
          Go
        </button>
      </div>
      {error && <p className="message message--error">{error}</p>}
      {places && places.length === 0 && <p className="message">No US place by that name.</p>}
      {places && places.length > 0 && (
        // Every match, never silently the first (Heat Balance Studio's lesson).
        <ul className="search__results">
          {places.map((p) => (
            <li key={`${p.latitude},${p.longitude}`}>
              <button type="button" className="link-button" onClick={() => onFly(p)}>
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string | undefined }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value numeric">{value}</span>
      {note && <span className="stat__note">{note}</span>}
    </div>
  );
}

function SelectedBuilding({ b, excluded, onToggle, onOverride, units }: { b: SiteBuilding; excluded: boolean; onToggle: () => void; onOverride: (a: ArchetypeId | null) => void; units: UnitSystem }) {
  return (
    <section className="card" aria-labelledby="selected-heading">
      <h2 id="selected-heading" className="card__heading">
        {MAP_COPY.selectedHeading}
      </h2>
      <p className="card__title">{b.name ?? 'Unnamed building'}</p>
      <label className="field-label" htmlFor="archetype">
        Type
      </label>
      <select id="archetype" value={b.archetype ?? ''} onChange={(e) => onOverride(e.target.value === '' ? null : (e.target.value as ArchetypeId))}>
        {/* A value that matches no option would render as the FIRST option
            (Heat Balance Studio's building picker); "not heated" is listed. */}
        <option value="">Not heated</option>
        {ARCHETYPES.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      <p className="card__note">
        {b.archetypeGuessed ? 'Guessed: ' : ''}
        {b.reason}. {b.levels} {b.levels === 1 ? 'storey' : 'storeys'}
        {b.levelsGuessed ? ' (guessed)' : ''}, {withUnit('area', b.floorArea, units)} conditioned.
      </p>
      {b.archetype && (
        <label className="check">
          <input type="checkbox" checked={!excluded} onChange={onToggle} /> {MAP_COPY.include}
        </label>
      )}
    </section>
  );
}

export function SitePanel(props: SitePanelProps) {
  const { state, units } = props;
  const { site, result, place, selection } = state;

  const buildings = site ? connected(site, selection) : [];
  const guessed = buildings.filter((b) => b.archetypeGuessed).length;
  const floor = buildings.reduce((s, b) => s + b.floorArea, 0);
  const selected = site && props.selectedId ? site.buildings.find((b) => b.id === props.selectedId) : undefined;
  const metrics = result?.site ?? null;
  const band = metrics ? minnesotaBalanceBand(metrics.heatingShare) : null;

  return (
    <div className="panel-body">
      <PlaceSearch onFly={props.onFly} />

      <section className="card">
        {state.phase === 'drawing' ? (
          <>
            <p className="card__note">{MAP_COPY.drawHint}</p>
            <p className="numeric">
              {state.draft.length} {state.draft.length === 1 ? 'corner' : 'corners'}
              {state.draft.length >= 3 && ` · ${withUnit('area', draftArea(state.draft), units)}`}
            </p>
            <div className="button-row">
              <button type="button" className="button button--primary" disabled={state.draft.length < 3} onClick={props.onFinish}>
                {MAP_COPY.finishButton}
              </button>
              <button type="button" className="button" disabled={state.draft.length === 0} onClick={props.onUndo}>
                {MAP_COPY.undoButton}
              </button>
              <button type="button" className="button" onClick={props.onCancel}>
                {MAP_COPY.cancelButton}
              </button>
            </div>
          </>
        ) : (
          <>
            {!site && <p className="card__note">{MAP_COPY.intro}</p>}
            <button type="button" className="button button--primary" onClick={props.onDraw}>
              {site || state.boundary ? MAP_COPY.redrawButton : MAP_COPY.drawButton}
            </button>
          </>
        )}
        {state.message && <p className="message message--error">{state.message}</p>}
        {state.phase === 'loading' && <p className="message">{MAP_COPY.loading}</p>}
      </section>

      {site && place && (
        <>
          <section className="card" aria-labelledby="buildings-heading">
            <h2 id="buildings-heading" className="card__heading">
              {place.county} · climate zone {place.zone} · {place.region.replace('_', ' ')} grid
            </h2>
            <div className="stats">
              <Stat label="Buildings connected" value={buildings.length.toLocaleString('en-US')} note={guessed ? `${guessed} guessed` : undefined} />
              <Stat label="Conditioned floor" value={withUnit('area', floor, units)} />
            </div>
            {buildings.length > MAX_BUILDINGS && <p className="message message--error">{MAP_COPY.tooMany(buildings.length, MAX_BUILDINGS)}</p>}
            {buildings.length === 0 && <p className="message">{MAP_COPY.none}</p>}
            {guessed > 0 && <p className="card__note">{MAP_COPY.guessedNote}</p>}
          </section>

          {selected && (
            <SelectedBuilding
              b={effective(selected, selection)}
              excluded={selection.excluded.has(selected.id)}
              onToggle={() => props.onToggle(selected.id)}
              onOverride={(a) => props.onOverride(selected.id, a)}
              units={units}
            />
          )}

          {metrics && result && (
            <section className="card" aria-labelledby="metrics-heading">
              <h2 id="metrics-heading" className="card__heading">
                {MAP_COPY.metricsHeading}
              </h2>
              <div className="stats">
                <Stat label="Heating" value={withUnit('energyLarge', metrics.heatingKWh / 1000, units)} note="space + hot water, a year" />
                <Stat label="Cooling" value={withUnit('energyLarge', metrics.coolingKWh / 1000, units)} note="space + refrigeration" />
                <Stat
                  label="Heating share"
                  value={percent(metrics.heatingShare)}
                  note={band === 'balanced' ? 'Minnesota: 80% or less — balanced' : band === 'typical' ? 'Minnesota: 80–90% — typical' : 'Minnesota: over 90% — heating-dominant'}
                />
                <Stat label="Demand overlap (DOC)" value={percent(metrics.doc)} note="share of demand in the same hours" />
                <Stat
                  label="Density"
                  value={withUnit('density', metrics.densityGWhPerKm2, units)}
                  note={`EPRI: ${rangeWithUnit('density', 50, 150, units)} typical of networks`}
                />
                <Stat label="Peak heating" value={withUnit('powerLarge', metrics.peakHeatingW / 1e6, units)} />
              </div>
              <h3 className="card__subheading">{MAP_COPY.todayHeading}</h3>
              <div className="stats">
                <Stat label="Site energy" value={withUnit('energyLarge', result.baseline.totalSiteKWh / 1000, units)} note="heating, cooling, hot water, refrigeration" />
                <Stat label="Carbon" value={tonnes(result.baseline.carbonKg)} note="a year, Cambium long-run marginal" />
              </div>
            </section>
          )}
          {state.running && !result && <p className="message">Running the year…</p>}

          <section className="card" aria-labelledby="sources-heading">
            <h2 id="sources-heading" className="card__heading">
              {MAP_COPY.sourcesHeading}
            </h2>
            {site.sources.length === 0 ? (
              <p className="card__note">{MAP_COPY.noSources}</p>
            ) : (
              <>
                <ul className="list">
                  {site.sources.map((s) => (
                    <li key={s.id}>
                      <span className={`dot dot--${s.exchange === 'water' ? 'cool' : 'heat'}`} aria-hidden />
                      {s.name ?? s.kind.replace('-', ' ')} <span className="muted">— {s.kind.replace('-', ' ')}, {s.distanceM === 0 ? 'inside' : `${s.distanceM} m away`}</span>
                      {s.exchange === 'in-load' ? (
                        <span className="muted">
                          {s.distanceM === 0 ? ' · its refrigeration is counted in its load' : ' · outside the boundary: draw it in to count its refrigeration'}
                        </span>
                      ) : (
                        <span className="muted"> · about {withUnit('powerLarge', s.estimatedCapacityW / 1e6, units, 2)} (estimate)</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="card__note">{MAP_COPY.sourcesNote}</p>
              </>
            )}
          </section>

          <section className="card" aria-labelledby="context-heading">
            <h2 id="context-heading" className="card__heading">
              {MAP_COPY.contextHeading}
            </h2>
            <p className="card__note">{MAP_COPY.contextNote}</p>
            <dl className="context">
              {siteContext(site, metrics, {
                area: (m2) => withUnit('area', m2, units),
                density: (d) => withUnit('density', d, units),
              }).map((row) => (
                <div key={row.key} className={row.known ? 'context__row' : 'context__row context__row--unknown'}>
                  <dt>{row.criterion}</dt>
                  <dd>{row.known ? row.finding : <span className="muted">{MAP_COPY.notKnown}</span>}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="attribution">
            {state.weather?.attribution} · © OpenStreetMap contributors · {place.attribution} · Grid carbon: NLR Cambium 2023 · Loads calibrated to NLR ComStock™/ResStock™ · {sig(site.areaM2 / 1e6, 2)} km² drawn
          </p>
        </>
      )}
    </div>
  );
}
