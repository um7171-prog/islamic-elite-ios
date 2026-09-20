import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, MapPin, Compass as CompassIcon, Map, Box, SunMoon, HelpCircle, Crosshair, RefreshCw, Settings as SettingsIcon, Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import {
  computeQiblaBearing,
  distanceToKaabaKm,
  angleDiff,
} from "@/lib/qibla";
import { useQiblaCompass, useUserLocation } from "@/hooks/useQiblaCompass";
import { isNativeApp, openNativeAppSettings } from "@/lib/platform";
import { hapticQiblaAligned, hapticTick, unlockAudio } from "@/lib/haptics";
import { toast } from "sonner";

// Convert decimal degrees to D° M' S" format
function toDMS(deg: number) {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  return `${d}° ${m}' ${s}"`;
}

/** Compass point labels in Arabic UI (N/E/S/W → ش/ق/ج/غ). */
const AR_COMPASS: Record<string, string> = { N: "ش", E: "ق", S: "ج", W: "غ", NE: "شق", SE: "جق", SW: "جغ", NW: "شغ" };

export function QiblaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, dir, lang } = useLocale();
  const { city } = useCity();

  // Live GPS position when available, otherwise the selected city (never crashes).
  const { coords, status: locStatus, request: requestLocation } = useUserLocation(open);
  const lat = coords?.lat ?? city.lat;
  const lng = coords?.lng ?? city.lng;

  // Real GPS fix required before the compass is shown — no silent fallback
  // to the selected city for the primary experience (previously the compass
  // rendered immediately using `city.lat/lng` while a small dismissible
  // "using your selected city instead" notice sat under it). `hasFix` gates
  // between three screens: a brief loading state, the compass, or a clear
  // "enable location" screen — the location flow only; not touched:
  // `useUserLocation`/`useQiblaCompass` and the bearing/distance math above.
  const hasFix = coords != null;
  const locationPending = !hasFix && (locStatus === "idle" || locStatus === "loading");
  const showLocationGate = !hasFix && (locStatus === "denied" || locStatus === "unavailable" || locStatus === "error");

  // Auto-recheck when the user comes back to the app/tab — e.g. after
  // granting location in system Settings and returning. This is what makes
  // "grant permission -> automatically back in the Qibla view" work without
  // an extra tap: once `requestLocation()` succeeds, `coords` updates,
  // `hasFix` becomes true, and the gate below disappears on its own.
  useEffect(() => {
    if (!open || hasFix) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && locStatus !== "loading") requestLocation();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [open, hasFix, locStatus, requestLocation]);

  const compass = useQiblaCompass(open);
  const { heading, accuracy, status: compassStatus } = compass;

  const qibla = useMemo(() => {
    try {
      return computeQiblaBearing(lat, lng);
    } catch {
      return 0;
    }
  }, [lat, lng]);
  const distanceKm = useMemo(() => {
    try {
      return distanceToKaabaKm(lat, lng);
    } catch {
      return 0;
    }
  }, [lat, lng]);

  const [aligned, setAligned] = useState(false);
  const [flash, setFlash] = useState(false);
  const [dragY, setDragY] = useState(0);
  const lastVibrateRef = useRef<number>(0);
  const wasAlignedRef = useRef<boolean>(false);
  const flashTimerRef = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleClose = () => {
    hapticTick();
    setDragY(0);
    compass.stop();
    onOpenChange(false);
  };


  const onTouchStart = (e: React.TouchEvent) => {
    // Only start drag when at top of scroll
    const target = e.currentTarget as HTMLElement;
    if (target.scrollTop > 0) return;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) setDragY(Math.min(dy, 240));
  };
  const onTouchEnd = () => {
    if (touchStartY.current == null) return;
    touchStartY.current = null;
    if (dragY > 120) handleClose();
    else setDragY(0);
  };

  const triggerAlignmentAlert = () => {
    hapticQiblaAligned();
    setFlash(true);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(false), 900);
    toast.success(t("Aligned to Qibla ✓", "اتجاه القبلة صحيح ✓"), { duration: 1800 });
  };

  // Audio unlock only — no sensor API is touched before the user allows it.
  useEffect(() => {
    if (!open) {
      setAligned(false);
      wasAlignedRef.current = false;
      return;
    }
    try {
      unlockAudio();
    } catch {
      /* ignore */
    }
  }, [open]);

  // Auto-start only when the platform grants motion access without a prompt
  // (Android / desktop). iOS always waits for a real user gesture, which it
  // gets from tapping the Compass tab (see onTabTap below) — there's no
  // separate "Enable compass" button anymore.
  // Depends on the specific primitive fields actually read here (not the
  // whole `compass` object, which useQiblaCompass returns as a brand-new
  // object every render) so this doesn't re-run on every re-render while
  // the dialog stays open.
  useEffect(() => {
    if (!open) return;
    if (compass.needsPermission) return;
    if (compass.status !== "idle") return;
    void compass.start().catch(() => undefined);
    // Deliberately narrower than the whole `compass` object (a new object
    // literal every render) — every field this effect actually reads is
    // already listed above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, compass.needsPermission, compass.status, compass.start]);

  // Alignment feedback derived from the hook's heading — pure, cannot throw.
  useEffect(() => {
    if (heading == null) {
      setAligned(false);
      return;
    }
    const d = Math.abs(angleDiff(qibla, heading));
    const isAligned = d <= 3;
    setAligned(isAligned);
    if (isAligned && !wasAlignedRef.current) {
      wasAlignedRef.current = true;
      const now = Date.now();
      if (now - lastVibrateRef.current > 800) {
        lastVibrateRef.current = now;
        triggerAlignmentAlert();
      }
    } else if (!isAligned && wasAlignedRef.current && d > 6) {
      wasAlignedRef.current = false;
    }
  }, [heading, qibla]);

  useEffect(() => () => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
  }, []);

  const enableCompass = async () => {
    hapticTick();
    try {
      await compass.start();
    } catch {
      toast.error(t("Could not start the compass.", "تعذّر تشغيل البوصلة."));
    }
  };

  const retry = async () => {
    compass.stop();
    requestLocation();
    await enableCompass();
  };

  const openSettings = () => {
    if (isNativeApp()) {
      void openNativeAppSettings();
    } else {
      toast(t("Enable location for this site in your browser settings.", "فعّل إذن الموقع لهذا الموقع من إعدادات المتصفح."));
    }
  };


  // World-rotation: rotating the rose by -heading keeps N pointing north.
  // When heading unknown, keep static and place Kaaba marker at qibla angle (fixed at top here per design).
  const roseRotation = heading == null ? -qibla : -heading; // so Kaaba (fixed at top) corresponds to qibla
  const delta = heading == null ? null : Math.abs(angleDiff(qibla, heading));

  // Tab taps: the Compass tab is the only view this dialog actually
  // renders — Map / AR / Sun & Moon have no implementation anywhere in
  // this project (no map or AR library is installed, and there is no
  // sun/moon Qibla-finding feature; the unrelated "Desert Mode" moon-phase
  // panel is a different feature entirely). Rather than silently doing
  // nothing (the previous behavior — these were plain <div>s with no
  // onClick at all) or faking a screen for them, each tap gives real
  // feedback: a haptic tick plus an honest "not available yet" toast.
  const onTabTap = (id: "compass" | "map" | "ar" | "sun-moon") => {
    hapticTick();
    if (id === "compass") {
      // Already the active/only view — but it's also the one real user
      // gesture always available to (re)start things that need one:
      // - if we're sitting on the "enable location" screen, re-check location.
      // - if the compass sensor still needs its iOS permission prompt (which
      //   browsers only allow from inside a real click handler), start it
      //   here instead of a separate "Enable compass" button — removes the
      //   old standalone button/panel without losing the ability to grant
      //   compass access at all.
      if (!hasFix && locStatus !== "loading") requestLocation();
      if (compass.needsPermission && compassStatus !== "running" && compassStatus !== "requesting") {
        void enableCompass();
      }
      return;
    }
    const messages: Record<Exclude<typeof id, "compass">, [string, string]> = {
      map: ["Map view isn't available yet.", "عرض الخريطة غير متاح حاليًا."],
      ar: ["Augmented reality view isn't available yet.", "الواقع المعزز غير متاح حاليًا."],
      "sun-moon": ["Sun & Moon view isn't available yet.", "عرض الشمس والقمر غير متاح حاليًا."],
    };
    const [en, ar] = messages[id];
    toast(t(en, ar));
  };

  // Tabs — same icons/order/appearance as the reference design; only the
  // tap behavior above is new (previously visual-only, no onClick at all).
  const tabs = [
    { id: "compass" as const, icon: CompassIcon, label: t("Compass", "البوصلة"), active: true },
    { id: "map" as const, icon: Map, label: t("Map", "الخارطة") },
    { id: "ar" as const, icon: Box, label: t("AR", "الواقع المعزز"), lock: true },
    { id: "sun-moon" as const, icon: SunMoon, label: t("Sun & Moon", "الشمس والقمر") },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent
        dir={dir}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragY > 0 ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms",
          opacity: dragY > 0 ? Math.max(0.5, 1 - dragY / 400) : 1,
        }}
        className="qibla-fullscreen qibla-hide-default-close p-0 gap-0 overflow-y-auto bg-[hsl(var(--qibla-page-bg))] text-[hsl(var(--qibla-page-fg))]"
      >
        <DialogTitle className="sr-only">{t("Qibla Direction", "اتجاه القبلة")}</DialogTitle>

        {/* Flash overlay */}
        <div
          aria-hidden
          className={`pointer-events-none fixed inset-0 z-50 transition-opacity duration-300 ${flash ? "opacity-100 animate-pulse" : "opacity-0"}`}
          style={{
            background: "radial-gradient(circle at 50% 50%, hsl(200 90% 50% / 0.45) 0%, hsl(200 90% 50% / 0.15) 45%, transparent 75%)",
          }}
        />

        {/* ===== HEADER ===== */}
        <div className="relative">
          {/* Light blue top band */}
          <div className="bg-[hsl(var(--qibla-ring-blue))] px-4 pt-3 pb-3 text-white">
            {/* Grab handle */}
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/40" aria-hidden />
            <div className="flex items-center justify-between">
              <button
                onClick={handleClose}
                className="h-10 w-10 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/30 active:scale-95 transition flex items-center justify-center"
                aria-label={t("Close", "إغلاق")}
              >
                <ChevronLeft className={`h-6 w-6 ${dir === "rtl" ? "rotate-180" : ""}`} strokeWidth={2.5} />
              </button>
              <h1 className="text-lg font-semibold">{t("Qibla", "القبلة")}</h1>
              <div className="w-10" />
            </div>
          </div>

          {/* Dark blue tabs band */}
          <div className="bg-[hsl(var(--qibla-header-mid))] px-2 pt-3 pb-2">
            <div className="flex items-end justify-around">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabTap(tab.id)}
                    className={`relative flex-1 flex flex-col items-center gap-1 pb-1 active:scale-95 transition-transform ${
                      tab.active ? "text-white" : "text-white/70"
                    }`}
                  >
                    <div className="relative">
                      <Icon className="h-6 w-6" strokeWidth={2} />
                      {tab.lock && (
                        <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-[hsl(var(--qibla-cardinal-n))] flex items-center justify-center">
                          <span className="block h-1.5 w-1.5 rounded-[1px] bg-white" />
                        </span>
                      )}
                    </div>
                    <span className="text-xs">{tab.label}</span>
                    {tab.active && (
                      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-t-full bg-[hsl(var(--qibla-ring-blue))]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location bar */}
          <div className="bg-[hsl(var(--qibla-header-mid))] pb-3 px-4">
            <div className="mx-auto max-w-xs rounded-full bg-[hsl(var(--qibla-loc-pill))] border border-white/10 py-2 px-4 flex items-center justify-center gap-2 text-white">
              <span className="text-sm font-semibold">{t(city.en, city.ar)}</span>
              <MapPin className="h-4 w-4" />
            </div>
          </div>
        </div>

        {/* ===== BODY ===== */}
        <div className="relative px-4 pt-3 pb-6">
          {locationPending ? (
            /* Brief moment while the very first geolocation check is in
               flight — avoids flashing the compass with a wrong bearing
               before we know whether a real GPS fix is available. */
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: "hsl(var(--qibla-ring-blue))" }} />
              <p className="text-[13px] text-[hsl(var(--qibla-muted-fg))]">
                {t("Getting your location…", "جارٍ تحديد موقعك…")}
              </p>
            </div>
          ) : showLocationGate ? (
            /* Real "enable location" screen — replaces the old behavior of
               silently rendering the compass with the selected city's
               coordinates plus a small dismissible warning underneath. No
               fake/hardcoded coordinates are used here or anywhere else. */
            <div className="flex flex-col items-center text-center py-14 px-2">
              <div
                className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: "hsl(var(--qibla-ring-blue) / 0.15)" }}
              >
                <MapPin className="h-8 w-8" style={{ color: "hsl(var(--qibla-ring-blue))" }} />
              </div>
              <h2 className="text-base font-bold text-[hsl(var(--qibla-card-fg))] mb-1.5">
                {t("Location needed", "الموقع مطلوب")}
              </h2>
              <p className="text-[13px] text-[hsl(var(--qibla-muted-fg))] max-w-[280px]">
                {t(
                  "We need your location to determine the Qibla direction accurately.",
                  "نحتاج إلى موقعك لتحديد اتجاه القبلة بدقة.",
                )}
              </p>
              {locStatus === "denied" && (
                <p className="mt-2 text-[12px] text-[hsl(var(--destructive))] max-w-[280px]">
                  {t(
                    "Location access was denied. Location is required to find the Qibla direction.",
                    "تم رفض إذن الموقع. الموقع مطلوب لتحديد اتجاه القبلة.",
                  )}
                </p>
              )}
              {locStatus === "unavailable" && (
                <p className="mt-2 text-[12px] text-[hsl(var(--destructive))] max-w-[280px]">
                  {t(
                    "Location services seem to be turned off on your device. Please enable them to continue.",
                    "يبدو أن خدمة الموقع متوقفة في جهازك. الرجاء تفعيلها للمتابعة.",
                  )}
                </p>
              )}
              {locStatus === "error" && (
                <p className="mt-2 text-[12px] text-[hsl(var(--destructive))] max-w-[280px]">
                  {t("Couldn't get your location. Please try again.", "تعذّر تحديد موقعك. حاول مرة أخرى.")}
                </p>
              )}
              <div className="mt-5 w-full max-w-[260px]">
                <Button
                  onClick={locStatus === "error" ? requestLocation : openSettings}
                  className="w-full gap-1.5 bg-[hsl(var(--qibla-ring-blue))] hover:bg-[hsl(var(--qibla-ring-blue-2))] text-white"
                >
                  <MapPin className="h-4 w-4" />
                  {t("Enable Location", "تفعيل الموقع")}
                </Button>
              </div>
            </div>
          ) : (
          <>
          {/* Coordinates row */}
          <div className="text-center text-[13px] text-[hsl(var(--qibla-coord-fg))] font-medium">
            {t("Latitude", "خط العرض")}: <span dir="ltr">{toDMS(lat)}</span> · {t("Longitude", "خط الطول")}: <span dir="ltr">{toDMS(lng)}</span>
          </div>

          {/* Help circle (top corner) */}
          <button
            type="button"
            onClick={() => toast(t("Hold the device flat and away from metal.", "أمسك الجهاز بشكل أفقي وبعيداً عن المعادن."))}
            className="absolute top-2 right-3 h-12 w-12 rounded-full bg-[hsl(var(--qibla-ring-blue))] text-white flex items-center justify-center shadow-md"
            aria-label="Help"
          >
            <div className="relative">
              <CompassIcon className="h-6 w-6" />
              <HelpCircle className="absolute -bottom-1 -right-1 h-4 w-4 bg-[hsl(var(--qibla-ring-blue))] rounded-full" />
            </div>
          </button>

          {/* Decorative ornament */}
          <div className="mt-4 flex justify-center" aria-hidden>
            <svg width="180" height="50" viewBox="0 0 180 50" className="text-[hsl(var(--qibla-card-fg))]">
              <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                <path d="M90 8 L90 22" />
                <path d="M85 12 Q90 4 95 12" />
                <path d="M70 28 Q80 12 90 28 Q100 12 110 28" />
                <path d="M55 36 Q65 22 80 34" />
                <path d="M125 36 Q115 22 100 34" />
                <path d="M40 42 Q55 30 70 38" />
                <path d="M140 42 Q125 30 110 38" />
                <circle cx="90" cy="8" r="1.5" fill="currentColor" />
                <circle cx="70" cy="28" r="1" fill="currentColor" />
                <circle cx="110" cy="28" r="1" fill="currentColor" />
              </g>
            </svg>
          </div>

          {/* ===== COMPASS ===== */}
          <div className="relative mx-auto mt-2 aspect-square w-full max-w-[340px]">
            {/* Kaaba marker fixed at top */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-1 z-20">
              <KaabaIcon className={`h-9 w-9 ${aligned ? "drop-shadow-[0_0_8px_hsl(var(--qibla-ring-blue))]" : ""}`} />
            </div>

            {/* Outer ring with repeating decorative text */}
            <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
              <defs>
                <path id="outerTextPath" d="M 100,100 m -94,0 a 94,94 0 1,1 188,0 a 94,94 0 1,1 -188,0" />
              </defs>
              {/* outer subtle ring */}
              <circle cx="100" cy="100" r="98" fill="none" stroke="hsl(var(--qibla-outer-ring))" strokeWidth="0.5" />
              <circle cx="100" cy="100" r="88" fill="none" stroke="hsl(var(--qibla-outer-ring))" strokeWidth="0.4" />
              <text fill="hsl(var(--qibla-outer-text))" fontSize="6" letterSpacing="3" fontWeight="700">
                <textPath href="#outerTextPath" startOffset="0">
                  {Array.from({ length: 12 }, () => `★ ${t("QIBLA", "القبلة")}`).join(" ")}
                </textPath>
              </text>
            </svg>

            {/* Blue accent ring */}
            <div
              className="absolute rounded-full"
              style={{
                inset: "8%",
                background: "linear-gradient(180deg, hsl(var(--qibla-ring-blue)) 0%, hsl(var(--qibla-ring-blue-2)) 100%)",
                boxShadow: "inset 0 2px 6px hsl(198 70% 40%), 0 4px 12px hsl(198 60% 50% / 0.3)",
              }}
            />

            {/* Inner face */}
            <div
              className="absolute rounded-full bg-[hsl(var(--qibla-face-bg))]"
              style={{
                inset: "13%",
                boxShadow: "inset 0 2px 8px hsl(var(--qibla-face-shadow))",
              }}
            />

            {/* Rotating dial */}
            <svg
              viewBox="0 0 200 200"
              className="absolute inset-0 w-full h-full"
              style={{
                transform: `rotate(${roseRotation}deg)`,
                transition: "transform 80ms linear",
              }}
            >
              {/* Degree ring (orange dotted) */}
              <circle cx="100" cy="100" r="72" fill="none" stroke="hsl(var(--qibla-tick-major))" strokeWidth="0.6" strokeDasharray="1 2" />
              <circle cx="100" cy="100" r="68" fill="none" stroke="hsl(28 80% 55% / 0.4)" strokeWidth="0.4" />

              {/* Degree ticks every 5° */}
              {Array.from({ length: 72 }, (_, i) => {
                const deg = i * 5;
                const isMajor = deg % 15 === 0;
                const rad = ((deg - 90) * Math.PI) / 180;
                const r1 = 72;
                const r2 = isMajor ? 66 : 69;
                const x1 = 100 + Math.cos(rad) * r1;
                const y1 = 100 + Math.sin(rad) * r1;
                const x2 = 100 + Math.cos(rad) * r2;
                const y2 = 100 + Math.sin(rad) * r2;
                return (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={isMajor ? "hsl(var(--qibla-tick-major))" : "hsl(var(--qibla-tick))"}
                    strokeWidth={isMajor ? 0.8 : 0.4}
                  />
                );
              })}

              {/* Degree numbers every 15° */}
              {Array.from({ length: 24 }, (_, i) => {
                const deg = i * 15;
                const rad = ((deg - 90) * Math.PI) / 180;
                const r = 62;
                const x = 100 + Math.cos(rad) * r;
                const y = 100 + Math.sin(rad) * r;
                return (
                  <text
                    key={deg}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="5"
                    fill="hsl(var(--qibla-deg-text))"
                    fontWeight="600"
                    transform={`rotate(${deg} ${x} ${y})`}
                  >
                    {deg.toString().padStart(3, "0")}
                  </text>
                );
              })}

              {/* 8-point compass rose (light blue diamonds) */}
              <g>
                {/* 4 large diamonds (N/E/S/W) */}
                {[0, 90, 180, 270].map((a) => (
                  <polygon
                    key={`major-${a}`}
                    points="100,55 105,100 100,100 95,100"
                    fill="hsl(var(--qibla-rose-major-a))"
                    transform={`rotate(${a} 100 100)`}
                  />
                ))}
                {[0, 90, 180, 270].map((a) => (
                  <polygon
                    key={`major2-${a}`}
                    points="100,55 100,100 95,100"
                    fill="hsl(var(--qibla-rose-major-b))"
                    transform={`rotate(${a} 100 100)`}
                  />
                ))}
                {/* 4 diagonal smaller diamonds */}
                {[45, 135, 225, 315].map((a) => (
                  <polygon
                    key={`minor-${a}`}
                    points="100,70 103,100 100,100 97,100"
                    fill="hsl(var(--qibla-rose-minor-a))"
                    transform={`rotate(${a} 100 100)`}
                  />
                ))}
                {[45, 135, 225, 315].map((a) => (
                  <polygon
                    key={`minor2-${a}`}
                    points="100,70 100,100 97,100"
                    fill="hsl(var(--qibla-rose-minor-b))"
                    transform={`rotate(${a} 100 100)`}
                  />
                ))}
              </g>

              {/* Cardinal letters */}
              {[
                { l: "N", a: 0, c: "hsl(var(--qibla-cardinal-n))" },
                { l: "E", a: 90, c: "hsl(var(--qibla-deg-text))" },
                { l: "S", a: 180, c: "hsl(var(--qibla-deg-text))" },
                { l: "W", a: 270, c: "hsl(var(--qibla-deg-text))" },
              ].map(({ l, a, c }) => {
                const rad = ((a - 90) * Math.PI) / 180;
                const r = 48;
                const x = 100 + Math.cos(rad) * r;
                const y = 100 + Math.sin(rad) * r;
                return (
                  <text
                    key={l}
                    x={x} y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="10"
                    fontWeight="800"
                    fill={c}
                    transform={`rotate(${a} ${x} ${y})`}
                  >
                    {lang === "ar" ? AR_COMPASS[l] ?? l : l}
                  </text>
                );
              })}
              {[
                { l: "NE", a: 45 },
                { l: "SE", a: 135 },
                { l: "SW", a: 225 },
                { l: "NW", a: 315 },
              ].map(({ l, a }) => {
                const rad = ((a - 90) * Math.PI) / 180;
                const r = 44;
                const x = 100 + Math.cos(rad) * r;
                const y = 100 + Math.sin(rad) * r;
                return (
                  <text
                    key={l}
                    x={x} y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="6"
                    fontWeight="700"
                    fill="hsl(var(--qibla-cardinal))"
                    transform={`rotate(${a} ${x} ${y})`}
                  >
                    {lang === "ar" ? AR_COMPASS[l] ?? l : l}
                  </text>
                );
              })}
            </svg>

            {/* Fixed needle pointing up (teardrop with orange tip) */}
            <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full pointer-events-none">
              <defs>
                <linearGradient id="needleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--qibla-needle-a))" />
                  <stop offset="100%" stopColor="hsl(var(--qibla-needle-b))" />
                </linearGradient>
              </defs>
              {/* Needle body: teardrop */}
              <path
                d="M 100 30 Q 88 95 100 110 Q 112 95 100 30 Z"
                fill="url(#needleGrad)"
              />
              {/* Pivot disc */}
              <circle cx="100" cy="105" r="9" fill="hsl(var(--qibla-pivot))" />
              <circle cx="100" cy="105" r="6" fill="hsl(var(--qibla-pivot-center))" stroke="hsl(var(--qibla-pivot-ring))" strokeWidth="1.5" />
              <circle cx="100" cy="105" r="2.5" fill="hsl(var(--qibla-pivot-ring))" />
            </svg>
          </div>

          {/* ===== BOTTOM ROW ===== */}
          <div className="mt-6 flex items-center justify-between gap-2">
            {/* Accuracy badge — reflects the real accuracy tier computed by
                AccuracyEstimator from actual heading samples. This used to
                show a fixed "35/44/52 μT" number with no magnetometer ever
                read anywhere in this app — a fabricated measurement. */}
            <div className="h-14 w-14 rounded-full bg-[hsl(var(--qibla-card-bg))] shadow flex flex-col items-center justify-center text-[hsl(var(--qibla-coord-fg))]">
              <span className="text-[13px] font-bold leading-none">
                {accuracy === "high" ? "●●●" : accuracy === "medium" ? "●●" : accuracy === "low" ? "●" : "—"}
              </span>
              <span className="text-xs text-[hsl(var(--qibla-muted-fg))] mt-0.5">{t("Accuracy", "الدقة")}</span>
            </div>

            {/* Distance card */}
            <div className="flex-1 rounded-xl bg-[hsl(var(--qibla-card-bg))] border border-[hsl(var(--qibla-card-border))] py-2 px-2 text-center shadow-sm">
              <div className="flex items-center justify-center gap-1.5">
                <KaabaIcon className="h-4 w-4" />
                <span className="font-bold text-[14px]">{Math.round(distanceKm).toLocaleString()} KM</span>
              </div>
              <div className="text-xs text-[hsl(var(--qibla-muted-fg))] mt-0.5">
                {t("Distance to Kaaba", "البُعد عن الكعبة")}
              </div>
            </div>

            {/* Qibla angle card */}
            <div className="flex-1 rounded-xl bg-[hsl(var(--qibla-card-bg))] border border-[hsl(var(--qibla-card-border))] py-2 px-2 text-center shadow-sm">
              <div className="flex items-center justify-center gap-1.5">
                <CompassIcon className="h-4 w-4 text-[hsl(var(--qibla-card-fg))]" />
                <span className="font-bold text-[14px]">{Math.round(qibla)}°</span>
              </div>
              <div className="text-xs text-[hsl(var(--qibla-muted-fg))] mt-0.5">
                {t("Qibla from North", "اتجاه القبلة من الشمال")}
              </div>
            </div>

            {/* Calibration button */}
            <button
              type="button"
              onClick={() => toast(t("Calibrate by waving in a figure-8 motion.", "عاير البوصلة بحركة على شكل ٨."))}
              className="relative h-14 w-14 rounded-full bg-[hsl(var(--qibla-card-bg))] shadow flex items-center justify-center text-[hsl(var(--qibla-card-fg))]"
              aria-label={t("Calibrate", "معايرة")}
            >
              <Crosshair className="h-6 w-6" />
              {accuracy === "low" && (
                <span className="absolute -bottom-0.5 right-1 h-3 w-3 rounded-full bg-[hsl(var(--qibla-cardinal-n))] flex items-center justify-center text-white text-[8px] font-bold">!</span>
              )}
            </button>
          </div>

          {/* Status line */}
          <div className="text-center mt-4 min-h-[18px]">
            {locStatus === "loading" ? (
              <p className="flex items-center justify-center gap-1.5 text-[12px] text-[hsl(var(--qibla-muted-fg))]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("Getting your location…", "جارٍ تحديد موقعك…")}
              </p>
            ) : heading == null ? (
              <p className="text-[12px] text-[hsl(var(--qibla-muted-fg))]">
                {compassStatus === "requesting"
                  ? t("Requesting compass access…", "جارٍ طلب إذن البوصلة…")
                  : compass.needsPermission
                    ? t("Tap Compass above to activate it", "اضغط على البوصلة أعلاه لتفعيلها")
                    : t("Move device to activate compass", "حرّك الجهاز لتفعيل البوصلة")}
              </p>
            ) : aligned ? (
              <p className="text-[hsl(var(--qibla-status-aligned))] font-bold text-sm">{t("Aligned to Qibla ✓", "اتجاه صحيح نحو القبلة ✓")}</p>
            ) : (
              <p className={`text-[12px] ${accuracy === "high" ? "text-[hsl(var(--qibla-status-aligned))]" : accuracy === "medium" ? "text-[hsl(var(--qibla-tick-major))]" : "text-[hsl(var(--destructive))]"}`}>
                {delta != null && `${t("Offset", "الانحراف")}: ${delta.toFixed(0)}° · `}
                {accuracy === "high" && t("High accuracy", "دقة عالية")}
                {accuracy === "medium" && t("Medium accuracy", "دقة متوسطة")}
                {accuracy === "low" && t("Low accuracy", "دقة منخفضة")}
                {!accuracy && t("Reading…", "جارٍ القراءة…")}
              </p>
            )}
          </div>

          {/* Calibration hint when the reading is noisy */}
          {accuracy === "low" && (
            <p className="mt-2 text-center text-xs text-[hsl(var(--qibla-tick-major))]">
              {t("Move your phone in a figure-8 to calibrate the compass.", "حرّك الهاتف على شكل الرقم ٨ لمعايرة البوصلة.")}
            </p>
          )}

          {/* Compass sensor problem panel — never a white screen. Location
              issues are handled above by the "enable location" screen, so
              this only ever needs to cover the compass sensor itself. */}
          {(compassStatus === "denied" || compassStatus === "unsupported" || compassStatus === "error") && (
            <div className="mt-3 rounded-xl border border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/10 p-3 text-[12px]">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--destructive))]" />
                <div className="space-y-1">
                  {compassStatus === "denied" && (
                    <p>{t("Compass access was denied. Allow motion & orientation access, then retry.", "تم رفض إذن البوصلة. اسمح بالوصول للحركة والاتجاه ثم أعد المحاولة.")}</p>
                  )}
                  {compassStatus === "unsupported" && (
                    <p>{t("This device does not provide compass data. The Qibla angle below is still correct.", "هذا الجهاز لا يوفر بيانات البوصلة. زاوية القبلة بالأسفل صحيحة رغم ذلك.")}</p>
                  )}
                  {compassStatus === "error" && (
                    <p>{t("The compass could not be started.", "تعذّر تشغيل البوصلة.")}</p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" className="gap-1.5" onClick={retry}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("Retry", "إعادة المحاولة")}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={openSettings}>
                  <SettingsIcon className="h-3.5 w-3.5" />
                  {t("Open Settings", "فتح الإعدادات")}
                </Button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => { unlockAudio(); triggerAlignmentAlert(); }}
            className="mt-3 w-full text-xs text-[hsl(var(--qibla-muted-fg))] underline-offset-2 hover:underline"
          >
            {t("Test alignment alert", "اختبار تنبيه القبلة")}
          </button>
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Small inline Kaaba icon (cube with gold band + door)
function KaabaIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="4" y="6" width="24" height="22" rx="1" fill="hsl(220 15% 8%)" />
      <rect x="4" y="13" width="24" height="3" fill="hsl(45 75% 55%)" />
      <rect x="4" y="6" width="24" height="1.5" fill="hsl(45 75% 55%)" />
      <rect x="20" y="17" width="4" height="9" fill="hsl(45 75% 55%)" />
      <rect x="4" y="27" width="24" height="2" fill="hsl(45 60% 45%)" />
    </svg>
  );
}
