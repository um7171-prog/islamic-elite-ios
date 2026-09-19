import { ArrowRight, Bookmark, BookmarkCheck, Search, LayoutGrid,
  Play, Pause, Languages, Share2, Copy, BookText, Settings2 } from "lucide-react";
import { toArabicDigits, type PageInfo } from "@/lib/mushaf";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";

const btn = "h-9 w-9 grid place-items-center rounded-full text-white/90 active:scale-90 transition-transform";

export function MushafTopBar({
  visible, info, bookmarked, onBack, onBookmark, onOpen,
}: {
  visible: boolean;
  info: PageInfo;
  bookmarked: boolean;
  onBack: () => void;
  onBookmark: () => void;
  onOpen: (tab: "surah" | "juz" | "hizb" | "page" | "bookmarks") => void;
}) {
  const { t, lang } = useLocale();
  // The Mushaf itself is always read right-to-left (page N+1 sits to the
  // left of page N regardless of UI language — see MushafReader.tsx), so
  // this toolbar's layout direction stays fixed to match; only the text
  // labels are translated.
  return (
    <div
      dir="rtl"
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300 will-change-transform",
        visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none",
      )}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", background: "linear-gradient(to bottom, rgba(0,0,0,.68), rgba(0,0,0,0))" }}
    >
      <div className="flex items-center gap-0.5 px-1.5 py-2">
        <button onClick={onBack} className={btn} aria-label={t("Back", "رجوع")}><ArrowRight className="h-5 w-5" /></button>
        {/* flex-1 + min-w-0: the surah name is the only pill whose label
            length varies a lot by language (e.g. "الفاتحة" vs "Al-Faatiha",
            or much longer names like "Aal-i-Imraan") — without room to grow
            it got clipped hard in English. Juz/Hizb dropped their icon/extra
            padding (this row was genuinely too crowded for 375px with all
            five pills + 3 icon buttons) to give it more to work with; very
            long English names can still truncate, but far less than before. */}
        <button onClick={() => onOpen("surah")} className="px-2.5 h-8 rounded-full bg-white/12 border border-white/10 text-white text-label flex items-center gap-1.5 flex-1 min-w-0">
          <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
          <span className="font-arabic truncate">{lang === "ar" ? info.mainSurah.ar : info.mainSurah.en}</span>
        </button>
        <button onClick={() => onOpen("juz")} className="px-2 h-8 rounded-full bg-white/12 border border-white/10 text-white text-label shrink-0">
          {t(`Juz ${info.juz}`, `الجزء ${toArabicDigits(info.juz)}`)}
        </button>
        <button onClick={() => onOpen("hizb")} className="px-2 h-8 rounded-full bg-white/12 border border-white/10 text-white text-label shrink-0">
          {t(`Hizb ${info.hizb}`, `الحزب ${toArabicDigits(info.hizb)}`)}
        </button>
        {/* No ms-auto here: an auto-margin claims flexbox free space before
            flex-grow does, which starved the surah pill's flex-1 back down
            to almost nothing. Plain document order already puts this right
            before the bookmark/search buttons at the end of the row. */}
        <span className="text-label text-white/90 px-2 shrink-0">{toArabicDigits(info.page)}</span>
        <button onClick={onBookmark} className={btn} aria-label={t("Save page", "حفظ الصفحة")}>
          {/* text-elite-gold is a background-clip:text gradient meant for
              text nodes — applying it to an SVG icon would make the icon's
              currentColor-based stroke/fill fully transparent, so the solid
              gold token is used directly here instead. */}
          {bookmarked ? <BookmarkCheck className="h-5 w-5" style={{ color: "hsl(var(--elite-gold-start))" }} /> : <Bookmark className="h-5 w-5" />}
        </button>
        <button onClick={() => onOpen("page")} className={btn} aria-label={t("Search", "بحث")}><Search className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

export function MushafBottomBar({
  visible, info, playing, onAudio, onTranslation, onShare, onCopy, onTafsir, onSettings,
}: {
  visible: boolean;
  info: PageInfo;
  playing: boolean;
  onAudio: () => void;
  onTranslation: () => void;
  onShare: () => void;
  onCopy: () => void;
  onTafsir: () => void;
  onSettings: () => void;
}) {
  const { t, lang } = useLocale();
  const items = [
    { key: "audio", Icon: playing ? Pause : Play, label: t("Audio", "الصوت"), on: onAudio },
    { key: "translation", Icon: Languages, label: t("Translation", "الترجمة"), on: onTranslation },
    { key: "tafsir", Icon: BookText, label: t("Tafsir", "التفسير"), on: onTafsir },
    { key: "copy", Icon: Copy, label: t("Copy", "نسخ"), on: onCopy },
    { key: "share", Icon: Share2, label: t("Share", "مشاركة"), on: onShare },
    { key: "settings", Icon: Settings2, label: t("Settings", "إعدادات"), on: onSettings },
  ];
  return (
    <div
      dir="rtl"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 transition-all duration-300 will-change-transform",
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", background: "linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0))" }}
    >
      <div className="text-center text-caption text-white/75 pt-3 pb-1 px-3 truncate">
        <span className="font-arabic">{lang === "ar" ? info.mainSurah.ar : info.mainSurah.en}</span>
        <span className="mx-1.5">·</span>{t(`Juz ${info.juz}`, `الجزء ${toArabicDigits(info.juz)}`)}
        <span className="mx-1.5">·</span>{t(`Hizb ${info.hizb}`, `الحزب ${toArabicDigits(info.hizb)}`)}
        <span className="mx-1.5">·</span>{t(`Page ${info.page}`, `صفحة ${toArabicDigits(info.page)}`)}
      </div>
      <div className="flex items-center justify-around px-2 pb-2">
        {items.map(({ key, Icon, label, on }) => (
          <button key={key} onClick={on} className="flex flex-col items-center gap-0.5 px-2 py-1 active:scale-90 transition-transform">
            <Icon
              className={cn("h-5 w-5", key === "audio" && playing ? "" : "text-white/90")}
              style={key === "audio" && playing ? { color: "hsl(var(--elite-gold-start))" } : undefined}
            />
            <span className="text-caption text-white/70">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
