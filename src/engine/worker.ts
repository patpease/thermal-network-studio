/**
 * The engine in a Web Worker (D6), so a full year never blocks the page.
 *
 * One message in, one out. The request carries its own id so the client can
 * drop a result that a newer request has already superseded — a slider dragged
 * across ten values should draw the last one, not whichever finished last.
 */
import type { WeatherYear } from '../loads/model.ts';
import type { Neighbourhood } from './demand.ts';
import type { NetworkDesign } from './network.ts';
import { runScenario } from './scenario.ts';
import type { ScenarioResult } from './scenario.ts';

export interface EngineRequest {
  readonly id: number;
  readonly neighbourhood: Neighbourhood;
  readonly design: NetworkDesign;
  readonly weather: WeatherYear;
}

export type EngineResponse =
  | { readonly id: number; readonly ok: true; readonly result: ScenarioResult; readonly ms: number }
  | { readonly id: number; readonly ok: false; readonly error: string };

self.onmessage = (event: MessageEvent<EngineRequest>) => {
  const { id, neighbourhood, design, weather } = event.data;
  const started = performance.now();
  try {
    const result = runScenario(neighbourhood, design, weather);
    self.postMessage({ id, ok: true, result, ms: performance.now() - started } satisfies EngineResponse);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies EngineResponse);
  }
};
