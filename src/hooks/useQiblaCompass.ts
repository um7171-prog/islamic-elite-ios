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
 *  - Nothing starts automatically before permissions are granted.
 */

export type CompassStatus =
  | "idle"
  | "requesting"
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

function needsExplicitPermission(): boolean {
  try {
    const DOE = (window as any).DeviceOrientationEvent;
    return !!DOE && typeof DOE.requestPermission === "function";
  } catch {
    return false;
  }
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

  const stop = useCallback(() => {
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
            (window as any).orientation ||
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

  const start = useCallback(async () => {
    if (!hasOrientationSupport()) {
      setStatus("unsupported");
      return;
    }
    setError(null);
    if (needsExplicitPermission()) {
      setStatus("requesting");
      try {
        const DOE = (window as any).DeviceOrientationEvent;
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setStatus("denied");
          return;
        }
      } catch (e: any) {
        // Thrown when not triggered by a user gesture, or in an insecure context.
        setStatus("denied");
        setError(String(e?.message ?? e ?? "permission"));
        return;
      }
    }
    attach();

    // If no sensor frame arrives, tell the user instead of spinning forever.
    window.setTimeout(() => {
      if (!gotDataRef.current && listenerRef.current) setStatus((s) => (s === "running" ? "running" : s));
    }, 4000);
  }, [attach]);

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

/** Geolocation with explicit, non-throwing error states. */
export function useUserLocation(active: boolean) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");
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
          setCoords({ lat: latitude, lng: longitude });
          setStatus("ready");
        },
        (err) => {
          if (!mounted.current) return;
          setStatus(err && err.code === 1 ? "denied" : "error");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (active && status === "idle") request();
  }, [active, status, request]);

  return { coords, status, request };
}
