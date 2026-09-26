/**
 * The page's handle on the engine worker. `run` resolves with the result of
 * the most recent request only; an older request still in flight resolves
 * with `null` once a newer one has been sent, so a caller never draws a stale
 * design.
 */
import type { WeatherYear } from '../loads/model.ts';
import type { Neighbourhood } from './demand.ts';
import type { Design } from './design.ts';
import type { ScenarioResult } from './scenario.ts';
import type { EngineRequest, EngineResponse } from './worker.ts';

export interface EngineClient {
  run(neighbourhood: Neighbourhood, design: Design, weather: WeatherYear): Promise<{ result: ScenarioResult; ms: number } | null>;
  terminate(): void;
}

export function createEngine(): EngineClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let latest = 0;
  const pending = new Map<number, (response: EngineResponse) => void>();
  worker.onmessage = (event: MessageEvent<EngineResponse>) => {
    pending.get(event.data.id)?.(event.data);
    pending.delete(event.data.id);
  };

  return {
    run(neighbourhood, design, weather) {
      const id = ++latest;
      return new Promise((resolve, reject) => {
        pending.set(id, (response) => {
          if (id !== latest) resolve(null);
          else if (response.ok) resolve({ result: response.result, ms: response.ms });
          else reject(new Error(response.error));
        });
        worker.postMessage({ id, neighbourhood, design, weather } satisfies EngineRequest);
      });
    },
    terminate() {
      worker.terminate();
      pending.clear();
    },
  };
}
