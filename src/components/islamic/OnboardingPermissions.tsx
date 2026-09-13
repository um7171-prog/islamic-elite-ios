import { useEffect, useRef } from "react";
import { useCity } from "@/contexts/CityContext";
import { LOCAL_LOCATIONS } from "@/lib/locations";
import {
  checkLocationPermission,
  checkNotificationPermission,
  runFirstLaunchPermissionFlow,
} from "@/lib/firstLaunchPermissions";

function nearestCity(lat: number, lng: number) {
  let best = LOCAL_LOCATIONS[0];
  let bestD = Infinity;
  for (const c of LOCAL_LOCATIONS) {
    const d = (c.lat - lat) ** 2 + ((c.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/**
 * Headless: no welcome screen, no in-app modal.
 * On first launch it triggers the native Apple dialogs in sequence —
 * location (When In Use) first, then notifications — and lets the user into
 * the app either way. Permission status is shown on the notifications page.
 */
export function OnboardingPermissions() {
  const { setCity } = useCity();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const [loc, notif] = await Promise.all([
        checkLocationPermission(),
        checkNotificationPermission(),
      ]);
      if (cancelled) return;
      // Already answered before → open straight into the app.
      if (loc !== "prompt" && loc !== "unknown" && notif !== "prompt") return;

      const res = await runFirstLaunchPermissionFlow();
      if (cancelled || !res.ran || !res.position) return;
      setCity(nearestCity(res.position.coords.latitude, res.position.coords.longitude));
    }, 400);

    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [setCity]);

  return null;
}
