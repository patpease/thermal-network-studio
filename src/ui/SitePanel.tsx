/**
 * The panel beside the map: find a place, draw, and read what was found.
 *
 * Progressive depth (D7): the story first — how many buildings, how the
 * demand is shaped, what is nearby — and the numbers under it. Everything
 * printed with a unit goes through format.ts.
 */
import { useMemo, useState } from 'react';

import { MAP_COPY, SCALE_COPY } from '../config/copy';
import { ARCHETYPES } from '../loads/archetypes';
import type { ArchetypeId } from '../loads/archetypes';
import type { Place } from '../relay/relay';
import { kvLabel, MAX_BUILDINGS } from '../site/classify';
import { SOURCE_SEARCH_M, SUBSTATION_SEARCH_M } from '../site/osm';
import type { Site, SiteBuilding } from '../site/classify';
import { sourceById, sourceLine } from '../config/sources';
import { M3_PER_MGD } from '../site/wastewater';
import type { GridImpact } from '../engine/grid';
import { NETWORK_KIND_LABEL, NETWORK_SOURCES } from '../site/generated/networks';
import { NEARBY_NETWORK_M, nearestNetwork, networksNear } from '../site/networks';
import { centroid } from '../site/geometry';
import type { LonLat } from '../site/geometry';
import { siteContext } from '../site/context';
import { connected, effective } from '../site/neighbourhood';
import type { UnitSystem } from '../units/units';
import { networkSize, percent, rangeWithUnit, sig, tonnes, withUnit } from './format';
import { SCALE_POINT_TONS, scaleOf } from '../engine/scale';
import { peakCheck, RULE_OF_THUMB_W_PER_M2 } from '../engine/ruleOfThumb';
import type { PeakCheck } from '../engine/ruleOfThumb';
import { PeakDay } from '../charts/PeakDay';
import type { WeatherYear } from '../loads/model';
import type { ClimateZone } from '../loads/zones';
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
  readonly onEdit: () => void;
  readonly onRetry: () => void;
  /** Read the same boundary again, keeping the player's work (OSM did not answer). */
  readonly onReread: () => void;
  readonly onEditDone: () => void;
  readonly onEditCancel: () => void;
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

const NETWORKS_SHOWN = 6;

/** Thermal networks already running near the site: to learn from, not to connect. */
const SUBSTATIONS_SHOWN = 5;
export const HOSTING_CAPACITY_ATLAS = 'https://www.energy.gov/cmei/vehicles/us-atlas-electric-distribution-system-hosting-capacity-maps';

/** Substations within a mile, and the site's winter electric peak beside them (grid nearby). */
function GridNearby({ site, grid, designed, units }: { site: Site; grid: GridImpact | null; designed: boolean; units: UnitSystem }) {
  const c = MAP_COPY.grid;
  const within = withUnit('distance', SUBSTATION_SEARCH_M, units, 1);
  const shown = site.substations.slice(0, SUBSTATIONS_SHOWN);
  const kw = (w: number) => withUnit('electricPower', w, units);
  return (
    <section className="card" aria-labelledby="grid-heading">
      <h2 id="grid-heading" className="card__heading">
        {c.heading}
      </h2>
      {site.osmUnavailable ? (
        <p className="card__note">{c.unknown}</p>
      ) : shown.length === 0 ? (
        <p className="card__note">{c.none(within)}</p>
      ) : (
        <>
          <p className="card__note">{c.within(within)}</p>
          <ul className="list">
            {shown.map((s) => (
              <li key={s.id}>
                <span className="dot dot--grid" aria-hidden />
                {s.name ?? c.unnamed}{' '}
                <span className="muted">
                  — {s.kind ? c.kind(s.kind, s.kindFrom === 'voltage') : c.noKind}
                  {s.voltagesKv.length > 0 && `, ${kvLabel(s.voltagesKv)}`}, {s.distanceM === 0 ? 'inside' : `${withUnit('length', s.distanceM, units, 2)} away`}
                  {s.operator && ` · ${s.operator}`}
                </span>
              </li>
            ))}
          </ul>
          {site.substations.length > SUBSTATIONS_SHOWN && <p className="card__note">{c.more(site.substations.length - SUBSTATIONS_SHOWN)}</p>}
        </>
      )}
      {grid && (
        <>
          <h3 className="card__subheading">{c.peakHeading}</h3>
          <div className="stats">
            <Stat label={c.today} value={kw(grid.today.winterW)} />
            <Stat label={c.ble} value={kw(grid.ble.winterW)} />
            {designed && <Stat label={c.network} value={kw(grid.network.winterW)} />}
          </div>
        </>
      )}
      <p className="card__note">
        {c.capacity}{' '}
        <a href={HOSTING_CAPACITY_ATLAS} target="_blank" rel="noopener noreferrer">
          {c.atlas}
        </a>
      </p>
    </section>
  );
}

function NetworksNearby({ at, units }: { at: LonLat; units: UnitSystem }) {
  const near = networksNear(at);
  const within = withUnit('distance', NEARBY_NETWORK_M, units, 2);
  const nearest = near.length === 0 ? nearestNetwork(at) : null;
  const sources = new Set(near.map((n) => n.network.source));
  return (
    <section className="card" aria-labelledby="networks-heading">
      <h2 id="networks-heading" className="card__heading">
        {MAP_COPY.networks.heading}
      </h2>
      {near.length === 0 ? (
        <p className="card__note">
          {nearest ? MAP_COPY.networks.none(within, nearest.network.name, withUnit('distance', nearest.distanceM, units, 2)) : null}
        </p>
      ) : (
        <>
          <p className="card__note">{MAP_COPY.networks.within(within)}</p>
          <ul className="list">
            {near.slice(0, NETWORKS_SHOWN).map(({ network: n, distanceM }) => {
              const facts = [
                NETWORK_KIND_LABEL[n.kind],
                `${withUnit('distance', distanceM, units, 2)} away`,
                n.yearOpened ? MAP_COPY.networks.opened(n.yearOpened) : null,
                n.capacityMWt ? MAP_COPY.networks.capacity(withUnit('powerLarge', n.capacityMWt, units, 2)) : null,
                n.placement === 'town' ? MAP_COPY.networks.town : null,
              ].filter((x): x is string => x !== null);
              return (
                <li key={n.id}>
                  <span className="dot dot--network" aria-hidden />
                  {n.link ? (
                    <a href={n.link} target="_blank" rel="noreferrer noopener">
                      {n.name}
                    </a>
                  ) : (
                    n.name
                  )}{' '}
                  <span className="muted">— {facts.join(' · ')}</span>
                </li>
              );
            })}
          </ul>
          {near.length > NETWORKS_SHOWN && <p className="card__note">{MAP_COPY.networks.more(near.length - NETWORKS_SHOWN)}</p>}
        </>
      )}
      <p className="attribution">
        {[...(sources.size ? sources : new Set(nearest ? [nearest.network.source] : []))]
          .map((id) => (NETWORK_SOURCES.some((s) => s.id === id) ? `${sourceById(id).short} (${sourceById(id).licence})` : null))
          .filter(Boolean)
          .join(' · ')}
      </p>
    </section>
  );
}

/** What the federal structure sets added to this site, or why they did not. */
function StructuresNote({ site, connected }: { site: Site; connected: readonly SiteBuilding[] }) {
  const s = site.structures;
  const lines: string[] = [];
  if (!s) lines.push(MAP_COPY.structures.none);
  else {
    const missing = [s.fema ? null : 'FEMA USA Structures', s.nsi ? null : 'The National Structure Inventory'].filter((x): x is string => x !== null);
    if (missing.length) lines.push(MAP_COPY.structures.missing(missing.join(' and ')));
    const added = connected.filter((b) => b.origin === 'fema').length;
    const filled = connected.filter((b) => b.levelsSource === 'nsi').length;
    if (added) lines.push(MAP_COPY.structures.added(added));
    if (filled) lines.push(MAP_COPY.structures.filled(filled));
    if (s.femaTruncated) lines.push(MAP_COPY.structures.truncated);
  }
  return lines.length ? <p className="card__note">{lines.join(' ')}</p> : null;
}

/** The selected building's peak hour against the rules of thumb. Never scored. */
function PeakCheckRows({ check, guessed, units }: { check: PeakCheck; guessed: boolean; units: UnitSystem }) {
  const c = MAP_COPY.peakCheck;
  const rule = (kind: 'loadIntensity' | 'coolingIntensity', w: number) => withUnit(kind, w, units);
  return (
    <div className="peak-check">
      <h3 id="peak-check-heading" className="card__subheading">
        {c.heading}
      </h3>
      <div className="stats">
        <Stat
          label={c.cooling}
          value={check.coolingWPerM2 > 0 ? rule('coolingIntensity', check.coolingWPerM2) : c.noCooling}
          note={`${c.rule(rule('coolingIntensity', RULE_OF_THUMB_W_PER_M2.cooling))}${check.coolingWPerM2 > 0 ? ` · ${c.compare(check.coolingRatio)}` : ''}`}
        />
        <Stat
          label={c.heating}
          value={rule('loadIntensity', check.heatingWPerM2)}
          note={`${c.rule(rule('loadIntensity', RULE_OF_THUMB_W_PER_M2.heating))} · ${c.compare(check.heatingRatio)}`}
        />
      </div>
      <p className="card__note">
        {c.note(rule('coolingIntensity', RULE_OF_THUMB_W_PER_M2.cooling), rule('loadIntensity', RULE_OF_THUMB_W_PER_M2.heating))}
        {guessed && <> {c.guessed}</>}
      </p>
    </div>
  );
}

/** The weather's credit with its year, unless the credit already names it (the tour's AMY2018). */
const weatherCredit = (attribution: string, year: number) => (attribution.includes(String(year)) ? attribution : `${attribution}, ${year}`);

/** One simulation of a square metre; the archetype, vintage and zone decide it. */
function usePeakCheck(b: SiteBuilding | undefined, zone: ClimateZone | null, weather: WeatherYear | null): PeakCheck | null {
  const archetype = b?.archetype ?? null;
  const vintage = b?.vintage ?? null;
  return useMemo(
    () => (archetype && zone && weather ? peakCheck({ archetype, zone, ...(vintage ? { vintage } : {}) }, weather) : null),
    [archetype, vintage, zone, weather],
  );
}

/** "Mankato Clinic · Outpatient clinic", or the type alone. */
const buildingLabel = (b: SiteBuilding) => {
  const type = ARCHETYPES.find((a) => a.id === b.archetype)?.label ?? '';
  return b.name ? `${b.name} · ${type}` : type;
};

function SelectedBuilding({
  b,
  excluded,
  onToggle,
  onOverride,
  units,
  check,
  steamYear,
}: {
  b: SiteBuilding;
  excluded: boolean;
  onToggle: () => void;
  onOverride: (a: ArchetypeId | null) => void;
  units: UnitSystem;
  check: PeakCheck | null;
  steamYear: number | null;
}) {
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
        {b.levelsGuessed ? MAP_COPY.structures.levels[b.levelsSource] : ''}, {withUnit('area', b.floorArea, units)} conditioned.
        {b.vintageSource === 'nsi-median' && b.vintage && <> {MAP_COPY.structures.vintageMedian(b.vintage.replace('-', '–'))}</>}
      </p>
      {b.steam && <p className="card__note">{MAP_COPY.steam.building(steamYear)}</p>}
      {b.archetype && (
        <label className="check">
          <input type="checkbox" checked={!excluded} onChange={onToggle} /> {MAP_COPY.include}
        </label>
      )}
      {check && <PeakCheckRows check={check} guessed={b.archetypeGuessed} units={units} />}
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
  const chosen = selected ? effective(selected, selection) : undefined;
  const check = usePeakCheck(chosen, place?.zone ?? null, state.weather);
  const metrics = result?.site ?? null;
  const scale = metrics ? scaleOf(metrics, buildings.length) : null;

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
        ) : state.phase === 'editing' ? (
          <>
            <p className="card__note">{MAP_COPY.editHint}</p>
            <p className="numeric">
              {state.draft.length} corners · {withUnit('area', draftArea(state.draft), units)}
            </p>
            <div className="button-row">
              <button type="button" className="button button--primary" onClick={props.onEditDone}>
                {MAP_COPY.doneButton}
              </button>
              <button type="button" className="button" onClick={props.onEditCancel}>
                {MAP_COPY.cancelButton}
              </button>
            </div>
          </>
        ) : (
          <>
            {!site && <p className="card__note">{MAP_COPY.intro}</p>}
            <div className="button-row">
              <button type="button" className="button button--primary" onClick={props.onDraw}>
                {site || state.boundary ? MAP_COPY.redrawButton : MAP_COPY.drawButton}
              </button>
              {state.boundary && (state.phase === 'ready' || state.phase === 'error') && (
                <button type="button" className="button" onClick={props.onEdit}>
                  {MAP_COPY.editButton}
                </button>
              )}
            </div>
          </>
        )}
        {state.message && <p className="message message--error">{state.message}</p>}
        {state.phase === 'error' && state.boundary && (
          <button type="button" className="button" onClick={props.onRetry}>
            {MAP_COPY.retryButton}
          </button>
        )}
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
            {site.osmUnavailable && (
              <div className="scale-note" role="status">
                <p>{MAP_COPY.osmUnavailable}</p>
                <button type="button" className="button" onClick={props.onReread}>
                  {MAP_COPY.osmRetry}
                </button>
              </div>
            )}
            <StructuresNote site={site} connected={buildings} />
          </section>

          {selected && (
            <SelectedBuilding
              b={chosen!}
              excluded={selection.excluded.has(selected.id)}
              onToggle={() => props.onToggle(selected.id)}
              onOverride={(a) => props.onOverride(selected.id, a)}
              units={units}
              check={check}
              steamYear={site.steam?.year ?? null}
            />
          )}
          {chosen && check?.heatingDay && <PeakDay kind="heating" day={check.heatingDay} building={buildingLabel(chosen)} units={units} />}
          {chosen && check?.coolingDay && <PeakDay kind="cooling" day={check.coolingDay} building={buildingLabel(chosen)} units={units} />}

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
                  note="of heating plus cooling demand"
                />
                <Stat label="Demand overlap (DOC)" value={percent(metrics.doc)} note="share of demand in the same hours" />
                <Stat
                  label="Density"
                  value={withUnit('density', metrics.densityGWhPerKm2, units)}
                  note={`${rangeWithUnit('density', 50, 150, units)} is typical of networks`}
                />
                <Stat label="Peak heating" value={withUnit('powerLarge', metrics.peakHeatingW / 1e6, units)} />
                <Stat label={SCALE_COPY.label} value={networkSize(scale!.tons, units)} note={SCALE_COPY.note(networkSize(SCALE_POINT_TONS, units))} />
              </div>
              {scale && scale.belowPoint && (
                <div className="scale-note" role="note">
                  <p>{SCALE_COPY.below(networkSize(scale.tons, units), networkSize(SCALE_POINT_TONS, units))}</p>
                  {scale.moreBuildings !== null && <p>{SCALE_COPY.more(scale.moreBuildings)}</p>}
                  {(state.phase === 'ready' || state.phase === 'error') && (
                    <button type="button" className="button" onClick={props.onEdit}>
                      {SCALE_COPY.edit}
                    </button>
                  )}
                </div>
              )}
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
              <p className="card__note">{MAP_COPY.noSources(withUnit('length', SOURCE_SEARCH_M, units))}</p>
            ) : (
              <>
                <ul className="list">
                  {site.sources.map((s) => (
                    <li key={s.id}>
                      <span className={`dot dot--${s.exchange === 'water' ? 'cool' : 'heat'}`} aria-hidden />
                      {s.name ?? s.kind.replace('-', ' ')} <span className="muted">— {s.kind.replace('-', ' ')}, {s.distanceM === 0 ? 'inside' : `${withUnit('length', s.distanceM, units, 2)} away`}</span>
                      {s.exchange === 'in-load' ? (
                        <span className="muted">
                          {' · its refrigeration is counted in its load'}
                        </span>
                      ) : (
                        <span className="muted"> · about {withUnit('powerLarge', s.estimatedCapacityW / 1e6, units, 2)} (estimate)</span>
                      )}
                      {s.cwns && (
                        <span className="muted">
                          {' · '}
                          {MAP_COPY.cwnsFlow(withUnit('waterFlow', s.cwns.designMgd * M3_PER_MGD, units))}
                          {s.id.startsWith('cwns:') ? `, ${MAP_COPY.cwnsOnly}` : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="card__note">{MAP_COPY.sourcesNote}</p>
              </>
            )}
          </section>

          <GridNearby site={site} grid={result?.grid ?? null} designed={state.design.sources.length > 0} units={units} />

          <NetworksNearby at={centroid(site.boundary)} units={units} />

          <section className="card" aria-labelledby="context-heading">
            <h2 id="context-heading" className="card__heading">
              {MAP_COPY.contextHeading}
            </h2>
            <p className="card__note">{MAP_COPY.contextNote}</p>
            <dl className="context">
              {siteContext(site, metrics, {
                area: (m2) => withUnit('area', m2, units),
                density: (d) => withUnit('density', d, units),
                distance: (m) => withUnit('length', m, units),
                size: (tons) => networkSize(tons, units),
              }).map((row) => (
                <div key={row.key} className={row.known ? 'context__row' : 'context__row context__row--unknown'}>
                  <dt>{row.criterion}</dt>
                  <dd>{row.known ? row.finding : <span className="muted">{MAP_COPY.notKnown}</span>}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="attribution">
            {state.weather && weatherCredit(state.weather.attribution, state.weather.year)} · {sourceLine(site.structures ? ['osm', 'fema-structures', 'nsi'] : ['osm'])} · {place.attribution} ·{' '}
            {sourceLine([...(site.sources.some((s) => s.cwns) ? ['cwns'] : []), ...(site.steam ? ['nyc-ll84'] : []), 'cambium', 'nlr-stock'])} · {sig(site.areaM2 / 1e6, 2)} km² drawn
          </p>
        </>
      )}
    </div>
  );
}
