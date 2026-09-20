import { useEffect, useMemo, useState } from "react";
import { Clock, Compass, Crosshair, Globe2, Info, Loader2, LocateFixed, MapPin, Navigation, Search, X } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { PageShell } from "@/components/site/PageHeader";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/site/SettingsUI";
import { CitySelector } from "@/components/islamic/CitySelector";
import { IconBadge } from "@/components/site/IconBadge";
import { SEO } from "@/components/SEO";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { isIOSNativeApp, openNativeAppSettings } from "@/lib/platform";
import { searchGlobalLocations, searchLocalLocations, type CityLocation } from "@/lib/locations";

/**
 * Location settings.
 *
 * - Automatic location (default ON) uses the device's real position and maps it
 *   to the nearest known city. It never prompts by itself: when permission is
 *   still undecided the page offers an explicit "Allow location access" button.
 * - With Automatic OFF the user picks a city (search / city picker), stored in
 *   the same `city.id` / `city.custom` storage the rest of the app already uses.
 * - "Use city centre" (automatic only) calculates from the nearest city's centre
 *   instead of the exact GPS point. It is a calculation choice, separate from
 *   the permission itself.
 *
 * There is no map in this app, so there is deliberately no "pick on map" control.
 * A map picker can later be added as one more row that calls `setCity(...)`;
 * nothing in this screen needs to change for that.
 */
export default function LocationSettingsPage() {
  const { t, lang, dir } = useLocale();
  const { city, setCity, auto, setAuto, useCityCenter, setUseCityCenter, status, fix, requestLocation } = useCity();
  const native = isIOSNativeApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // City search (built-in list instantly; global lookup when online).
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    let cancelled = false;
    setResults(searchLocalLocations(q, 12));
    setSearching(q.length >= 2);
    const id = window.setTimeout(async () => {
      const next = await searchGlobalLocations(q);
      if (!cancelled) { setResults(next); setSearching(false); }
    }, q.length >= 2 ? 350 : 0);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [query]);

  const cityName = lang === "ar" ? city.ar : city.en;
  const country = lang === "ar" ? city.countryAr : city.countryEn;
  const timeText = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: city.tz,
      }).format(now);
    } catch {
      return now.toLocaleTimeString();
    }
  }, [now, city.tz, lang]);

  const isGps = auto && status === "ok";

  const statusBlock = (() => {
    if (!auto) return null;
    const box = "space-y-3 rounded-2xl border p-4";
    switch (status) {
      case "locating":
      case "idle":
        return (
          <div data-testid="loc-status-locating" className={`${box} border-foreground/[0.07] bg-card`}>
            <p className="flex items-center gap-2 text-body-sm text-foreground/70"><Loader2 className="h-4 w-4 animate-spin" />{t("Finding your location…", "جارٍ تحديد موقعك…")}</p>
          </div>
        );
      case "ok":
        return (
          <div data-testid="loc-status-ok" className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
            <IconBadge icon={LocateFixed} size="md" />
            <div className="min-w-0 leading-snug">
              <div className="text-body-sm text-foreground/60">{t("Current Location", "الموقع الحالي")}</div>
              <div className="truncate font-display text-body-lg font-bold" data-testid="loc-current-name">{cityName}</div>
              <div className="truncate text-body-sm text-foreground/60">{lang === "ar" ? city.ar : city.en}{country ? ` · ${country}` : ""}</div>
            </div>
          </div>
        );
      case "needs-permission":
        return (
          <div data-testid="loc-status-needs-permission" className={`${box} border-elite-gold/35 bg-elite-gold/10`}>
            <p className="text-body-sm leading-relaxed text-foreground/80">
              {t(
                "Allow location access so prayer times and the Qibla use where you are. Until then the saved city is used.",
                "اسمح بالوصول إلى الموقع لتُحسب المواقيت والقبلة حسب مكانك. وحتى ذلك الحين تُستخدم المدينة المحفوظة.",
              )}
            </p>
            <Button size="sm" onClick={() => void requestLocation()} data-testid="loc-allow">
              <Navigation className="me-2 h-4 w-4" />
              {t("Allow Location Access", "السماح بالوصول إلى الموقع")}
            </Button>
          </div>
        );
      case "denied":
        return (
          <div data-testid="loc-status-denied" className={`${box} border-destructive/35 bg-destructive/10`}>
            <p className="text-body font-medium">{t("Location access is turned off", "الوصول إلى الموقع متوقف")}</p>
            <p className="text-body-sm leading-relaxed text-foreground/70">
              {native
                ? t(
                    "iPhone Settings → Elite Islamic → Location → While Using the App.",
                    "إعدادات iPhone ← النخبة الإسلامية ← الموقع ← أثناء استخدام التطبيق.",
                  )
                : t(
                    "Allow location for this site from the address bar / browser site settings, then try again.",
                    "اسمح بالموقع لهذا الموقع من شريط العنوان أو إعدادات المتصفح ثم أعد المحاولة.",
                  )}
            </p>
            <div className="flex flex-wrap gap-2">
              {native && (
                <Button size="sm" variant="outline" onClick={() => void openNativeAppSettings()}>
                  {t("Open iPhone Settings", "فتح إعدادات iPhone")}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void requestLocation()}>{t("Try again", "إعادة المحاولة")}</Button>
            </div>
          </div>
        );
      case "unsupported":
        return (
          <div data-testid="loc-status-unsupported" className={`${box} border-foreground/[0.07] bg-card`}>
            <p className="text-body-sm leading-relaxed text-foreground/70">
              {t("This device or browser can't provide a location. Turn off Automatic Location and choose a city.", "هذا الجهاز أو المتصفح لا يوفّر الموقع. أوقف الموقع التلقائي واختر مدينة.")}
            </p>
          </div>
        );
      default: // unavailable | timeout
        return (
          <div data-testid="loc-status-unavailable" className={`${box} border-destructive/35 bg-destructive/10`}>
            <p className="text-body font-medium">{t("Couldn't get your location", "تعذّر تحديد موقعك")}</p>
            <p className="text-body-sm leading-relaxed text-foreground/70">
              {status === "timeout"
                ? t("Location took too long. Move to an open area or try again.", "استغرق تحديد الموقع وقتاً طويلاً. انتقل لمكان مفتوح أو أعد المحاولة.")
                : t("GPS isn't available right now. Check that Location Services are on, or choose a city.", "خدمة GPS غير متاحة الآن. تأكد من تفعيل خدمات الموقع أو اختر مدينة.")}
            </p>
            <Button size="sm" variant="outline" onClick={() => void requestLocation()}>{t("Try again", "إعادة المحاولة")}</Button>
          </div>
        );
    }
  })();

  return (
    <PageShell titleAr="الموقع" titleEn="Location" fallback="/settings">
      <SEO
        title={t("Location — Elite Islamic", "الموقع — النخبة الإسلامية")}
        description={t("Automatic location or a chosen city for prayer times and Qibla.", "الموقع التلقائي أو مدينة تختارها لمواقيت الصلاة والقبلة.")}
        path="/location"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-6">
        {/* Search */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-foreground/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="loc-search"
              placeholder={t("Search city or location", "بحث عن مدينة أو موقع")}
              className="h-12 w-full rounded-2xl bg-card ps-11 pe-11 text-body shadow-sm outline-none ring-1 ring-foreground/[0.07] placeholder:text-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("Clear", "مسح")} className="absolute inset-y-0 end-2 my-auto grid h-9 w-9 place-items-center text-foreground/45">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {query.trim() && (
            <ul className="overflow-hidden rounded-2xl border border-foreground/[0.07] bg-card divide-y divide-foreground/[0.07]" data-testid="loc-results">
              {results.length === 0 && !searching && (
                <li className="px-4 py-6 text-center text-body-sm text-foreground/55">{t("No results", "لا توجد نتائج")}</li>
              )}
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    data-city-id={r.id}
                    onClick={() => { setCity(r); setQuery(""); }}
                    className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-start transition active:bg-foreground/[0.04]"
                  >
                    <MapPin className="h-[18px] w-[18px] shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-body font-semibold">{lang === "ar" ? r.ar : r.en}</span>
                      <span className="block truncate text-body-sm text-foreground/60">{lang === "ar" ? r.countryAr : r.countryEn}{r.region ? ` · ${r.region}` : ""}</span>
                    </span>
                  </button>
                </li>
              ))}
              {searching && <li className="flex items-center justify-center gap-2 px-4 py-3 text-body-sm text-foreground/55"><Loader2 className="h-4 w-4 animate-spin" />{t("Searching…", "جارٍ البحث…")}</li>}
            </ul>
          )}
          {query.trim() && (
            <p className="px-2 text-caption text-foreground/55">
              {t("Choosing a city turns off Automatic Location.", "اختيار مدينة يوقف الموقع التلقائي.")}
            </p>
          )}
        </div>

        {/* Automatic location */}
        <SettingsSection
          id="loc-auto"
          title={t("Automatic Location", "الموقع التلقائي")}
          footer={
            auto
              ? t("Uses your device's location when access is allowed.", "يستخدم موقع جهازك عند السماح بالوصول.")
              : t("Off: prayer times use the city you chose below.", "متوقف: تُحسب المواقيت حسب المدينة التي اخترتها أدناه.")
          }
        >
          <SettingsGroup>
            <SettingsRow
              icon={Crosshair}
              label={t("Use location automatically", "استخدام الموقع تلقائياً")}
              description={auto ? t("On", "مفعّل") : t("Off", "متوقف")}
            >
              <Switch
                data-testid="loc-auto-switch"
                aria-label={t("Use location automatically", "استخدام الموقع تلقائياً")}
                checked={auto}
                onCheckedChange={setAuto}
              />
            </SettingsRow>
            {auto && (
              <SettingsRow
                icon={Compass}
                label={t("Use city centre", "استخدام مركز المدينة")}
                description={t(
                  "Calculate from the centre of the nearest city instead of your exact position.",
                  "الحساب من مركز أقرب مدينة بدل موقعك الدقيق.",
                )}
              >
                <Switch
                  data-testid="loc-center-switch"
                  aria-label={t("Use city centre", "استخدام مركز المدينة")}
                  checked={useCityCenter}
                  onCheckedChange={setUseCityCenter}
                />
              </SettingsRow>
            )}
            {!auto && (
              <SettingsRow icon={MapPin} label={t("City", "المدينة")} description={country || undefined}>
                <CitySelector compact />
              </SettingsRow>
            )}
          </SettingsGroup>
          {statusBlock}
        </SettingsSection>

        {/* Information (read-only) */}
        <SettingsSection id="loc-info" title={t("Location information", "معلومات الموقع")}>
          <SettingsGroup>
            <SettingsRow icon={MapPin} label={t("City", "المدينة")} value={cityName} />
            <SettingsRow icon={Globe2} label={t("Time Zone", "المنطقة الزمنية")} value={city.tz} />
            <SettingsRow icon={Info} label={t("Latitude", "خط العرض")}>
              <span dir="ltr" className="text-body-sm tabular-nums text-foreground/70" data-testid="loc-lat">{city.lat.toFixed(4)}</span>
            </SettingsRow>
            <SettingsRow icon={Info} label={t("Longitude", "خط الطول")}>
              <span dir="ltr" className="text-body-sm tabular-nums text-foreground/70" data-testid="loc-lng">{city.lng.toFixed(4)}</span>
            </SettingsRow>
            <SettingsRow icon={Clock} label={t("Current time", "الوقت الحالي")}>
              <span dir="ltr" className="text-body-sm tabular-nums text-foreground/70" data-testid="loc-time">{timeText}</span>
            </SettingsRow>
            <SettingsRow
              icon={LocateFixed}
              label={t("Location source", "مصدر الموقع")}
              value={
                isGps
                  ? useCityCenter ? t("Automatic (city centre)", "تلقائي (مركز المدينة)") : t("Automatic (GPS)", "تلقائي (GPS)")
                  : auto ? t("Automatic — waiting", "تلقائي — بانتظار الموقع") : t("Manual city", "مدينة يدوية")
              }
            />
            {fix && auto && (
              <SettingsRow icon={Info} label={t("GPS accuracy", "دقة GPS")} value={`± ${Math.round(fix.accuracy)} ${t("m", "م")}`} />
            )}
          </SettingsGroup>
        </SettingsSection>
      </div>
      <span className="sr-only" dir={dir} />
    </PageShell>
  );
}
