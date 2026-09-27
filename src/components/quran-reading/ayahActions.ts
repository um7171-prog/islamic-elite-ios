import type { LucideIcon } from "lucide-react";
import { Bookmark, Copy, Share2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { QuranAyah } from "@/lib/quran";
import { ayahShareText } from "./ayahDisplay";

type Translate = (en: string, ar: string) => string;

/**
 * Actions on one ayah. Each is a plain entry so a later phase can switch one on (listen = the
 * Mushaf's ayah player once extracted into a shared hook; save = an ayah bookmark store) without
 * touching the sheet. No `run` → shown disabled as "coming soon".
 */
export interface AyahAction {
  id: "listen" | "save" | "copy" | "share";
  Icon: LucideIcon;
  label: { ar: string; en: string };
  run?: (ayah: QuranAyah, t: Translate) => void | Promise<void>;
}

async function copyAyah(a: QuranAyah, t: Translate) {
  try {
    await navigator.clipboard.writeText(ayahShareText(a));
    toast.success(t("Ayah copied", "نُسخت الآية"));
  } catch {
    toast.error(t("Couldn't copy", "تعذّر النسخ"));
  }
}

async function shareAyah(a: QuranAyah, t: Translate) {
  const text = ayahShareText(a);
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      toast.success(t("Ayah copied", "نُسخت الآية"));
    }
  } catch (e) {
    if ((e as Error)?.name !== "AbortError") toast.error(t("Couldn't share", "تعذّرت المشاركة"));
  }
}

export const AYAH_ACTIONS: AyahAction[] = [
  { id: "listen", Icon: Volume2, label: { ar: "استماع", en: "Listen" } },
  { id: "save", Icon: Bookmark, label: { ar: "حفظ", en: "Save" } },
  { id: "copy", Icon: Copy, label: { ar: "نسخ", en: "Copy" }, run: copyAyah },
  { id: "share", Icon: Share2, label: { ar: "مشاركة", en: "Share" }, run: shareAyah },
];
