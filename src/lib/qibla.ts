/**
 * Qibla Calculator — standalone, UI-agnostic, no external deps.
 *
 * Uses spherical trigonometry (Great-circle initial bearing) from the user's
 * coordinates to the Kaaba in Makkah. Reusable on iOS / Android / Web.
 *
 *   Kaaba: 21.4225° N, 39.8262° E
 *
 * Formula (initial bearing from point A to point B on a sphere):
 *   θ = atan2( sin(Δλ)·cos(φ2),
 *              cos(φ1)·sin(φ2) − sin(φ1)·cos(φ2)·cos(Δλ) )
 *   where φ = latitude, λ = longitude, Δλ = λ2 − λ1 (all in radians).
 * Result is normalized to [0, 360) degrees clockwise from true North.
 */

export const KAABA = { lat: 21.4225, lng: 39.8262 } as const;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Returns Qibla bearing in degrees from true North (0–360), clockwise. */
export function computeQiblaBearing(lat: number, lng: number): number {
  const phi1 = toRad(lat);
  const phi2 = toRad(KAABA.lat);
  const dLambda = toRad(KAABA.lng - lng);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  const bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/** Great-circle distance to the Kaaba in kilometers (Haversine). */
export function distanceToKaabaKm(lat: number, lng: number): number {
  const R = 6371;
  const phi1 = toRad(lat);
  const phi2 = toRad(KAABA.lat);
  const dPhi = toRad(KAABA.lat - lat);
  const dLambda = toRad(KAABA.lng - lng);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Smallest signed angular difference a−b in degrees, range (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/**
 * Adaptive low-pass filter for compass heading. Keeps a smoothed value
 * and updates it from the latest raw reading, handling 0/360 wrap-around.
 * Larger jumps use a higher alpha (catch up fast); small jumps use a small
 * alpha (stable, no jitter).
 */
export class HeadingSmoother {
  private value: number | null = null;

  reset() {
    this.value = null;
  }

  update(raw: number): number {
    if (this.value == null) {
      this.value = raw;
      return raw;
    }
    const diff = angleDiff(raw, this.value);
    const abs = Math.abs(diff);
    const alpha = abs > 20 ? 0.9 : abs > 5 ? 0.6 : 0.35;
    this.value = (this.value + diff * alpha + 360) % 360;
    return this.value;
  }

  get(): number | null {
    return this.value;
  }
}

export type CompassAccuracy = "high" | "medium" | "low";

/**
 * Estimate compass accuracy from a rolling window of smoothed headings.
 * Lower angular standard deviation -> higher accuracy.
 */
export class AccuracyEstimator {
  private samples: number[] = [];
  private readonly capacity: number;

  constructor(capacity = 12) {
    this.capacity = capacity;
  }

  push(heading: number) {
    this.samples.push(heading);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  reset() {
    this.samples = [];
  }

  /**
   * @param absolute whether the underlying sensor reading is absolute
   *                 (true heading). Non-absolute readings are capped to "low".
   */
  evaluate(absolute: boolean): CompassAccuracy | null {
    if (this.samples.length < 6) return null;
    const ref = this.samples[this.samples.length - 1];
    const variance =
      this.samples.reduce((acc, v) => acc + angleDiff(v, ref) ** 2, 0) /
      this.samples.length;
    const std = Math.sqrt(variance);
    if (!absolute) return "low";
    if (std < 2) return "high";
    if (std < 6) return "medium";
    return "low";
  }
}
