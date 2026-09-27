import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, BellOff, Download, FlaskConical, Loader2, Pause, Play, Trash2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { playAdhanFromUrl, stopAdhanPlayback } from "@/lib/notifications/AdhanPlayer";
import { NOTIFICATION_CLIP_SECONDS, PROTOTYPE_VOICE as V } from "@/lib/voiceLab/prototypeVoice";
import {
  FULL_DIR, SHORT_DIR, deleteVoice, downloadVoice, fullPath, localPlayableUrl,
  cancelLabTestNotification, isLabTestPending, scheduleLabTestNotification, shortPath, voiceStatus, type VoiceStatus,
} from "@/lib/voiceLab/voiceStore";

const mb = (b: number | null) => (b == null ? "—" : `${(b / 1024 / 1024).toFixed(2)} MB`);

/**
 * Voice Lab (prototype): one licensed athan — preview, download, local playback, a ≤ 29 s
 * notification clip and one test notification. Not the voice library; not linked to the prayer
 * notification settings in any way.
 */
export default function VoiceLabPage() {
  const { t, lang } = useLocale();
  const [status, setStatus] = useState<VoiceStatus>({ fullBytes: null, shortBytes: null });
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [playing, setPlaying] = useState<"preview" | "full" | "short" | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const [labPending, setLabPending] = useState(false);
  const refresh = useCallback(async () => {
    setStatus(await voiceStatus(V));
    setLabPending(await isLabTestPending());
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    stopAdhanPlayback();
    setPlaying(null);
  }, []);
  useEffect(() => stop, [stop]);

  const track = (el: HTMLAudioElement | null, which: "preview" | "full" | "short") => {
    if (!el) return;
    audio.current = el;
    setPlaying(which);
    el.onended = () => setPlaying(null);
  };

  const preview = () => {
    stop();
    const el = new Audio(V.sourceUrl);
    void el.play().catch(() => setMessage(t("Preview needs an internet connection.", "المعاينة تحتاج اتصالًا بالإنترنت.")));
    track(el, "preview");
  };

  const playLocal = async (which: "full" | "short") => {
    stop();
    try {
      if (which === "full") {
        track(playAdhanFromUrl(await localPlayableUrl(FULL_DIR, fullPath(V), "audio/mpeg")), "full");
      } else {
        const el = new Audio(await localPlayableUrl(SHORT_DIR, shortPath(V), "audio/wav"));
        void el.play().catch(() => undefined);
        track(el, "short");
      }
    } catch {
      setMessage(t("The file is not on this device.", "الملف غير موجود على الجهاز."));
    }
  };

  const download = async () => {
    stop();
    setMessage(null);
    setProgress(0);
    try {
      const r = await downloadVoice(V, setProgress);
      setMessage(t(
        `Saved. Notification clip: ${r.shortSeconds.toFixed(1)} s, ${r.shortSampleRate} Hz.`,
        `تم الحفظ. مقطع الإشعار: ${r.shortSeconds.toFixed(1)} ثانية، ${r.shortSampleRate} هرتز.`,
      ));
    } catch (e) {
      setMessage(t("Download failed: ", "تعذّر التحميل: ") + String((e as Error)?.message ?? e));
    } finally {
      setProgress(null);
      await refresh();
    }
  };

  const testNotificationSound = async () => {
    setMessage(null);
    const r = await scheduleLabTestNotification(V);
    if (!("reason" in r)) {
      setLabPending(true);
      setMessage(t(
        `Test notification scheduled in 20 s with sound "${r.sound}". Lock the iPhone now and wait.`,
        `جُدول إشعار تجريبي بعد 20 ثانية بالصوت "${r.sound}". اقفل الجوال الآن وانتظر.`,
      ));
      return;
    }
    setMessage({
      "not-native": t("Only available in the iPhone app.", "متاح في تطبيق iPhone فقط."),
      "permission-denied": t("Notifications are not allowed for the app.", "الإشعارات غير مسموحة للتطبيق."),
      "no-clip": t("The notification clip is not on this device — download first.", "مقطع الإشعار غير موجود على الجهاز — حمّل الصوت أولًا."),
      "not-kept": t("iOS did not keep the test notification.", "لم يحتفظ iOS بالإشعار التجريبي."),
      error: t("Could not schedule: ", "تعذّرت الجدولة: ") + (r.detail ?? ""),
    }[r.reason]);
  };

  const cancelTest = async () => {
    await cancelLabTestNotification();
    setLabPending(false);
    setMessage(t("Lab test notification cancelled.", "أُلغي إشعار المختبر."));
  };

  const remove = async () => {
    stop();
    await cancelLabTestNotification(); // never leave a test pending whose sound file is gone
    await deleteVoice(V);
    setMessage(t("Deleted from this device.", "حُذف من الجهاز."));
    await refresh();
  };

  const downloaded = status.fullBytes != null && status.shortBytes != null;
  const busy = progress != null;

  return (
    <PageShell titleAr="مختبر الأصوات" titleEn="Voice Lab" fallback="/more">
      <SEO title={t("Voice Lab", "مختبر الأصوات")} description={t("Prototype", "نموذج تجريبي")} path="/labs/voice" lang={lang === "ar" ? "ar" : "en"} />
      <div className="space-y-4" data-testid="voice-lab">
        <p className="flex items-center gap-2 text-body-sm text-foreground/70">
          <FlaskConical className="h-4 w-4 shrink-0" />
          {t("Prototype: one licensed voice. Prayer notifications are not affected.", "نموذج تجريبي: صوت واحد مرخّص. لا يؤثر على تنبيهات الصلاة.")}
        </p>

        <div className="glass space-y-3 rounded-2xl p-4">
          <div>
            <h2 className="font-display text-body-lg font-bold">{t(V.nameEn, V.nameAr)}</h2>
            <p className="text-body-sm text-foreground/70" dir="ltr">{V.muezzin} · {Math.round(V.durationSeconds)} s · {mb(V.sizeBytes)}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-body-sm" data-testid="voice-lab-status">
            <span className="text-foreground/60">{t("Full file", "الملف الكامل")}</span>
            <span dir="ltr" data-testid="full-size">{mb(status.fullBytes)}</span>
            <span className="text-foreground/60">{t(`Notification clip (≤ ${NOTIFICATION_CLIP_SECONDS} s)`, `مقطع الإشعار (≤ ${NOTIFICATION_CLIP_SECONDS} ث)`)}</span>
            <span dir="ltr" data-testid="short-size">{mb(status.shortBytes)}</span>
          </div>

          {busy && <Progress value={Math.round((progress ?? 0) * 100)} aria-label={t("Download progress", "تقدم التحميل")} />}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-11" onClick={playing === "preview" ? stop : preview} disabled={busy}>
              {playing === "preview" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {t("Preview", "معاينة")}
            </Button>
            {!downloaded ? (
              <Button className="min-h-11" onClick={download} disabled={busy} data-testid="download">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {t("Download", "تحميل")}
              </Button>
            ) : (
              <>
                <Button className="min-h-11" onClick={() => (playing === "full" ? stop() : void playLocal("full"))}>
                  {playing === "full" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {t("Full athan (device)", "الأذان كاملًا (من الجهاز)")}
                </Button>
                <Button variant="secondary" className="min-h-11" onClick={() => (playing === "short" ? stop() : void playLocal("short"))}>
                  {playing === "short" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {t("Notification clip", "مقطع الإشعار")}
                </Button>
                <Button className="min-h-11" onClick={testNotificationSound} data-testid="test-notification-sound">
                  <BellRing className="h-4 w-4" />
                  {t("Test notification sound", "اختبار صوت الإشعار")}
                </Button>
                {labPending && (
                  <Button variant="secondary" className="min-h-11" onClick={cancelTest} data-testid="cancel-lab-notification">
                    <BellOff className="h-4 w-4" />
                    {t("Cancel lab notification", "إلغاء إشعار المختبر")}
                  </Button>
                )}
                <Button variant="ghost" className="min-h-11 text-destructive" onClick={remove} data-testid="delete">
                  <Trash2 className="h-4 w-4" />
                  {t("Delete", "حذف")}
                </Button>
              </>
            )}
          </div>

          {message && <p role="status" className="text-body-sm text-foreground/80">{message}</p>}
        </div>

        <div className="glass space-y-1 rounded-2xl p-4 text-body-sm text-foreground/70" data-testid="voice-lab-attribution">
          <p className="font-semibold text-foreground">{t("Source & license", "المصدر والترخيص")}</p>
          <p dir="ltr">
            “<a className="underline" href={V.license.pageUrl} target="_blank" rel="noopener noreferrer">{V.license.title}</a>” by{" "}
            <a className="underline" href={V.license.authorUrl} target="_blank" rel="noopener noreferrer">{V.license.author}</a>,{" "}
            <a className="underline" href={V.license.url} target="_blank" rel="noopener noreferrer">{V.license.name}</a>, via Wikimedia Commons.
          </p>
          <p dir="ltr">{V.license.adaptation}</p>
        </div>
      </div>
    </PageShell>
  );
}
