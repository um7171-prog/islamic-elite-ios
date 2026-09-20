import { useEffect, useState } from "react";
import { MosqueArt } from "@/components/site/MosqueArt";

const SEEN_KEY = "elite.splash.seen";
const MIN_MS = 1100;
const MAX_MS = 2600;

/**
 * Launch screen: emerald background with the faint Islamic pattern, mosque
 * silhouette, logo, name, tagline and a progress bar. It stays up until the
 * page's web fonts are ready (real loading) but never shorter than MIN_MS or
 * longer than MAX_MS, and is shown once per session.
 * (Bilingual by design — it appears before the user's language is applied.)
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setLeaving(true);
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* private mode */
      }
      window.setTimeout(() => setVisible(false), 350);
    };
    const start = Date.now();
    const ready = (document.fonts?.ready ?? Promise.resolve()).catch(() => undefined);
    void ready.then(() => window.setTimeout(finish, Math.max(0, MIN_MS - (Date.now() - start))));
    const hard = window.setTimeout(finish, MAX_MS);
    return () => window.clearTimeout(hard);
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      data-testid="splash"
      role="status"
      aria-label="Islamic Elite"
      className={`bg-header fixed inset-0 z-[200] flex flex-col items-center justify-between overflow-hidden transition-opacity duration-300 ${leaving ? "opacity-0" : "opacity-100"}`}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 text-white/[0.09]">
        <MosqueArt className="mx-auto w-[130%] max-w-none -translate-x-[12%] translate-y-[8%]" />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-[16%] h-40 w-40 -translate-x-1/2 rounded-full bg-[hsl(var(--elite-gold-end)/0.10)] blur-3xl" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8 text-center">
        <img src="/icons/icon-192.png" alt="" width={104} height={104} className="h-[104px] w-[104px] rounded-[26px] shadow-2xl ring-1 ring-white/20" />
        <h1 className="mt-6 font-display text-[34px] font-bold leading-tight text-white" lang="ar" dir="rtl">النخبة الإسلامية</h1>
        <p className="mt-1 text-lg tracking-[0.3em] text-white/80" lang="en" dir="ltr">Islamic Elite</p>
        <p className="mt-5 text-body text-[hsl(var(--elite-gold-end))]" lang="ar" dir="rtl">رفيقك اليومي في طريق الطاعة</p>
      </div>

      <div className="relative z-10 mb-14 h-1.5 w-40 overflow-hidden rounded-full bg-white/15">
        <div className="h-full w-full origin-left animate-[splash-load_1.6s_ease-in-out_infinite] rounded-full bg-[hsl(var(--elite-gold-end))]" />
      </div>
    </div>
  );
}
