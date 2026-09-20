import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Admin announcements (the app's Notification Center content). These are
 * server messages, entirely separate from the local prayer / Athkar / calendar
 * notifications and their settings. Read-tracking key is unchanged. */
export type Announcement = {
  id: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  created_at: string;
};

const READ_KEY = "announcements:lastReadAt";

export function useAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string>(() => {
    try { return localStorage.getItem(READ_KEY) || ""; } catch { return ""; }
  });

  const load = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("announcements")
        .select("id,title_ar,title_en,body_ar,body_en,created_at")
        .eq("published", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setItems(data as Announcement[]);
    } catch {
      /* offline: keep what we have */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("announcements-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const unread = items.filter((a) => !lastReadAt || a.created_at > lastReadAt).length;

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    try { localStorage.setItem(READ_KEY, now); } catch { /* private mode */ }
    setLastReadAt(now);
  }, []);

  return { items, loaded, unread, lastReadAt, markAllRead };
}
