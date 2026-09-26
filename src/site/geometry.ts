/**
 * Just enough planar geometry for a neighbourhood, with no dependency.
 *
 * Coordinates are [longitude, latitude]. Areas and lengths are computed on a
 * local equirectangular projection about the shape's own latitude — at the
 * scale of a neighbourhood (a few km) the error is well under 1%, which is far
 * inside what a building footprint from OSM is good to.
 */
export type LonLat = readonly [number, number];
export type Ring = readonly LonLat[];

const EARTH_RADIUS = 6_371_008.8;
const RAD = Math.PI / 180;

/** Metres per degree of longitude and latitude at `latitude`. */
export function metresPerDegree(latitude: number): { x: number; y: number } {
  const y = EARTH_RADIUS * RAD;
  return { x: y * Math.cos(latitude * RAD), y };
}

function meanLatitude(ring: Ring): number {
  let s = 0;
  for (const p of ring) s += p[1];
  return ring.length ? s / ring.length : 0;
}

/** Area of a ring, m² (shoelace on the local projection; orientation-free). */
export function ringArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  const m = metresPerDegree(meanLatitude(ring));
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    twice += a[0] * m.x * (b[1] * m.y) - b[0] * m.x * (a[1] * m.y);
  }
  return Math.abs(twice) / 2;
}

export function centroid(ring: Ring): LonLat {
  let x = 0;
  let y = 0;
  // A closed ring repeats its first point; don't count it twice.
  const n = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i++) {
    x += ring[i]![0];
    y += ring[i]![1];
  }
  return [x / n, y / n];
}

/** Ray casting. Points exactly on an edge may land either side. */
export function pointInRing(p: LonLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentsCross(p1: LonLat, p2: LonLat, q1: LonLat, q2: LonLat): boolean {
  const d = (a: LonLat, b: LonLat, c: LonLat) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(q1, q2, p1);
  const d2 = d(q1, q2, p2);
  const d3 = d(p1, p2, q1);
  const d4 = d(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Does a polyline pass through the polygon — cross its edge, or lie within it? */
export function lineCrossesRing(line: readonly LonLat[], ring: Ring): boolean {
  for (const p of line) if (pointInRing(p, ring)) return true;
  for (let i = 0; i + 1 < line.length; i++) {
    for (let j = 0; j < ring.length; j++) {
      if (segmentsCross(line[i]!, line[i + 1]!, ring[j]!, ring[(j + 1) % ring.length]!)) return true;
    }
  }
  return false;
}

/** Bounding box [west, south, east, north], optionally grown by `metres`. */
export function bbox(ring: Ring, metres = 0): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of ring) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  const m = metresPerDegree((s + n) / 2);
  return [w - metres / m.x, s - metres / m.y, e + metres / m.x, n + metres / m.y];
}

/** Distance between two points, m, on the local projection. */
export function distance(a: LonLat, b: LonLat): number {
  const m = metresPerDegree((a[1] + b[1]) / 2);
  return Math.hypot((a[0] - b[0]) * m.x, (a[1] - b[1]) * m.y);
}
