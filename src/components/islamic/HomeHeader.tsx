import { useNavigate } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { getGregorianDate, getHijriDate } from "@/lib/prayer";
import { AnnouncementsBell } from "@/components/islamic/AnnouncementsBell";
import { CitySelector } from "@/components/islamic/CitySelector";
import { MosqueScene } from "@/components/site/MosqueScene";
import { HaramHero } from "@/components/site/HaramHero";
import { TemperaturePill } from "@/components/islamic/TemperaturePill";

/** Home's emerald header: brand, EN/AR switch, notifications bell, settings,
 * then the city and the Hijri + Gregorian dates. The next-prayer card
 * overlaps its bottom edge (see Index). */
export function HomeHeader() {
  const { t, lang, setLang, dir } = useLocale();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const circle = "grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition active:scale-95";

  return (
    <header
      dir={dir}
      className="bg-header relative overflow-hidden rounded-b-[32px] px-4 pb-16 md:px-8"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
    >
      <MosqueScene />
      <div className="relative mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); navigate("/"); }}
            aria-label={t("Elite Islamic — Home", "النخبة الإسلامية — الرئيسية")}
            className="flex min-w-0 items-center gap-2.5"
            style={{ touchAction: "manipulation" }}
          >
            <img src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-2xl object-contain ring-1 ring-white/20" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-h3 font-bold text-white">{t("Islamic Elite", "النخبة الإسلامية")}</span>
              {lang === "ar" && <span className="block truncate text-body-sm text-white/70" dir="ltr">Islamic Elite</span>}
            </span>
          </a>
          <div className="flex shrink-0 items-center gap-1.5 min-[400px]:gap-2" style={{ touchAction: "manipulation" }}>
            <button
              type="button"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              aria-label={t("Switch to Arabic", "التبديل إلى الإنجليزية")}
              data-testid="lang-toggle"
              className={`${circle} text-[13px] font-bold`}
            >
              {lang === "ar" ? "EN" : "ع"}
            </button>
            <AnnouncementsBell tone="header" />
            <button type="button" onClick={() => navigate("/settings")} aria-label={t("Settings", "الإعدادات")} className={circle}>
              <SettingsIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-center gap-2 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <CitySelector />
            <TemperaturePill />
          </div>
          <div className="leading-snug">
            <div className="font-arabic text-body-lg font-semibold text-[hsl(var(--elite-gold-end))]" data-testid="hijri-date">
              {getHijriDate(now, lang)}
            </div>
            <div className="text-body-sm text-white/80" data-testid="gregorian-date">{getGregorianDate(now, lang)}</div>
          </div>
        </div>
      </div>
      {/* decorative hero: real (licensed) tawaf footage, full-bleed, never intercepts touches */}
      <HaramHero className="-mx-4 mt-1 !w-[calc(100%+2rem)] md:-mx-8 md:!w-[calc(100%+4rem)]" />
    </header>
  );
}
