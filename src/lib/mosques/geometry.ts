import type { LatLng } from "./model";

/**
 * Plane geometry on small areas (a mosque building, a few hundred metres at most), done directly
 * in degrees: centroids and inside tests are unchanged by the east–west scale of longitude, so no
 * projection is needed at this size.
 */

/** A closed ring: at least 3 distinct points, first point repeated at the end. */
export type Ring = LatLng[];

export function isClosedRing(pts: readonly LatLng[]): boolean {
  if (pts.length < 4) return false;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return a.lat === b.lat && a.lng === b.lng;
}

/** Signed area (degrees², shoelace), with its centroid. Computed relative to the ring's first
 * point: with raw coordinates (~46°, ~24°) the shoelace terms cancel and lose about a metre. */
function ringCentroid(ring: Ring): { area: number; lat: number; lng: number } {
  const o = ring[0];
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const px = ring[i].lng - o.lng;
    const py = ring[i].lat - o.lat;
    const qx = ring[i + 1].lng - o.lng;
    const qy = ring[i + 1].lat - o.lat;
    const f = px * qy - qx * py;
    a += f;
    cx += (px + qx) * f;
    cy += (py + qy) * f;
  }
  a /= 2;
  return { area: a, lng: a ? o.lng + cx / (6 * a) : Number.NaN, lat: a ? o.lat + cy / (6 * a) : Number.NaN };
}

/** Even–odd rule over every ring, so a point in a courtyard (an inner ring) is outside. */
export function insideRings(p: LatLng, rings: readonly Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** The middle of the widest stretch of the area along one east–west line, or null. */
function midOfWidestSpan(rings: readonly Ring[], lat: number): LatLng | null {
  const xs: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      if (a.lat > lat !== b.lat > lat) xs.push(a.lng + ((lat - a.lat) * (b.lng - a.lng)) / (b.lat - a.lat));
    }
  }
  xs.sort((m, n) => m - n);
  let best: LatLng | null = null;
  let width = 0;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > width) {
      width = xs[i + 1] - xs[i];
      best = { lat, lng: (xs[i] + xs[i + 1]) / 2 };
    }
  }
  return best;
}

/**
 * A point that stands for an area (a building outline, or a multipolygon with courtyards): the
 * centroid of its largest ring when that lies on the area itself, otherwise the middle of the
 * widest stretch of the area through the centroid's latitude (an L-shaped building, or a
 * courtyard in the middle). Never the bounding-box centre, which can fall outside the building.
 */
export function areaPoint(rings: readonly Ring[]): LatLng | null {
  const valid = rings.filter(isClosedRing);
  let main: { area: number; lat: number; lng: number } | null = null;
  let mainRing: Ring | null = null;
  for (const r of valid) {
    const c = ringCentroid(r);
    if (c.area && (!main || Math.abs(c.area) > Math.abs(main.area))) {
      main = c;
      mainRing = r;
    }
  }
  if (!main || !mainRing) return null;
  const centroid = { lat: main.lat, lng: main.lng };
  if (insideRings(centroid, valid)) return centroid;
  const lats = mainRing.map((p) => p.lat);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  return midOfWidestSpan(valid, centroid.lat) ?? midOfWidestSpan(valid, midLat);
}

/** Joins open ways that meet end to end (an outer ring split over several ways) into closed rings. */
export function joinRings(parts: readonly LatLng[][]): Ring[] {
  const same = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;
  const rings: Ring[] = [];
  const open: LatLng[][] = [];
  for (const p of parts) {
    if (p.length < 2) continue;
    if (isClosedRing(p)) rings.push(p);
    else open.push([...p]);
  }
  while (open.length) {
    let line = open.shift() as LatLng[];
    let grew = true;
    while (!same(line[0], line[line.length - 1]) && grew) {
      grew = false;
      const end = line[line.length - 1];
      const i = open.findIndex((q) => same(q[0], end) || same(q[q.length - 1], end));
      if (i >= 0) {
        const [q] = open.splice(i, 1);
        line = line.concat((same(q[0], end) ? q : [...q].reverse()).slice(1));
        grew = true;
      }
    }
    if (isClosedRing(line)) rings.push(line);
  }
  return rings;
}
