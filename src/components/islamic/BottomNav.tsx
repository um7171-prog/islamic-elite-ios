import { CalendarDays, Heart, Home, LayoutGrid, Settings as SettingsIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLocale } from "@/contexts/LocaleContext";
import { resetAppScroll } from "@/components/ScrollToTop";

type TabKey = "home" | "tools" | "favorites" | "appointments" | "settings";

const TABS: { key: TabKey; to: string; en: string; ar: string; Icon: React.ElementType }[] = [
  { key: "home", to: "/", en: "Home", ar: "الرئيسية", Icon: Home },
  { key: "tools", to: "/tools", en: "Services", ar: "الخدمات", Icon: LayoutGrid },
  { key: "favorites", to: "/favorites", en: "Favorites", ar: "المفضلة", Icon: Heart },
  { key: "appointments", to: "/calendar", en: "Appointments", ar: "المواعيد", Icon: CalendarDays },
  { key: "settings", to: "/settings", en: "Settings", ar: "الإعدادات", Icon: SettingsIcon },
];

/** Which tab a path belongs to (pages opened from Services stay under Services). */
function tabFor(pathname: string): TabKey | null {
  if (pathname === "/") return "home";
  if (pathname === "/favorites") return "favorites";
  if (pathname === "/calendar") return "appointments";
  if (["/settings", "/prayer-settings", "/notification-settings", "/location"].some((p) => pathname === p || pathname.startsWith(p + "/"))) return "settings";
  if (
    ["/tools", "/calculators", "/date-converter", "/convert", "/media", "/ai"].some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    )
  ) {
    return "tools";
  }
  return null;
}

/** App-wide bottom tab bar (Home / Services / Favorites / Notifications /
 * Settings). Rendered once by the app shell so every screen has the same one. */
export function BottomNav() {
  const { t, dir } = useLocale();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = tabFor(pathname);

  return (
    <nav
      dir={dir}
      aria-label={t("Main navigation", "التنقل الرئيسي")}
      className="bottom-navigation border-t border-foreground/[0.08] bg-card"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around px-0 pb-0.5 pt-1.5">
        {TABS.map((it) => {
          const isActive = active === it.key;
          return (
            <li key={it.key} className="min-w-0 flex-1">
              <button
                type="button"
                data-nav={it.key}
                onClick={() => {
                  resetAppScroll();
                  if (pathname !== it.to) navigate(it.to);
                }}
                style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
                className={`relative flex min-h-[52px] w-full flex-col items-center justify-center gap-1 rounded-xl py-1 transition ${
                  isActive ? "text-primary" : "text-foreground/55 hover:text-foreground/80"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <it.Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 2} />
                <span data-nav-label className="max-w-full truncate text-[12px] font-semibold leading-none tracking-[-0.03em]">{t(it.en, it.ar)}</span>
                {isActive && <span className="absolute -top-1.5 h-[3px] w-8 rounded-full bg-accent" />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
