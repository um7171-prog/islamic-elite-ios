import { useEffect, useState } from "react";
import { Bell, Megaphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import { supabase } from "@/integrations/supabase/client";

type Announcement = {
  id: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  created_at: string;
};

const READ_KEY = "announcements:lastReadAt";

export function AnnouncementsBell() {
  const { t, dir, lang } = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Announcement[]>([]);
  const [lastReadAt, setLastReadAt] = useState<string>(() => localStorage.getItem(READ_KEY) || "");

  const load = async () => {
    const { data } = await supabase
      .from("announcements")
      .select("id,title_ar,title_en,body_ar,body_en,created_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setItems(data as Announcement[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("announcements-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const unread = items.filter((a) => !lastReadAt || a.created_at > lastReadAt).length;

  const openSheet = () => {
    setOpen(true);
    const now = new Date().toISOString();
    localStorage.setItem(READ_KEY, now);
    setLastReadAt(now);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-label={t("Updates", "التحديثات")}
        className="relative h-9 w-9 grid place-items-center rounded-xl border border-foreground/10 bg-secondary/40 hover:bg-secondary transition"
      >
        <Bell className="h-4 w-4 text-foreground/80" />
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-elite-gold text-[10px] font-bold text-background grid place-items-center tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={dir} className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-elite-gold flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              {t("Updates & Announcements", "التحديثات والإعلانات")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {items.length === 0 && (
              <div className="py-12 text-center text-sm text-foreground/60">
                {t("No announcements yet.", "لا توجد إعلانات بعد.")}
              </div>
            )}
            {items.map((a) => {
              const title = lang === "ar" ? a.title_ar : a.title_en || a.title_ar;
              const body = lang === "ar" ? a.body_ar : a.body_en || a.body_ar;
              const isNew = !lastReadAt || a.created_at > lastReadAt;
              return (
                <article
                  key={a.id}
                  className="rounded-xl border border-foreground/10 bg-secondary/30 p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-sm font-bold text-elite-gold leading-tight">
                      {title}
                    </h3>
                    {isNew && (
                      <span className="text-[10px] rounded-full bg-elite-gold/20 text-elite-gold px-2 py-0.5 shrink-0">
                        {t("New", "جديد")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{body}</p>
                  <div className="text-[10px] text-foreground/50 tabular-nums">{fmt(a.created_at)}</div>
                </article>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
