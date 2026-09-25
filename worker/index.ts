/**
 * Cloudflare Worker entry point.
 *
 * The site deploys through Workers, NOT Pages. They are different products and
 * the difference has broken a sibling's deploy: a Pages-style `functions/`
 * directory is silently ignored here.
 *
 * An adapter and nothing more. Every decision is in `handler.ts`, where the
 * suite can reach it.
 */
import { handle } from './handler';
import type { Env } from './handler';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
