/**
 * The results screen (phase 05): why the design scored what it did.
 *
 * The score first, then the year's heat through the loop, the loop's
 * temperature, the heat buildings shared, and the ground over 25 years.
 * Every chart is drawn at the width it is shown and carries a hidden table.
 */
import { useMemo } from 'react';

import { GroundDrift } from '../charts/GroundDrift';
import { LoopFlow } from '../charts/LoopFlow';
import { LoopYear } from '../charts/LoopYear';
import { MonthlySharing } from '../charts/MonthlySharing';
import { ScoreBreakdown } from '../charts/ScoreBreakdown';
import { dailyLoop, loopFlows, monthly } from '../charts/data';
import { RESULTS_COPY } from '../config/copy';
import type { Design } from '../engine/design';
import type { ScenarioResult } from '../engine/scenario';
import type { WeatherYear } from '../loads/model';
import type { UnitSystem } from '../units/units';

export interface ResultsPanelProps {
  readonly result: ScenarioResult | null;
  readonly design: Design;
  readonly weather: WeatherYear | null;
  readonly running: boolean;
  readonly units: UnitSystem;
  readonly hasSite: boolean;
}

export function ResultsPanel({ result, design, weather, running, units, hasSite }: ResultsPanelProps) {
  const flows = useMemo(() => (result ? loopFlows(result, design) : null), [result, design]);
  const days = useMemo(() => (result && weather ? dailyLoop(result.network.loopTemperature, weather.temperature) : null), [result, weather]);
  const months = useMemo(() => (result ? monthly(result) : null), [result]);

  if (!hasSite) return <p className="card__note panel-note">{RESULTS_COPY.needSite}</p>;
  if (design.sources.length === 0) return <p className="card__note panel-note">{RESULTS_COPY.needDesign}</p>;
  if (!result || !flows || !days || !months) return <p className="message panel-note">{running ? 'Running the year…' : ''}</p>;

  return (
    <div className="panel-body results" aria-busy={running}>
      {running && <p className="message">{RESULTS_COPY.updating}</p>}
      <ScoreBreakdown result={result} units={units} />
      <LoopFlow flows={flows} units={units} />
      <LoopYear days={days} band={design.band} units={units} />
      <MonthlySharing months={months} units={units} />
      {result.network.drift && result.network.drift.length > 1 ? (
        <GroundDrift drift={result.network.drift} units={units} />
      ) : (
        <p className="card__note">{RESULTS_COPY.noField}</p>
      )}
      <p className="card__note">{RESULTS_COPY.shapeCaveat}</p>
    </div>
  );
}
