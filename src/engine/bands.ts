/**
 * Reference bands, kept apart from the engine so the page can print them
 * without pulling the load model into the main bundle.
 */

/** Minnesota's load balance bands (Table D-1), as reference marks (D24). Not a score. */
export function minnesotaBalanceBand(heatingShare: number): 'balanced' | 'typical' | 'heating-dominant' {
  if (heatingShare <= 0.8) return 'balanced';
  if (heatingShare <= 0.9) return 'typical';
  return 'heating-dominant';
}
