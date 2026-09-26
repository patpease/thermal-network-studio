/**
 * The design screen (phase 04): connect what was found, add plant, size it,
 * and read how the year went.
 *
 * Results sit at the top because they are what every edit is for; the list
 * of what is built sits under them. Every number with a unit goes through
 * format.ts or NumberField, so nothing here knows which system is shown.
 */
import { DESIGN_COPY } from '../config/copy';
import { boreFieldArea, defaultSpot, fromCandidate, nextId, RETROFITS } from '../engine/design';
import type { Design, DesignSource, DesignSourceKind } from '../engine/design';
import { BORE_DEFAULTS, FLUID_LIMITS } from '../engine/ground';
import type { ScenarioResult } from '../engine/scenario';
import { boreholeRoom } from '../site/classify';
import type { Site, SourceCandidate } from '../site/classify';
import { centroid } from '../site/geometry';
import type { UnitSystem } from '../units/units';
import { NumberField } from './NumberField';
import { sig, withUnit } from './format';

export interface DesignPanelProps {
  readonly site: Site | null;
  readonly design: Design;
  readonly result: ScenarioResult | null;
  readonly running: boolean;
  readonly placing: string | null;
  readonly units: UnitSystem;
  readonly onUpdate: (update: (d: Design) => Design) => void;
  readonly onPlace: (id: string | null) => void;
  readonly onSuggest: () => void;
}

const TITLES: Record<DesignSourceKind, string> = {
  'bore-field': 'Bore field',
  'air-source': 'Air-source heat pump',
  'cooling-tower': 'Cooling tower',
  'waste-heat': 'Waste heat',
  water: 'Water exchanger',
};

const WHAT: Record<DesignSourceKind, string> = {
  'bore-field': 'Stores summer heat in the ground and takes it back in winter. Gives and takes.',
  'air-source': 'Warms the loop from outdoor air when nothing else can. Heat only; weaker as the air gets colder.',
  'cooling-tower': 'Throws loop heat to the air by evaporation. Cooling only; limited by the wet bulb.',
  'waste-heat': 'Heat someone else already makes — servers, a rink’s chillers, a brewery. Heat only, while warmer than the loop.',
  water: 'A heat exchanger on water — a sewer main, a lake, a river. Gives or takes, whichever side of the loop it is on.',
};

type AddKind = 'bore-field' | 'air-source' | 'cooling-tower' | 'sewer' | 'surface' | 'waste-heat';

const ADD: { kind: AddKind; label: string }[] = [
  { kind: 'bore-field', label: 'Bore field' },
  { kind: 'air-source', label: 'Air-source HP' },
  { kind: 'cooling-tower', label: 'Cooling tower' },
  { kind: 'sewer', label: 'Sewer' },
  { kind: 'surface', label: 'Lake or river' },
  { kind: 'waste-heat', label: 'Waste heat' },
];

function newSource(kind: AddKind, design: Design, centre: DesignSource['at']): DesignSource {
  const at = centre ? { at: centre } : {};
  switch (kind) {
    case 'bore-field':
      return { id: nextId(design, kind), kind, boreholes: 100, ...at };
    case 'air-source':
      return { id: nextId(design, kind), kind, capacityW: 1_000_000, ...at };
    case 'cooling-tower':
      return { id: nextId(design, kind), kind, capacityW: 1_000_000, ...at };
    case 'waste-heat':
      return { id: nextId(design, kind), kind, label: 'Waste heat', capacityW: 300_000, temperature: 30, ...at };
    case 'sewer':
      return { id: nextId(design, 'water'), kind: 'water', water: 'sewer', label: 'Sewer main', capacityW: 500_000, ...at };
    case 'surface':
      return { id: nextId(design, 'water'), kind: 'water', water: 'surface', label: 'Lake or river', capacityW: 1_000_000, ...at };
  }
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

/** A signed reduction: "−42%" reads as worse, so a reduction prints plainly. */
const reduction = (f: number) => (f >= 0 ? `${Math.round(f * 100)}% less` : `${Math.round(-f * 100)}% more`);

function Results({ result, design, running, units }: { result: ScenarioResult | null; design: Design; running: boolean; units: UnitSystem }) {
  if (design.sources.length === 0) {
    return (
      <section className="card" aria-labelledby="results-heading">
        <h2 id="results-heading" className="card__heading">
          {DESIGN_COPY.resultsHeading}
        </h2>
        <p className="card__note">{DESIGN_COPY.noSources}</p>
      </section>
    );
  }
  if (!result) return <p className="message">{running ? 'Running the year…' : ''}</p>;
  const { score, network } = result;
  const last = network.drift?.[network.drift.length - 1];
  const first = network.drift?.[0];
  const outside = last ? last.minFluid < FLUID_LIMITS.min || last.maxFluid > FLUID_LIMITS.max : false;

  return (
    <section className="card" aria-labelledby="results-heading" aria-busy={running}>
      <h2 id="results-heading" className="card__heading">
        {DESIGN_COPY.resultsHeading}
        {running && <span className="muted"> · updating…</span>}
      </h2>
      <div className="score">
        <span className="score__total numeric" data-testid="score">
          {score.total}
        </span>
        <span className="score__label">score of 100</span>
      </div>
      <p className="card__note">{DESIGN_COPY.scoreNote}</p>
      <div className="stats">
        <Stat label="Site energy" value={reduction(score.energyReduction)} note={`${score.efficiencyPoints} points`} />
        <Stat label="Carbon" value={reduction(score.carbonReduction)} note={`${score.carbonPoints} points`} />
        <Stat label="System COP" value={sig(network.systemCop, 2)} note="heat and cooling delivered ÷ electricity" />
        <Stat
          label="Unmet hours"
          value={network.unmetHours.toLocaleString('en-US')}
          note={network.unmetHours > 0 ? `${withUnit('energyLarge', network.unmetKWh / 1000, units)} on electric backup` : 'every hour met'}
        />
        <Stat label="Shared between buildings" value={withUnit('energyLarge', network.sharedKWh / 1000, units)} note="heat one rejected and another used" />
        <Stat label="Electricity" value={withUnit('energyLarge', network.totalSiteKWh / 1000, units)} note={`against ${withUnit('energyLarge', result.baseline.totalSiteKWh / 1000, units)} site energy today`} />
      </div>
      {first && last && (
        <>
          <h3 className="card__subheading">{DESIGN_COPY.driftHeading}</h3>
          <p className={outside ? 'message message--error' : 'card__note'}>
            Fluid {withUnit('temperature', first.minFluid, units)} to {withUnit('temperature', first.maxFluid, units)} in year one;{' '}
            {withUnit('temperature', last.minFluid, units)} to {withUnit('temperature', last.maxFluid, units)} in year 25.{' '}
            {outside
              ? `That leaves the ${withUnit('temperature', FLUID_LIMITS.min, units)}–${withUnit('temperature', FLUID_LIMITS.max, units)} a bore field is designed for.`
              : `Inside the ${withUnit('temperature', FLUID_LIMITS.min, units)}–${withUnit('temperature', FLUID_LIMITS.max, units)} a bore field is designed for.`}{' '}
            {DESIGN_COPY.driftNote}
          </p>
        </>
      )}
    </section>
  );
}

function SourceCard(props: {
  s: DesignSource;
  units: UnitSystem;
  placing: boolean;
  room: number;
  onChange: (s: DesignSource) => void;
  onRemove: () => void;
  onPlace: (on: boolean) => void;
  moved: number | undefined;
}) {
  const { s, units } = props;
  const set = (patch: Partial<DesignSource>) => props.onChange({ ...s, ...patch } as DesignSource);
  const title = 'label' in s && s.label ? s.label : TITLES[s.kind];

  return (
    <li className="source-card" data-kind={s.kind}>
      <div className="source-card__head">
        <span className={`dot dot--${s.kind === 'bore-field' ? 'ground' : s.kind === 'cooling-tower' || s.kind === 'water' ? 'cool' : 'heat'}`} aria-hidden />
        <span className="card__title">{title}</span>
        {'label' in s && <span className="muted"> · {TITLES[s.kind].toLowerCase()}</span>}
      </div>
      <p className="card__note">{WHAT[s.kind]}</p>

      <div className="fields">
        {s.kind === 'bore-field' ? (
          <>
            <NumberField label="Boreholes" value={s.boreholes} integer min={1} max={5000} units={units} onChange={(v) => set({ boreholes: v })} />
            <NumberField
              label="Depth"
              quantity="length"
              value={s.depth ?? BORE_DEFAULTS.depth}
              min={50}
              max={300}
              units={units}
              onChange={(v) => set({ depth: v })}
            />
          </>
        ) : (
          <NumberField
            label={s.kind === 'cooling-tower' ? 'Heat rejection' : 'Capacity'}
            quantity="powerLarge"
            value={s.capacityW / 1e6}
            min={0}
            max={200}
            units={units}
            onChange={(v) => set({ capacityW: v * 1e6 })}
          />
        )}
        {s.kind === 'waste-heat' && (
          <NumberField label="Available at" quantity="temperature" value={s.temperature} min={5} max={90} units={units} onChange={(v) => set({ temperature: v })} />
        )}
      </div>

      {s.kind === 'bore-field' && (
        <p className="card__note">
          {withUnit('area', boreFieldArea(s), units)} of ground at {withUnit('length', s.spacing ?? BORE_DEFAULTS.spacing, units, 2)} spacing
          {props.room > 0 ? ` · the site’s open space holds about ${props.room.toLocaleString('en-US')}` : ''}.
          {props.room > 0 && s.boreholes > props.room ? ' More than fits: it would go under buildings or streets.' : ''}
        </p>
      )}
      {props.moved !== undefined && <p className="card__note">Moved {withUnit('energyLarge', Math.abs(props.moved) / 1000, units)} a year.</p>}
      {'origin' in s && s.origin && <p className="card__note">{DESIGN_COPY.estimate}</p>}
      {!s.at && <p className="card__note">{DESIGN_COPY.unplaced}</p>}

      <div className="button-row">
        {props.placing ? (
          <>
            <span className="message">{DESIGN_COPY.placing}</span>
            <button type="button" className="button" onClick={() => props.onPlace(false)}>
              {DESIGN_COPY.cancelPlacing}
            </button>
          </>
        ) : (
          <button type="button" className="button" onClick={() => props.onPlace(true)}>
            {s.at ? DESIGN_COPY.move : DESIGN_COPY.place}
          </button>
        )}
        <button type="button" className="button" onClick={props.onRemove}>
          {DESIGN_COPY.remove}
        </button>
      </div>
    </li>
  );
}

export function DesignPanel(props: DesignPanelProps) {
  const { site, design, units, onUpdate } = props;
  if (!site) return <p className="card__note panel-note">{DESIGN_COPY.needSite}</p>;

  const centre = centroid(site.boundary);
  const room = boreholeRoom(site.openSpaceM2);
  const connectedOrigins = new Set(design.sources.flatMap((s) => ('origin' in s && s.origin ? [s.origin] : [])));
  const found = site.sources.filter((s) => s.exchange !== 'in-load');
  const moved = props.result?.network.sourceKWh ?? {};

  const connect = (c: SourceCandidate) =>
    onUpdate((d) => {
      const s = fromCandidate(c, nextId(d, c.exchange === 'water' ? 'water' : 'waste-heat'));
      return s ? { ...d, sources: [...d.sources, s] } : d;
    });

  return (
    <div className="panel-body">
      <Results result={props.result} design={design} running={props.running} units={units} />

      <section className="card" aria-labelledby="add-heading">
        <p className="card__note">{DESIGN_COPY.intro}</p>
        <button type="button" className="button button--primary" disabled={!props.result} onClick={props.onSuggest}>
          {DESIGN_COPY.suggest}
        </button>
        <p className="card__note">{DESIGN_COPY.suggestNote}</p>
        <h2 id="add-heading" className="card__heading">
          {DESIGN_COPY.addHeading}
        </h2>
        <div className="button-row">
          {ADD.map((a) => (
            <button key={a.kind} type="button" className="button" onClick={() => onUpdate((d) => ({ ...d, sources: [...d.sources, newSource(a.kind, d, defaultSpot(centre, d.sources.length))] }))}>
              + {a.label}
            </button>
          ))}
        </div>
        {found.length > 0 && (
          <>
            <h3 className="card__subheading">{DESIGN_COPY.foundHeading}</h3>
            <ul className="list">
              {found.map((c) => (
                <li key={c.id} className="found">
                  <span>
                    <span className={`dot dot--${c.exchange === 'water' ? 'cool' : 'heat'}`} aria-hidden />
                    {c.name ?? c.kind.replace('-', ' ')}{' '}
                    <span className="muted">· {withUnit('powerLarge', c.estimatedCapacityW / 1e6, units, 2)}</span>
                  </span>
                  {connectedOrigins.has(c.id) ? (
                    <span className="muted">{DESIGN_COPY.connected}</span>
                  ) : (
                    <button type="button" className="button button--small" onClick={() => connect(c)}>
                      {DESIGN_COPY.connect}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="built-heading">
        <h2 id="built-heading" className="card__heading">
          {DESIGN_COPY.builtHeading}
        </h2>
        {design.sources.length === 0 ? (
          <p className="card__note">{DESIGN_COPY.empty}</p>
        ) : (
          <ul className="source-list">
            {design.sources.map((s) => (
              <SourceCard
                key={s.id}
                s={s}
                units={units}
                room={room}
                placing={props.placing === s.id}
                moved={moved[s.id]}
                onChange={(next) => onUpdate((d) => ({ ...d, sources: d.sources.map((x) => (x.id === s.id ? next : x)) }))}
                onRemove={() => {
                  if (props.placing === s.id) props.onPlace(null);
                  onUpdate((d) => ({ ...d, sources: d.sources.filter((x) => x.id !== s.id) }));
                }}
                onPlace={(on) => props.onPlace(on ? s.id : null)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="loop-heading">
        <h2 id="loop-heading" className="card__heading">
          {DESIGN_COPY.loopHeading}
        </h2>
        <div className="fields">
          <NumberField
            label="Loop at least"
            quantity="temperature"
            value={design.band.min}
            min={-5}
            max={design.band.max - 5}
            units={units}
            onChange={(v) => onUpdate((d) => ({ ...d, band: { ...d.band, min: v } }))}
          />
          <NumberField
            label="Loop at most"
            quantity="temperature"
            value={design.band.max}
            min={design.band.min + 5}
            max={40}
            units={units}
            onChange={(v) => onUpdate((d) => ({ ...d, band: { ...d.band, max: v } }))}
          />
        </div>
        <p className="card__note">{DESIGN_COPY.bandNote}</p>
        <label className="field-label" htmlFor="retrofit">
          {DESIGN_COPY.retrofitLabel}
        </label>
        <select id="retrofit" value={String(design.retrofit)} onChange={(e) => onUpdate((d) => ({ ...d, retrofit: Number(e.target.value) }))}>
          {/* A value matching no option would show the first; every factor the
              design can hold is listed. */}
          {RETROFITS.map((r) => (
            <option key={r.factor} value={String(r.factor)}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="card__note">{DESIGN_COPY.retrofitNote}</p>
      </section>
    </div>
  );
}
