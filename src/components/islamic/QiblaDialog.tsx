import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, MapPin, Compass as CompassIcon, Map, Box, SunMoon, HelpCircle, Crosshair } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import {
  computeQiblaBearing,
  distanceToKaabaKm,
  angleDiff,
  HeadingSmoother,
  AccuracyEstimator,
  type CompassAccuracy,
} from "@/lib/qibla";
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

export function QiblaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, dir } = useLocale();
  const { city } = useCity();
  const qibla = useMemo(() => computeQiblaBearing(city.lat, city.lng), [city.lat, city.lng]);
  const distanceKm = useMemo(() => distanceToKaabaKm(city.lat, city.lng), [city.lat, city.lng]);
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPerm, setNeedsPerm] = useState(false);
  const [aligned, setAligned] = useState(false);
  const [accuracy, setAccuracy] = useState<CompassAccuracy | null>(null);
  const [flash, setFlash] = useState(false);
  const [dragY, setDragY] = useState(0);
  const smootherRef = useRef(new HeadingSmoother());
  const accuracyRef = useRef(new AccuracyEstimator());
  const lastVibrateRef = useRef<number>(0);
  const wasAlignedRef = useRef<boolean>(false);
  const flashTimerRef = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleClose = () => {
    hapticTick();
    setDragY(0);
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

  useEffect(() => {
    if (!open) {
      setHeading(null);
      setAligned(false);
      setAccuracy(null);
      smootherRef.current.reset();
      accuracyRef.current.reset();
      wasAlignedRef.current = false;
      return;
    }
    unlockAudio();

    const updateHeading = (raw: number, absolute: boolean) => {
      const screenAngle = (screen.orientation && screen.orientation.angle) || (window as any).orientation || 0;
      let h = (raw - screenAngle + 360) % 360;
      if (h < 0) h += 360;
      const sm = smootherRef.current.update(h);
      setHeading(sm);
      accuracyRef.current.push(sm);
      const acc = accuracyRef.current.evaluate(absolute);
      if (acc) setAccuracy(acc);
      const delta = Math.abs(angleDiff(qibla, sm));
      const isAligned = delta <= 3;
      setAligned(isAligned);
      if (isAligned && !wasAlignedRef.current) {
        wasAlignedRef.current = true;
        const now = Date.now();
        if (now - lastVibrateRef.current > 800) {
          lastVibrateRef.current = now;
          triggerAlignmentAlert();
        }
      } else if (!isAligned && wasAlignedRef.current && delta > 6) {
        wasAlignedRef.current = false;
      }
    };

    const handler = (e: DeviceOrientationEvent & { webkitCompassHeading?: number; absolute?: boolean }) => {
      let h: number | null = null;
      let absolute = false;
      if (typeof e.webkitCompassHeading === "number") {
        h = e.webkitCompassHeading;
        absolute = true;
      } else if (e.alpha != null) {
        h = 360 - e.alpha;
        absolute = !!e.absolute;
      }
      if (h != null) updateHeading(h, absolute);
    };

    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      setNeedsPerm(true);
      return;
    }
    window.addEventListener("deviceorientationabsolute", handler as EventListener, true);
    window.addEventListener("deviceorientation", handler as EventListener, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler as EventListener, true);
      window.removeEventListener("deviceorientation", handler as EventListener, true);
    };
  }, [open, qibla]);

  const requestPerm = async () => {
    const DOE = (window as any).DeviceOrientationEvent;
    try {
      const res = await DOE.requestPermission();
      if (res === "granted") {
        setNeedsPerm(false);
        hapticTick();
        const handler = (e: any) => {
          const isAbsolute = typeof e.webkitCompassHeading === "number";
          const raw = isAbsolute ? e.webkitCompassHeading : (e.alpha != null ? 360 - e.alpha : null);
          if (raw == null) return;
          const screenAngle = (screen.orientation && screen.orientation.angle) || (window as any).orientation || 0;
          let h = (raw - screenAngle + 360) % 360;
          if (h < 0) h += 360;
          const sm = smootherRef.current.update(h);
          setHeading(sm);
          accuracyRef.current.push(sm);
          const acc = accuracyRef.current.evaluate(isAbsolute);
          if (acc) setAccuracy(acc);
          const delta = Math.abs(angleDiff(qibla, sm));
          const isAligned = delta <= 3;
          setAligned(isAligned);
          if (isAligned && !wasAlignedRef.current) {
            wasAlignedRef.current = true;
            const now = Date.now();
            if (now - lastVibrateRef.current > 800) {
              lastVibrateRef.current = now;
              triggerAlignmentAlert();
            }
          } else if (!isAligned && wasAlignedRef.current && delta > 6) {
            wasAlignedRef.current = false;
          }
        };
        window.addEventListener("deviceorientation", handler as EventListener, true);
      }
    } catch {}
  };

  // World-rotation: rotating the rose by -heading keeps N pointing north.
  // When heading unknown, keep static and place Kaaba marker at qibla angle (fixed at top here per design).
  const roseRotation = heading == null ? -qibla : -heading; // so Kaaba (fixed at top) corresponds to qibla
  const delta = heading == null ? null : Math.abs(angleDiff(qibla, heading));

  // Tabs (visual only — first tab active)
  const tabs = [
    { icon: CompassIcon, label: t("Compass", "البوصلة"), active: true },
    { icon: Map, label: t("Map", "الخارطة") },
    { icon: Box, label: t("AR", "الواقع المعزز"), lock: true },
    { icon: SunMoon, label: t("Sun & Moon", "الشمس والقمر") },
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
              {tabs.map((tab, i) => {
                const Icon = tab.icon;
                return (
                  <div
                    key={i}
                    className={`relative flex-1 flex flex-col items-center gap-1 pb-1 ${
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
                    <span className="text-[11px]">{tab.label}</span>
                    {tab.active && (
                      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-t-full bg-[hsl(var(--qibla-ring-blue))]" />
                    )}
                  </div>
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
          {/* Coordinates row */}
          <div className="text-center text-[13px] text-[hsl(var(--qibla-coord-fg))] font-medium">
            Latitude: {toDMS(city.lat)} Longitude: {toDMS(city.lng)}
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
                  ★ القبلة ★ القبلة ★ القبلة ★ القبلة ★ القبلة ★ القبلة ★ القبلة ★ القبلة ★ القبلة ★ القبلة ★ القبلة ★ القبلة
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
                    {l}
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
                    {l}
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
            {/* μT badge */}
            <div className="h-14 w-14 rounded-full bg-[hsl(var(--qibla-card-bg))] shadow flex flex-col items-center justify-center text-[hsl(var(--qibla-coord-fg))]">
              <span className="text-[13px] font-bold leading-none">{accuracy === "high" ? 35 : accuracy === "medium" ? 44 : 52}</span>
              <span className="text-[10px] text-[hsl(var(--qibla-muted-fg))] mt-0.5">μT</span>
            </div>

            {/* Distance card */}
            <div className="flex-1 rounded-xl bg-[hsl(var(--qibla-card-bg))] border border-[hsl(var(--qibla-card-border))] py-2 px-2 text-center shadow-sm">
              <div className="flex items-center justify-center gap-1.5">
                <KaabaIcon className="h-4 w-4" />
                <span className="font-bold text-[14px]">{Math.round(distanceKm).toLocaleString()} KM</span>
              </div>
              <div className="text-[10px] text-[hsl(var(--qibla-muted-fg))] mt-0.5">
                {t("Distance to Kaaba", "البُعد عن الكعبة")}
              </div>
            </div>

            {/* Qibla angle card */}
            <div className="flex-1 rounded-xl bg-[hsl(var(--qibla-card-bg))] border border-[hsl(var(--qibla-card-border))] py-2 px-2 text-center shadow-sm">
              <div className="flex items-center justify-center gap-1.5">
                <CompassIcon className="h-4 w-4 text-[hsl(var(--qibla-card-fg))]" />
                <span className="font-bold text-[14px]">{Math.round(qibla)}°</span>
              </div>
              <div className="text-[10px] text-[hsl(var(--qibla-muted-fg))] mt-0.5">
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
            {heading == null ? (
              <p className="text-[12px] text-[hsl(var(--qibla-muted-fg))]">
                {t("Move device to activate compass", "حرّك الجهاز لتفعيل البوصلة")}
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

          {needsPerm && (
            <Button onClick={requestPerm} className="w-full mt-3 bg-[hsl(var(--qibla-ring-blue))] hover:bg-[hsl(var(--qibla-ring-blue-2))] text-white">
              {t("Enable compass", "تفعيل البوصلة")}
            </Button>
          )}

          <button
            type="button"
            onClick={() => { unlockAudio(); triggerAlignmentAlert(); }}
            className="mt-3 w-full text-[11px] text-[hsl(var(--qibla-muted-fg))] underline-offset-2 hover:underline"
          >
            {t("Test alignment alert", "اختبار تنبيه القبلة")}
          </button>
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
