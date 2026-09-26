/**
 * The bore field's g-function: how the borehole wall temperature responds to
 * a unit step of heat extraction, for a whole rectangular field (D10).
 *
 *     T_wall(t) − T_ground = −q′ / (2πk) · g(t)        (q′ in W per m of bore)
 *
 * Built from the finite line source (Claesson & Javed 2011), summed over every
 * pair of boreholes. A regular grid has only nx·ny distinct offsets, so the
 * pair sum is over offsets with their multiplicity, not over N² pairs — which
 * is what keeps a 400-borehole field under a few milliseconds.
 *
 * The FLS is the standard analytical basis for g-functions and is exact for
 * uniform heat rate along each borehole. It is not the uniform-temperature
 * condition that pygfunction solves; that differs by a few percent for large
 * dense fields at long times, which is inside everything else this game
 * approximates.
 */

/** erf, Abramowitz & Stegun 7.1.26; |error| < 1.5e-7. JS has no Math.erf. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return sign * y;
}

/** ∫erf: ierf(x) = x·erf(x) − (1 − e^(−x²))/√π. */
function ierf(x: number): number {
  return x * erf(x) - (1 - Math.exp(-x * x)) / Math.sqrt(Math.PI);
}

export interface FieldGeometry {
  /** Boreholes along each side of the rectangle. */
  readonly nx: number;
  readonly ny: number;
  /** Centre-to-centre spacing, m. */
  readonly spacing: number;
  /** Active length, m. */
  readonly depth: number;
  /** Depth to the top of the active length, m. */
  readonly buried: number;
  /** Borehole radius, m. */
  readonly radius: number;
}

/**
 * FLS response between two boreholes a distance `d` apart (d = radius for a
 * borehole's own wall), at time `t` seconds, for diffusivity `alpha` m²/s.
 *
 *   h(d,t) = 1/(2H) ∫_{1/√(4αt)}^∞ e^(−d²s²)/s² · Y(Hs, Ds) ds
 *   Y(h,δ) = 2 ierf(h) + 2 ierf(h + 2δ) − ierf(2h + 2δ) − ierf(2δ)
 *
 * The check on the form: for large s, Y → 2Hs and the integrand becomes
 * e^(−d²s²)/s, whose integral is ½E₁(d²/4αt) — the infinite line source, as
 * it must be before the ends of a borehole make themselves felt.
 *
 * Integrated in u = ln s with Simpson's rule, which handles both the slowly
 * decaying self term and the sharply cut-off distant pairs.
 */
export function flsResponse(d: number, t: number, alpha: number, H: number, D: number): number {
  const lower = 1 / Math.sqrt(4 * alpha * t);
  // Beyond s = 8/d the integrand is e^(−64) of its value near the lower limit.
  const upper = Math.max(lower * 2, 8 / d);
  const u0 = Math.log(lower);
  const u1 = Math.log(upper);
  const n = 96; // even; 96 agrees with 400 to better than 0.1%
  const h = (u1 - u0) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const s = Math.exp(u0 + i * h);
    const hs = H * s;
    const ds = D * s;
    const Y = 2 * ierf(hs) + 2 * ierf(hs + 2 * ds) - ierf(2 * hs + 2 * ds) - ierf(2 * ds);
    // e^(−d²s²)/s² · Y/H, times s for the change of variable u = ln s.
    const f = (Math.exp(-d * d * s * s) / s) * (Y / H);
    sum += f * (i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2);
  }
  return (0.5 * (sum * h)) / 3;
}

/** The field's g-function at time `t`: the mean over boreholes of Σ responses. */
export function fieldG(field: FieldGeometry, t: number, alpha: number): number {
  const { nx, ny, spacing, depth, buried, radius } = field;
  let total = 0;
  for (let dx = 0; dx < nx; dx++) {
    for (let dy = 0; dy < ny; dy++) {
      // Ordered pairs at this offset: (nx−dx)(ny−dy), doubled per non-zero axis.
      const multiplicity = (nx - dx) * (ny - dy) * (dx > 0 ? 2 : 1) * (dy > 0 ? 2 : 1);
      const d = dx === 0 && dy === 0 ? radius : spacing * Math.hypot(dx, dy);
      total += multiplicity * flsResponse(d, t, alpha, depth, buried);
    }
  }
  return total / (nx * ny);
}

/** A g-function tabulated on log-spaced times and interpolated in ln t. */
export interface GTable {
  readonly lnT: Float64Array;
  readonly g: Float64Array;
}

export function tabulate(field: FieldGeometry, alpha: number, fromSeconds: number, toSeconds: number, points = 24): GTable {
  const lnT = new Float64Array(points);
  const g = new Float64Array(points);
  const a = Math.log(fromSeconds);
  const b = Math.log(toSeconds);
  for (let i = 0; i < points; i++) {
    lnT[i] = a + ((b - a) * i) / (points - 1);
    g[i] = fieldG(field, Math.exp(lnT[i]!), alpha);
  }
  return { lnT, g };
}

export function gAt(table: GTable, t: number): number {
  if (t <= 0) return 0;
  const x = Math.log(t);
  const { lnT, g } = table;
  const n = lnT.length;
  if (x <= lnT[0]!) return g[0]! * (t / Math.exp(lnT[0]!)); // ramps to 0 at t = 0
  if (x >= lnT[n - 1]!) return g[n - 1]!;
  let i = Math.floor(((x - lnT[0]!) / (lnT[n - 1]! - lnT[0]!)) * (n - 1));
  i = Math.min(Math.max(i, 0), n - 2);
  const f = (x - lnT[i]!) / (lnT[i + 1]! - lnT[i]!);
  return g[i]! + f * (g[i + 1]! - g[i]!);
}
