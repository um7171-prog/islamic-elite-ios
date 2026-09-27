import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccuracyEstimator,
  HeadingSmoother,
  type CompassAccuracy,
} from "@/lib/qibla";

/**
 * Compass + location plumbing for the Qibla screen.
 *
 * Design rules (all of them are crash-prevention measures):
 *  - No sensor/native API is ever touched at import time or on render.
 *  - Every browser/native call is wrapped in try/catch; a failure produces a
 *    state, never an exception that can unwind into the WKWebView.
 *  - Exactly one `deviceorientation` listener can exist at a time (ref guard),
 *    and it is always removed on stop/unmount — no leaks, no duplicate events.
 *  - The compass starts on its own when the Qibla screen opens. iOS only lets
 *    `DeviceOrientationEvent.requestPermission()` run inside a user gesture, so
 *    the tap that OPENS the screen primes it (`requestMotionPermission()`), and
 *    the answer is remembered for the rest of the session — never asked twice.
 *    If no gesture was available (deep link, cold launch straight into /qibla),
 *    the status is "needs-gesture" and the very next tap anywhere starts it.
 */

export type CompassStatus =
  | "idle"
  | "requesting"
  | "needs-gesture"
  | "running"
  | "denied"
  | "unsupported"
  | "error";

export type LocationStatus =
  | "idle"
  | "loading"
  | "ready"
  | "denied"
  | "unavailable"
  | "error";

export interface Coords {
  lat: number;
  lng: number;
}

function hasOrientationSupport(): boolean {
  try {
    return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  } catch {
    return false;
  }
}

/** iOS 13+ adds a static requestPermission() to DeviceOrientationEvent (not in the DOM typings). */
type OrientationEventWithPermission = { requestPermission?: () => Promise<unknown> };
const orientationEventClass = () =>
  (window as unknown as { DeviceOrientationEvent?: OrientationEventWithPermission }).DeviceOrientationEvent;

function needsExplicitPermission(): boolean {
  try {
    const DOE = orientationEventClass();
    return !!DOE && typeof DOE.requestPermission === "function";
  } catch {
    return false;
  }
}

export type MotionPermissionResult = "granted" | "denied" | "needs-gesture";

/** Session memory of the iOS Motion & Orientation answer (module level: survives closing/reopening the screen). */
let motionGranted = false;
let pendingPermission: Promise<MotionPermissionResult> | null = null;

/**
 * Asks for Motion & Orientation access where the platform needs it (iOS 13+), once per session.
 * Call it synchronously from a tap handler (e.g. the tap that opens the Qibla screen): iOS rejects
 * the request outside a user gesture — that rejection is "needs-gesture", NOT a denial.
 * Everywhere else (Android, desktop) it resolves "granted" immediately.
 */
export function requestMotionPermission(): Promise<MotionPermissionResult> {
  if (!needsExplicitPermission() || motionGranted) return Promise.resolve("granted");
  if (pendingPermission) return pendingPermission;
  let raw: Promise<unknown>;
  try {
    raw = Promise.resolve(orientationEventClass()!.requestPermission!());
  } catch {
    return Promise.resolve("needs-gesture");
  }
  pendingPermission = raw
    .then(
      (res): MotionPermissionResult => {
        if (res === "granted") {
          motionGranted = true;
          return "granted";
        }
        return "denied";
      },
      // Thrown when not triggered by a user gesture — the user hasn't said no.
      (): MotionPermissionResult => "needs-gesture",
    )
    .finally(() => {
      pendingPermission = null;
    });
  return pendingPermission;
}

/** Test hook: forget the session's permission answer. */
export function __resetMotionPermissionForTests() {
  motionGranted = false;
  pendingPermission = null;
}

export function useQiblaCompass(active: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  const [absolute, setAbsolute] = useState(false);
  const [accuracy, setAccuracy] = useState<CompassAccuracy | null>(null);
  const [status, setStatus] = useState<CompassStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const smoother = useRef(new HeadingSmoother());
  const estimator = useRef(new AccuracyEstimator());
  const listenerRef = useRef<((e: Event) => void) | null>(null);
  const gotDataRef = useRef(false);
  const watchdogRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchdogRef.current != null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    const h = listenerRef.current;
    if (h) {
      try {
        window.removeEventListener("deviceorientationabsolute", h, true);
        window.removeEventListener("deviceorientation", h, true);
      } catch {
        /* ignore */
      }
      listenerRef.current = null;
    }
    smoother.current.reset();
    estimator.current.reset();
    gotDataRef.current = false;
    setHeading(null);
    setAccuracy(null);
  }, []);

  const attach = useCallback(() => {
    if (listenerRef.current) return; // never register twice
    const handler = (evt: Event) => {
      try {
        const e = evt as DeviceOrientationEvent & {
          webkitCompassHeading?: number;
          webkitCompassAccuracy?: number;
        };
        let raw: number | null = null;
        let isAbsolute = false;

        // iOS exposes a true (magnetic-north corrected) heading.
        if (typeof e.webkitCompassHeading === "number" && !Number.isNaN(e.webkitCompassHeading)) {
          raw = e.webkitCompassHeading;
          isAbsolute = true;
        } else if (typeof e.alpha === "number" && !Number.isNaN(e.alpha)) {
          raw = 360 - e.alpha;
          isAbsolute = !!e.absolute;
        }
        if (raw == null) return;

        let screenAngle = 0;
        try {
          screenAngle =
            (typeof screen !== "undefined" && screen.orientation && screen.orientation.angle) ||
            (window as unknown as { orientation?: number }).orientation ||
            0;
        } catch {
          screenAngle = 0;
        }

        const normalized = ((raw - screenAngle) % 360 + 360) % 360;
        const smoothed = smoother.current.update(normalized);
        gotDataRef.current = true;
        setAbsolute(isAbsolute);
        setHeading(smoothed);
        estimator.current.push(smoothed);
        const acc = estimator.current.evaluate(isAbsolute);
        if (acc) setAccuracy(acc);
      } catch {
        /* a bad sensor frame must never break the page */
      }
    };

    listenerRef.current = handler;
    try {
      window.addEventListener("deviceorientationabsolute", handler, true);
      window.addEventListener("deviceorientation", handler, true);
      setStatus("running");
    } catch {
      listenerRef.current = null;
      setStatus("error");
      setError("listener");
    }
  }, []);

  const activeRef = useRef(active);
  activeRef.current = active;

  const start = useCallback(async () => {
    if (!hasOrientationSupport()) {
      setStatus("unsupported");
      return;
    }
    setError(null);
    if (needsExplicitPermission()) {
      setStatus("requesting");
      const res = await requestMotionPermission();
      if (!activeRef.current) return; // screen closed while iOS was answering
      if (res === "denied") {
        setStatus("denied");
        return;
      }
      if (res === "needs-gesture") {
        setStatus("needs-gesture");
        return;
      }
    }
    attach();

    // If no sensor frame ever arrives (e.g. a Wi-Fi-only iPad with no
    // magnetometer, or a browser that silently drops the API), tell the user
    // instead of spinning on "Move device to activate compass" forever.
    // Previously this re-set "running" to "running" — a no-op that never
    // actually surfaced the existing "unsupported" message panel.
    if (watchdogRef.current != null) window.clearTimeout(watchdogRef.current);
    watchdogRef.current = window.setTimeout(() => {
      watchdogRef.current = null;
      if (!gotDataRef.current && listenerRef.current) setStatus("unsupported");
    }, 4000);
  }, [attach]);

  // iOS refused to ask without a gesture: the next tap anywhere on the screen starts the compass.
  useEffect(() => {
    if (!active || status !== "needs-gesture") return;
    const onGesture = () => {
      window.removeEventListener("touchend", onGesture, true);
      window.removeEventListener("click", onGesture, true);
      void start();
    };
    window.addEventListener("touchend", onGesture, true);
    window.addEventListener("click", onGesture, true);
    return () => {
      window.removeEventListener("touchend", onGesture, true);
      window.removeEventListener("click", onGesture, true);
    };
  }, [active, status, start]);

  // Always tear everything down when the screen closes or unmounts.
  useEffect(() => {
    if (!active) {
      stop();
      setStatus("idle");
    }
    return () => stop();
  }, [active, stop]);

  return {
    heading,
    absolute,
    accuracy,
    status,
    error,
    start,
    stop,
    needsPermission: needsExplicitPermission(),
    hasData: heading != null,
  };
}

/** The last GPS fix this session. Reopening the Qibla screen reuses it instead of asking for the
 * location again; it's refreshed only when older than this (the Qibla bearing barely moves). */
export const LOCATION_REUSE_MS = 30 * 60_000;
let lastFix: { coords: Coords; at: number } | null = null;

function freshFix(): Coords | null {
  return lastFix && Date.now() - lastFix.at < LOCATION_REUSE_MS ? lastFix.coords : null;
}

/** Test hook: forget the session's GPS fix. */
export function __resetLocationCacheForTests() {
  lastFix = null;
}

/** Geolocation with explicit, non-throwing error states. */
export function useUserLocation(active: boolean) {
  const [coords, setCoords] = useState<Coords | null>(() => freshFix());
  const [status, setStatus] = useState<LocationStatus>(() => (freshFix() ? "ready" : "idle"));
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("loading");
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mounted.current) return;
          const { latitude, longitude } = pos.coords;
          if (typeof latitude !== "number" || typeof longitude !== "number" || Number.isNaN(latitude)) {
            setStatus("error");
            return;
          }
          lastFix = { coords: { lat: latitude, lng: longitude }, at: Date.now() };
          setCoords({ lat: latitude, lng: longitude });
          setStatus("ready");
        },
        (err) => {
          if (!mounted.current) return;
          // code 1 PERMISSION_DENIED, code 2 POSITION_UNAVAILABLE (permission
          // is granted but the device's location service itself is off / no
          // fix could be produced — a distinct case from a denied permission
          // or a plain timeout, so the UI can tell the user what to enable).
          if (err && err.code === 1) setStatus("denied");
          else if (err && err.code === 2) setStatus("unavailable");
          else setStatus("error");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    // Reopened within the reuse window: the session's fix is used straight away, no new request.
    const cached = freshFix();
    if (cached) {
      setCoords((c) => c ?? cached);
      if (status === "idle") setStatus("ready");
      return;
    }
    if (status === "idle") request();
  }, [active, status, request]);

  return { coords, status, request };
}
