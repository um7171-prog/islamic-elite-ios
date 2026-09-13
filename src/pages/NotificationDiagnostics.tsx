import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isNativeApp, NOTIF_RANGES } from "@/lib/nativeNotify";
import { useCity } from "@/contexts/CityContext";
import { useLocale } from "@/contexts/LocaleContext";
import { usePrayerCalc } from "@/contexts/PrayerCalcContext";
import { loadAthanSettings, saveAthanSettings } from "@/lib/athanSettings";
import { rescheduleNativeAthan } from "@/lib/nativeAthan";
import { getPrayerTimes } from "@/lib/prayer";
import { loadEvents, saveEvents, syncEventNotifications } from "@/lib/events";
import { loadAthkarSettings, saveAthkarSettings, syncAthkarReminders, type AthkarDayTimes } from "@/lib/athkarReminders";

const TEST_ID = 900001;
const DIRECT_PRAYER_TEST_ID = 19990;

type PermissionValue = "unknown" | "granted" | "denied" | "prompt" | "web" | "error";

type PhaseStatus = "idle" | "running" | "success" | "failed" | "timeout";
interface PhaseResult {
  status: PhaseStatus;
  pending: number;
  message: string;
}

interface DiagnosticState {
  platform: string;
  permission: PermissionValue;
  scheduled: boolean;
  pending: boolean;
  pendingTotal: number;
  prayerPending: number;
  eventsPending: number;
  athkarPending: number;
  testAt: string | null;
  lastError: string;
}

const initialState: DiagnosticState = {
  platform: "unknown",
  permission: "unknown",
  scheduled: false,
  pending: false,
  pendingTotal: 0,
  prayerPending: 0,
  eventsPending: 0,
  athkarPending: 0,
  testAt: null,
  lastError: "",
};

function inRange(id: number, min: number, max: number): boolean {
  return id >= min && id <= max;
}

export default function NotificationDiagnostics() {
  const navigate = useNavigate();
  const { city } = useCity();
  const { lang } = useLocale();
  const { madhab, method, adjustments, prefs } = usePrayerCalc();
  const [state, setState] = useState<DiagnosticState>(initialState);
  const [repairStatus, setRepairStatus] = useState("");
  const [directPrayerStatus, setDirectPrayerStatus] = useState("لم يبدأ");
  const [loading, setLoading] = useState(false);
  const [phases, setPhases] = useState<Record<"prayer" | "events" | "athkar", PhaseResult>>({
    prayer: { status: "idle", pending: 0, message: "لم يبدأ" },
    events: { status: "idle", pending: 0, message: "لم يبدأ" },
    athkar: { status: "idle", pending: 0, message: "لم يبدأ" },
  });

  const withTimeout = async <T,>(promise: Promise<T>, label: string, ms = 12000): Promise<T> =>
    await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        window.setTimeout(() => reject(new Error(`${label}: انتهت المهلة بعد ${Math.round(ms / 1000)} ثانية`)), ms),
      ),
    ]);

  const countPendingRange = async (min: number, max: number): Promise<number> => {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const pending = await withTimeout(LocalNotifications.getPending(), "قراءة Pending", 6000);
    return (pending.notifications || []).filter((n) => {
      const id = Number(n.id);
      return id >= min && id <= max;
    }).length;
  };

  const native = useMemo(() => isNativeApp(), []);

  const refresh = useCallback(async () => {
    if (!native) {
      setState((prev) => ({ ...prev, platform: "web", permission: "web", lastError: "هذه الأداة تعمل داخل تطبيق iPhone فقط." }));
      return;
    }

    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
      const permission = await LocalNotifications.checkPermissions();
      const result = await LocalNotifications.getPending();
      const notifications = result.notifications || [];
      const ids = notifications.map((item) => Number(item.id));
      const test = notifications.find((item) => Number(item.id) === TEST_ID);
      const testAt = test?.schedule?.at ? new Date(test.schedule.at).toLocaleString("ar-SA", { hour12: false }) : null;

      setState((prev) => ({
        ...prev,
        platform: cap?.getPlatform?.() || "ios",
        permission: permission.display as PermissionValue,
        pending: ids.includes(TEST_ID),
        pendingTotal: ids.length,
        prayerPending: ids.filter((id) => inRange(id, NOTIF_RANGES.prayer.min, NOTIF_RANGES.prayer.max)).length,
        eventsPending: ids.filter((id) => inRange(id, NOTIF_RANGES.events.min, NOTIF_RANGES.events.max)).length,
        athkarPending: ids.filter((id) => inRange(id, NOTIF_RANGES.athkar.min, NOTIF_RANGES.athkar.max)).length,
        testAt,
        lastError: "",
      }));
    } catch (error) {
      setState((prev) => ({ ...prev, permission: "error", lastError: String((error as Error)?.message || error) }));
    }
  }, [native]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const repairAndRescheduleAll = async () => {
    if (loading) return;
    setLoading(true);
    setRepairStatus("بدأ الفحص المرحلي.");
    setPhases({
      prayer: { status: "idle", pending: 0, message: "بانتظار البدء" },
      events: { status: "idle", pending: 0, message: "بانتظار البدء" },
      athkar: { status: "idle", pending: 0, message: "بانتظار البدء" },
    });

    try {
      if (!native) throw new Error("الإصلاح متاح داخل تطبيق iPhone فقط.");
      const calc = { method, adjustments, ishaDelayMinutes: prefs.ishaDelay30 ? 30 : 0 };
      const locale: "ar" | "en" = lang === "ar" ? "ar" : "en";

      const athan = loadAthanSettings();
      const repairedAthan = {
        ...athan,
        preReminderMinutes: 5 as const,
        perPrayerEnabled: {
          ...athan.perPrayerEnabled,
          fajr: true, sunrise: false, dhuhr: true, asr: true, maghrib: true, isha: true,
        },
      };
      saveAthanSettings(repairedAthan);

      const athkar = loadAthkarSettings();
      const repairedAthkar = { ...athkar, morningEnabled: true, eveningEnabled: true };
      saveAthkarSettings(repairedAthkar);

      const existingEvents = loadEvents();
      const repairedEvents = existingEvents.map((ev) =>
        ev.remindMinutesBefore === null ? { ...ev, remindMinutesBefore: 0 } : ev,
      );
      saveEvents(repairedEvents);

      setPhases((p) => ({ ...p, prayer: { status: "running", pending: 0, message: "جارٍ جدولة الصلاة…" } }));
      try {
        const prayerRes = await withTimeout(rescheduleNativeAthan({
          lat: city.lat, lng: city.lng, madhab, calc, settings: repairedAthan, lang: locale, days: 3,
        } as any), "جدولة الصلاة");
        const pending = await countPendingRange(NOTIF_RANGES.prayer.min, NOTIF_RANGES.prayer.max);
        setPhases((p) => ({ ...p, prayer: {
          status: pending > 0 ? "success" : "failed",
          pending,
          message: pending > 0 ? `نجحت. Pending=${pending}` : `لم تدخل الصلاة إلى Pending. reported=${(prayerRes as any)?.scheduled ?? 0}`,
        } }));
      } catch (error) {
        const message = String((error as Error)?.message || error);
        setPhases((p) => ({ ...p, prayer: { status: message.includes("انتهت المهلة") ? "timeout" : "failed", pending: 0, message } }));
      }

      const days: AthkarDayTimes[] = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const { times } = getPrayerTimes(d, city.lat, city.lng, madhab, calc);
        days.push({ sunrise: times.sunrise, maghrib: times.maghrib });
      }

      setPhases((p) => ({ ...p, events: { status: "running", pending: 0, message: "جارٍ جدولة المواعيد…" } }));
      try {
        const eventsRes = await withTimeout(syncEventNotifications(repairedEvents, locale), "جدولة المواعيد");
        const pending = await countPendingRange(NOTIF_RANGES.events.min, NOTIF_RANGES.events.max);
        setPhases((p) => ({ ...p, events: {
          status: repairedEvents.length === 0 || pending > 0 ? "success" : "failed",
          pending,
          message: repairedEvents.length === 0 ? "لا توجد مواعيد محفوظة." : pending > 0 ? `نجحت. Pending=${pending}` : `لم تدخل المواعيد إلى Pending. reported=${(eventsRes as any)?.scheduled ?? 0}`,
        } }));
      } catch (error) {
        const message = String((error as Error)?.message || error);
        setPhases((p) => ({ ...p, events: { status: message.includes("انتهت المهلة") ? "timeout" : "failed", pending: 0, message } }));
      }

      setPhases((p) => ({ ...p, athkar: { status: "running", pending: 0, message: "جارٍ جدولة الأذكار…" } }));
      try {
        const athkarCount = await withTimeout(syncAthkarReminders(repairedAthkar, days, locale), "جدولة الأذكار");
        const pending = await countPendingRange(NOTIF_RANGES.athkar.min, NOTIF_RANGES.athkar.max);
        setPhases((p) => ({ ...p, athkar: {
          status: pending > 0 ? "success" : "failed",
          pending,
          message: pending > 0 ? `نجحت. Pending=${pending}` : `لم تدخل الأذكار إلى Pending. reported=${athkarCount}`,
        } }));
      } catch (error) {
        const message = String((error as Error)?.message || error);
        setPhases((p) => ({ ...p, athkar: { status: message.includes("انتهت المهلة") ? "timeout" : "failed", pending: 0, message } }));
      }

      setRepairStatus("انتهى الفحص المرحلي. صوّر نتائج المراحل الثلاث.");
      await refresh();
    } catch (error) {
      setRepairStatus(`فشل بدء الفحص: ${String((error as Error)?.message || error)}`);
    } finally {
      setLoading(false);
    }
  };

  const runDirectPrayerTest = async () => {
    if (loading) return;
    setLoading(true);
    setDirectPrayerStatus("جارٍ إنشاء إشعار صلاة مباشر…");
    try {
      if (!native) throw new Error("الاختبار متاح داخل تطبيق iPhone فقط.");
      const { LocalNotifications } = await import("@capacitor/local-notifications");

      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted" && permission.display !== "denied") {
        permission = await LocalNotifications.requestPermissions();
      }
      if (permission.display !== "granted") {
        throw new Error(`صلاحية الإشعارات: ${permission.display}`);
      }

      try {
        await LocalNotifications.cancel({ notifications: [{ id: DIRECT_PRAYER_TEST_ID }] });
      } catch {
        // The diagnostic item may not exist yet.
      }

      const at = new Date(Date.now() + 90_000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: DIRECT_PRAYER_TEST_ID,
            title: "اختبار صلاة مباشر",
            body: "هذا اختبار مباشر لمسار إشعارات الصلاة على iPhone.",
            schedule: { at },
            sound: "default",
            extra: { route: "/notifications-diagnostics", kind: "direct-prayer-test" },
          },
        ],
      });

      const pending = await LocalNotifications.getPending();
      const exists = (pending.notifications || []).some(
        (item) => Number(item.id) === DIRECT_PRAYER_TEST_ID,
      );

      setDirectPrayerStatus(
        exists
          ? `نجح ✅ — دخل إلى Pending برقم ${DIRECT_PRAYER_TEST_ID}. اقفل شاشة iPhone وانتظر 90 ثانية.`
          : "فشل ❌ — schedule رجع بدون خطأ لكن إشعار الصلاة المباشر لم يظهر في Pending.",
      );
      await refresh();
    } catch (error) {
      setDirectPrayerStatus(`فشل ❌ — ${String((error as Error)?.message || error)}`);
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    setLoading(true);
    setState((prev) => ({ ...prev, scheduled: false, pending: false, lastError: "" }));
    try {
      if (!native) throw new Error("الاختبار متاح داخل تطبيق iPhone فقط.");
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted" && permission.display !== "denied") {
        permission = await LocalNotifications.requestPermissions();
      }
      if (permission.display !== "granted") throw new Error(`صلاحية الإشعارات: ${permission.display}`);

      try {
        await LocalNotifications.cancel({ notifications: [{ id: TEST_ID }] });
      } catch {
        // The test may not exist yet.
      }

      const at = new Date(Date.now() + 60_000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: TEST_ID,
            title: "اختبار إشعارات النخبة الإسلامية",
            body: "إذا وصل هذا التنبيه فالإشعارات المحلية تعمل على iPhone.",
            schedule: { at },
            sound: "default",
            extra: { route: "/notifications-diagnostics", kind: "diagnostic" },
          },
        ],
      });

      const pendingResult = await LocalNotifications.getPending();
      const exists = (pendingResult.notifications || []).some((item) => Number(item.id) === TEST_ID);
      setState((prev) => ({
        ...prev,
        permission: permission.display as PermissionValue,
        scheduled: true,
        pending: exists,
        testAt: at.toLocaleString("ar-SA", { hour12: false }),
        lastError: exists ? "" : "تم استدعاء schedule لكن ID الاختبار لم يظهر داخل getPending().",
      }));
      await refresh();
    } catch (error) {
      setState((prev) => ({ ...prev, scheduled: false, pending: false, lastError: String((error as Error)?.message || error) }));
    } finally {
      setLoading(false);
    }
  };

  const rows = [
    ["المنصة", state.platform],
    ["الصلاحية", state.permission],
    ["تم استدعاء الجدولة", state.scheduled ? "نعم" : "لا"],
    ["الاختبار موجود في Pending", state.pending ? "نعم" : "لا"],
    ["إجمالي الإشعارات المعلقة", String(state.pendingTotal)],
    ["إشعارات الصلاة المعلقة", String(state.prayerPending)],
    ["إشعارات المواعيد المعلقة", String(state.eventsPending)],
    ["إشعارات الأذكار المعلقة", String(state.athkarPending)],
    ["وقت اختبار الدقيقة", state.testAt || "—"],
    ["آخر خطأ", state.lastError || "لا يوجد"],
  ];

  return (
    <div dir="rtl" className="min-h-full bg-background px-4 py-6">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">فحص إشعارات iPhone</h1>
          <Button variant="outline" onClick={() => navigate(-1)}>رجوع</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">الحالة الفعلية من نظام iOS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 rounded-lg border p-3 text-sm">
                <span className="font-medium">{label}</span>
                <span className="max-w-[60%] break-words text-left text-muted-foreground">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">اختبار صلاة واحد فقط — آمن</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-6 text-muted-foreground">
              هذا الاختبار لا يشغّل جدول الصلاة الكامل ولا الأذكار ولا المواعيد. ينشئ إشعار صلاة واحدًا فقط بعد 90 ثانية باستخدام صوت iPhone الافتراضي.
            </p>
            <Button className="w-full" onClick={runDirectPrayerTest} disabled={loading}>
              {loading ? "جارٍ التنفيذ…" : "اختبار صلاة مباشر بعد 90 ثانية"}
            </Button>
            <div className="rounded-lg border p-3 text-sm leading-6">{directPrayerStatus}</div>
          </CardContent>
        </Card>

        <Button className="w-full" variant="default" onClick={repairAndRescheduleAll} disabled={loading}>
          {loading ? "جارٍ التنفيذ…" : "إصلاح وجدولة الصلاة والمواعيد والأذكار الآن"}
        </Button>
        {repairStatus && (
          <div className="rounded-lg border p-3 text-sm leading-6">{repairStatus}</div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">نتيجة الفحص المرحلي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {([
              ["prayer", "الصلاة"],
              ["events", "المواعيد"],
              ["athkar", "الأذكار"],
            ] as const).map(([key, label]) => {
              const item = phases[key];
              const statusLabel = item.status === "idle" ? "لم يبدأ" : item.status === "running" ? "جارٍ التنفيذ…" : item.status === "success" ? "نجح" : item.status === "timeout" ? "انتهت المهلة" : "فشل";
              return (
                <div key={key} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{label}</span>
                    <span className="text-left text-muted-foreground">{statusLabel} — Pending: {item.pending}</span>
                  </div>
                  <div className="mt-2 break-words text-xs text-muted-foreground">{item.message}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Button onClick={runTest} disabled={loading}>
            {loading ? "جارٍ الفحص…" : "اختبار بعد دقيقة"}
          </Button>
          <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
            تحديث النتائج
          </Button>
        </div>

        <p className="text-xs leading-6 text-muted-foreground">
          بعد الضغط على «اختبار بعد دقيقة»، يجب أن تصبح قيمة Pending «نعم». اقفل شاشة الآيفون وانتظر دقيقة. لا تستخدم هذه الصفحة في الموقع؛ هي مخصصة لنسخة iPhone فقط.
        </p>
      </div>
    </div>
  );
}
