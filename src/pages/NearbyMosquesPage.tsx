import { useEffect, useState } from "react";
import { AlertTriangle, Compass, Loader2, LocateFixed, Map as MapIcon, MapPinned, Navigation, RefreshCw, SearchX, ShieldCheck, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/contexts/LocaleContext";
import { HeaderIconButton, PageShell } from "@/components/site/PageHeader";
import { IconBadge } from "@/components/site/IconBadge";
import { MapsAppSheet } from "@/components/site/MapsAppSetting";
import { SEO } from "@/components/SEO";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isIOSNativeApp, openNativeAppSettings } from "@/lib/platform";
import { useNearbyMosques } from "@/hooks/useNearbyMosques";
import { SEARCH_RADII_M } from "@/lib/mosques/config";
import { compassPoint, formatDistance, formatRadius, type CompassPoint, type DistanceUnits } from "@/lib/mosques/distance";
import { directionsUrl, loadMapsApp, mapViewUrl, mapsTarget, saveMapsApp, type MapsAction, type MapsApp, type MapsTarget } from "@/lib/mosques/maps";
import { openInMaps } from "@/lib/mosques/mapsLauncher";
import type { Mosque } from "@/lib/mosques/model";

/** Mosques rendered per "Show more" step (a 10 km search in a big city can return hundreds). */
const PAGE_SIZE = 25;

const BOX = "space-y-3 rounded-2xl border p-4";

/**
 * Nearby mosques (المساجد القريبة): a list of the mosques around the user, nearest
 * first, with directions in the maps app. Works for visitors (no account); the
 * position stays in memory on this screen and is never saved or synced.
 */
export default function NearbyMosquesPage() {
  const { t, lang } = useLocale();
  const nearby = useNearbyMosques();
  const native = isIOSNativeApp();
  const target = mapsTarget();
  const units: DistanceUnits = lang === "ar" ? { m: "م", km: "كم" } : { m: "m", km: "km" };
  const [visible, setVisible] = useState(PAGE_SIZE);
  const { phase, mosques } = nearby;
  const busy = phase === "locating" || phase === "searching";
  const showList = mosques.length > 0 && (phase === "results" || busy);

  useEffect(() => setVisible(PAGE_SIZE), [mosques]);

  const radius = (m: number) => formatRadius(m, units.km);

  // iPhone app: the mosque opens in the user's maps app (asked on the first tap, then remembered).
  const [mapsApp, setMapsApp] = useState<MapsApp | null>(() => loadMapsApp());
  const [pendingOpen, setPendingOpen] = useState<{ action: MapsAction; mosque: Mosque } | null>(null);
  const launch = async (app: MapsApp, action: MapsAction, mosque: Mosque) => {
    // The mosque's own name as mapped (never the «مسجد قريب» placeholder), with its exact point.
    const ownName = mosque.name ?? mosque.nameAr ?? mosque.nameEn ?? null;
    const { opened } = await openInMaps(app, action, mosque, ownName);
    if (!opened) toast.error(t("Couldn't open Maps", "تعذّر فتح الخرائط"));
  };
  const openMosque = (action: MapsAction, mosque: Mosque) => {
    if (mapsApp) void launch(mapsApp, action, mosque);
    else setPendingOpen({ action, mosque });
  };

  return (
    <PageShell
      titleAr="المساجد القريبة"
      titleEn="Nearby Mosques"
      fallback="/tools"
      action={
        nearby.located ? (
          <HeaderIconButton label={t("Refresh", "تحديث")} onClick={nearby.refresh}>
            <RefreshCw className={cn("h-5 w-5", busy && "animate-spin")} />
          </HeaderIconButton>
        ) : undefined
      }
    >
      <SEO
        title={t("Nearby Mosques — Elite Islamic", "المساجد القريبة — النخبة الإسلامية")}
        description={t("Find the mosques near you, nearest first, with directions.", "اعثر على المساجد القريبة منك مرتبة من الأقرب مع الطريق إليها.")}
        path="/mosques"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-5">
        {nearby.located && (
          <div role="group" aria-label={t("Search radius", "نطاق البحث")} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {SEARCH_RADII_M.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => nearby.setRadius(r)}
                aria-pressed={nearby.radiusM === r}
                data-radius={r}
                className={cn(
                  "min-h-[40px] shrink-0 rounded-full px-4 text-body-sm font-semibold tabular-nums transition",
                  nearby.radiusM === r
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-foreground/75 ring-1 ring-foreground/[0.08] hover:text-foreground",
                )}
              >
                {radius(r)}
              </button>
            ))}
          </div>
        )}

        {phase === "checking" && (
          <div className="flex justify-center py-10" data-testid="mosques-checking">
            <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
          </div>
        )}

        {phase === "idle" && (
          <div data-testid="mosques-intro" className="space-y-4 rounded-2xl border border-foreground/[0.07] bg-card p-5 text-center shadow-sm">
            <IconBadge icon={MapPinned} size="lg" className="mx-auto" />
            <div className="space-y-1.5">
              <p className="font-display text-body-lg font-bold">{t("Find the mosques near you.", "اعثر على المساجد القريبة منك.")}</p>
              <p className="text-body-sm leading-relaxed text-foreground/70">
                {t("We use your location to show the mosques near you.", "نستخدم موقعك لعرض المساجد القريبة منك.")}
              </p>
            </div>
            <Button onClick={nearby.start} data-testid="mosques-start">
              <LocateFixed />
              {t("Find nearby mosques", "ابحث عن المساجد القريبة")}
            </Button>
            <p className="flex items-start justify-center gap-1.5 text-caption leading-relaxed text-foreground/55">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {t(
                  "Your location isn't saved or linked to any account; it is only used to find nearby mosques.",
                  "لا يُحفظ موقعك ولا يُربط بأي حساب، ويُستخدم فقط للبحث عن المساجد القريبة."
                )}
              </span>
            </p>
          </div>
        )}

        {busy && (
          <p role="status" data-testid="mosques-busy" className="flex items-center gap-2 px-1 text-body-sm text-foreground/65">
            <Loader2 className="h-4 w-4 animate-spin" />
            {phase === "locating"
              ? t("Finding your location…", "جارٍ تحديد موقعك…")
              : t("Searching for nearby mosques…", "جارٍ البحث عن المساجد القريبة…")}
          </p>
        )}

        {busy && !showList && (
          <div className="space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[132px] rounded-2xl" />
            ))}
          </div>
        )}

        {showList && (
          <section className="space-y-3" aria-labelledby="mosques-list-title">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
              <h2 id="mosques-list-title" className="font-display text-body font-bold">{t("Nearest first", "الأقرب أولاً")}</h2>
              <span className="text-body-sm tabular-nums text-foreground/60" data-testid="mosques-count">
                {t("Results", "النتائج")}: {mosques.length} · {t("within", "ضمن")} {radius(nearby.listRadiusM)}
              </span>
            </div>
            {nearby.approximate && nearby.accuracyM !== null && (
              <div data-testid="mosques-approximate" role="status" className={cn(BOX, "border-primary/25 bg-primary/[0.06]")}>
                <p className="flex items-center gap-2 text-body font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {t("Your location is approximate", "موقعك تقريبي")} (±{formatDistance(nearby.accuracyM, units)})
                </p>
                <p className="text-body-sm leading-relaxed text-foreground/70">
                  {t("Distances and order may be off. ", "قد لا تكون المسافات والترتيب دقيقة. ")}
                  {native
                    ? t(
                        "Turn on Precise Location: iPhone Settings → Elite Islamic → Location → Precise Location.",
                        "فعّل «الموقع الدقيق»: إعدادات iPhone ← النخبة الإسلامية ← الموقع ← الموقع الدقيق."
                      )
                    : t(
                        "Turn on Precise Location for this browser in your device's location settings, then refresh.",
                        "فعّل «الموقع الدقيق» لهذا المتصفح من إعدادات الموقع في جهازك ثم حدّث الصفحة."
                      )}
                </p>
                {native && (
                  <Button size="sm" variant="outline" onClick={() => void openNativeAppSettings()} data-testid="mosques-approximate-settings">
                    {t("Open iPhone Settings", "فتح إعدادات iPhone")}
                  </Button>
                )}
              </div>
            )}
            <ul className={cn("space-y-3 transition-opacity", busy && "opacity-60")} aria-busy={busy} data-testid="mosques-list">
              {mosques.slice(0, visible).map((m, i) => (
                <MosqueCard key={m.id} mosque={m} nearest={i === 0} units={units} target={target} onOpen={native ? openMosque : undefined} />
              ))}
            </ul>
            {mosques.length > visible && (
              <Button variant="outline" className="w-full" onClick={() => setVisible((v) => v + PAGE_SIZE)} data-testid="mosques-more">
                {t("Show more", "عرض المزيد")}
              </Button>
            )}
          </section>
        )}

        {phase === "empty" && (
          <div data-testid="mosques-empty" className={cn(BOX, "border-foreground/[0.07] bg-card text-center")}>
            <SearchX className="mx-auto h-8 w-8 text-foreground/40" aria-hidden />
            <p className="text-body font-medium">
              {t("No mosques found within", "لا توجد مساجد مسجّلة ضمن")} {radius(nearby.radiusM)}
            </p>
            <p className="text-body-sm leading-relaxed text-foreground/65">
              {nearby.nextRadius
                ? t("Some mosques may not be on the map yet. Try a wider search.", "قد لا تكون بعض المساجد مسجّلة على الخريطة بعد. جرّب توسيع نطاق البحث.")
                : t("Some mosques may not be on the map yet.", "قد لا تكون بعض المساجد مسجّلة على الخريطة بعد.")}
            </p>
            {nearby.nextRadius ? (
              <Button onClick={nearby.expandRadius} data-testid="mosques-expand">
                {t("Expand search to", "توسيع البحث إلى")} {radius(nearby.nextRadius)}
              </Button>
            ) : (
              <Button variant="outline" onClick={nearby.refresh}>
                {t("Refresh", "تحديث")}
              </Button>
            )}
          </div>
        )}

        {phase === "error" && (
          <div data-testid="mosques-error" role="alert" className={cn(BOX, "border-destructive/35 bg-destructive/10")}>
            <p className="flex items-center gap-2 text-body font-medium">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
              {t("Couldn't load nearby mosques right now.", "تعذر تحميل المساجد القريبة حاليًا.")}
            </p>
            <p className="text-body-sm leading-relaxed text-foreground/70">
              {nearby.errorKind === "network"
                ? t("Check your internet connection and try again.", "تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.")
                : t("The map service is busy. Please try again in a moment.", "خدمة الخرائط مشغولة الآن. حاول مرة أخرى بعد قليل.")}
            </p>
            <Button size="sm" variant="outline" onClick={nearby.retry} data-testid="mosques-retry">
              {t("Try again", "إعادة المحاولة")}
            </Button>
          </div>
        )}

        {phase === "denied" && (
          <div data-testid="mosques-denied" className={cn(BOX, "border-destructive/35 bg-destructive/10")}>
            <p className="text-body font-medium">{t("Location access is turned off", "الوصول إلى الموقع متوقف")}</p>
            <p className="text-body-sm leading-relaxed text-foreground/70">
              {t("To show nearby mosques, allow access to your location.", "لعرض المساجد القريبة، اسمح بالوصول إلى موقعك.")}{" "}
              {native
                ? t(
                    "iPhone Settings → Elite Islamic → Location → While Using the App.",
                    "إعدادات iPhone ← النخبة الإسلامية ← الموقع ← أثناء استخدام التطبيق."
                  )
                : t(
                    "Allow location for this site from the address bar / browser site settings, then try again.",
                    "اسمح بالموقع لهذا الموقع من شريط العنوان أو إعدادات المتصفح ثم أعد المحاولة."
                  )}
            </p>
            <div className="flex flex-wrap gap-2">
              {native && (
                <Button size="sm" variant="outline" onClick={() => void openNativeAppSettings()} data-testid="mosques-open-settings">
                  {t("Open iPhone Settings", "فتح إعدادات iPhone")}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={nearby.retry} data-testid="mosques-retry">
                {t("Try again", "إعادة المحاولة")}
              </Button>
            </div>
          </div>
        )}

        {phase === "unavailable" && (
          <div data-testid="mosques-unavailable" className={cn(BOX, "border-destructive/35 bg-destructive/10")}>
            <p className="text-body font-medium">{t("Couldn't get your location", "تعذّر تحديد موقعك")}</p>
            <p className="text-body-sm leading-relaxed text-foreground/70">
              {nearby.locationTimedOut
                ? t("Location took too long. Move to an open area or try again.", "استغرق تحديد الموقع وقتاً طويلاً. انتقل لمكان مفتوح أو أعد المحاولة.")
                : t(
                    "GPS isn't available right now. Check that Location Services are on, then try again.",
                    "خدمة GPS غير متاحة الآن. تأكد من تفعيل خدمات الموقع ثم أعد المحاولة."
                  )}
            </p>
            <Button size="sm" variant="outline" onClick={nearby.retry} data-testid="mosques-retry">
              {t("Try again", "إعادة المحاولة")}
            </Button>
          </div>
        )}

        {phase === "unsupported" && (
          <div data-testid="mosques-unsupported" className={cn(BOX, "border-foreground/[0.07] bg-card")}>
            <p className="text-body-sm leading-relaxed text-foreground/70">
              {t(
                "This device or browser can't provide a location, so nearby mosques can't be shown.",
                "هذا الجهاز أو المتصفح لا يوفّر الموقع، لذا لا يمكن عرض المساجد القريبة."
              )}
            </p>
          </div>
        )}

        <p className="px-2 text-center text-caption leading-relaxed text-foreground/50">
          {t("Mosque data:", "بيانات المساجد:")}{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {t("© OpenStreetMap contributors", "© مساهمو OpenStreetMap")}
          </a>
        </p>
      </div>

      {native && (
        <MapsAppSheet
          open={pendingOpen !== null}
          onOpenChange={(open) => {
            if (!open) setPendingOpen(null);
          }}
          value={mapsApp}
          onChange={(app) => {
            saveMapsApp(app);
            setMapsApp(app);
            if (pendingOpen) void launch(app, pendingOpen.action, pendingOpen.mosque);
          }}
        />
      )}
    </PageShell>
  );
}

function MosqueCard({
  mosque,
  nearest,
  units,
  target,
  onOpen,
}: {
  mosque: Mosque;
  nearest: boolean;
  units: DistanceUnits;
  target: MapsTarget;
  /** iPhone app: open in the chosen maps app (and check it opened) instead of following a link. */
  onOpen?: (action: MapsAction, mosque: Mosque) => void;
}) {
  const { t, lang } = useLocale();
  const name = (lang === "ar" ? mosque.nameAr ?? mosque.name : mosque.nameEn ?? mosque.name) ?? t("Nearby mosque", "مسجد قريب");
  const directions: Record<CompassPoint, string> = {
    N: t("North", "شمال"),
    NE: t("Northeast", "شمال شرق"),
    E: t("East", "شرق"),
    SE: t("Southeast", "جنوب شرق"),
    S: t("South", "جنوب"),
    SW: t("Southwest", "جنوب غرب"),
    W: t("West", "غرب"),
    NW: t("Northwest", "شمال غرب"),
  };
  const direction = directions[compassPoint(mosque.bearingDegrees)];
  const link = "h-10 rounded-xl";
  return (
    <li data-testid="mosque-item" data-mosque-id={mosque.id} className="rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <IconBadge icon={MapPinned} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 break-words font-display text-body-lg font-bold leading-snug" data-testid="mosque-name">
              {name}
            </h3>
            {nearest && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary">
                {t("Nearest", "الأقرب")}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-foreground/65">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold tabular-nums text-primary" data-testid="mosque-distance">
              {formatDistance(mosque.distanceMeters, units)}
            </span>
            <span className="inline-flex items-center gap-1" data-testid="mosque-direction">
              <Compass className="h-3.5 w-3.5" aria-hidden />
              {direction}
            </span>
          </div>
          {mosque.address && <p className="mt-1.5 break-words text-caption leading-relaxed text-foreground/55">{mosque.address}</p>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {onOpen ? (
          <>
            <button
              type="button"
              onClick={() => onOpen("directions", mosque)}
              data-testid="mosque-directions"
              className={cn(buttonVariants({ size: "sm" }), link)}
            >
              <Navigation />
              {t("Directions", "الطريق")}
            </button>
            <button
              type="button"
              onClick={() => onOpen("view", mosque)}
              data-testid="mosque-open-map"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), link)}
            >
              <MapIcon />
              {t("Open in Maps", "فتح في الخرائط")}
            </button>
          </>
        ) : (
          <>
            <a
              href={directionsUrl(mosque, target)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="mosque-directions"
              className={cn(buttonVariants({ size: "sm" }), link)}
            >
              <Navigation />
              {t("Directions", "الطريق")}
            </a>
            <a
              href={mapViewUrl(mosque, name, target)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="mosque-open-map"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), link)}
            >
              <MapIcon />
              {t("Open in Maps", "فتح في الخرائط")}
            </a>
          </>
        )}
      </div>
    </li>
  );
}
