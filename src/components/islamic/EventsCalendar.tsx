import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toHijri } from "hijri-converter";
import { ar, enUS } from "date-fns/locale";
import { useLocale } from "@/contexts/LocaleContext";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DEFAULT_REMINDER_SOUND, type ReminderSoundId } from "@/lib/notifications/sounds";
import {
  CalEvent,
  Repeat,
  eventDateTime,
  loadEvents,
  occursOn,
  pad2,
  parseYmd,
  relativeLabel,
  saveEvents,
  upcoming,
  ymd,
} from "@/lib/events";
import { requestNotificationRebuild } from "@/lib/notifications/coordinator";
import { uid } from "@/lib/id";
import { checkPermissionStatus } from "@/lib/notifications/permission";
import { requestReopenNotificationOnboarding } from "@/components/notifications/NotificationOnboardingCard";
import { isIOSNativeApp } from "@/lib/platform";
import { CATEGORY_ICON, EventForm, type EventDraft } from "./EventForm";

const MODE_KEY = "elite.calendar.mode.v1";
type Mode = "gregorian" | "hijri";

/** A sensible default time: 09:00 on a future day; for today, the next full hour
 * at least 30 minutes away — so "Save" is never rejected for a time that has
 * already passed just because the user kept the default. */
function defaultTimeFor(date: Date): string {
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (!sameDay) return "09:00";
  const t = new Date(now.getTime() + 30 * 60_000);
  t.setMinutes(0, 0, 0);
  t.setHours(t.getHours() + 1);
  if (t.getDate() !== now.getDate()) return "23:59";
  return `${pad2(t.getHours())}:00`;
}

const emptyDraft = (date: Date): EventDraft => ({
  title: "",
  notes: "",
  date,
  time: defaultTimeFor(date),
  repeat: "none" as Repeat,
  remindMinutesBefore: 10,
  sound: DEFAULT_REMINDER_SOUND as ReminderSoundId,
  category: "general",
});

function fmtMonth(d: Date, lang: "ar" | "en", calendar: "gregory" | "islamic-umalqura") {
  const loc = `${lang === "ar" ? "ar-SA" : "en-US"}-u-ca-${calendar}-nu-latn`;
  return new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(d);
}

/** Hijri title for a Gregorian month: one month, or "A – B" when the month spans two. */
function hijriMonthTitle(month: Date, lang: "ar" | "en") {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const a = fmtMonth(first, lang, "islamic-umalqura");
  const b = fmtMonth(last, lang, "islamic-umalqura");
  return a === b ? a : `${a.replace(/\s\d+.*$/, "")} – ${b}`;
}

function fmtDay(d: Date, lang: "ar" | "en", calendar: "gregory" | "islamic-umalqura") {
  const loc = `${lang === "ar" ? "ar-SA" : "en-US"}-u-ca-${calendar}-nu-latn`;
  return new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function EventsCalendar({ hideHeading = false }: { hideHeading?: boolean }) {
  const { t, dir, lang } = useLocale();
  const L: "ar" | "en" = lang === "ar" ? "ar" : "en";
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<CalEvent[]>(() => loadEvents());
  const [selected, setSelected] = useState<Date>(new Date());
  const [month, setMonth] = useState<Date>(new Date());
  const [now, setNow] = useState(new Date());
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === "hijri" ? "hijri" : "gregorian";
    } catch {
      return "gregorian";
    }
  });
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(() => emptyDraft(new Date()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    saveEvents(events);
    requestNotificationRebuild();
  }, [events, lang]);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* private mode */
    }
  }, [mode]);

  // Deep links:
  //  /calendar?event=<id>       opened from a notification tap
  //  /calendar?add=1|YYYY-MM-DD open the "add appointment" form (optionally on a date)
  useEffect(() => {
    const evId = params.get("event");
    const add = params.get("add");
    if (!evId && !add) return;
    if (evId) {
      const ev = events.find((e) => e.id === evId);
      if (ev) {
        // `ev.date` is a bare "yyyy-mm-dd": parse in local time (new Date(str) is UTC).
        const d = parseYmd(ev.date);
        setSelected(d);
        setMonth(d);
      }
    }
    if (add) {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(add) ? parseYmd(add) : new Date();
      setSelected(d);
      setMonth(d);
      setEditingId(null);
      setDraft(emptyDraft(d));
      setFormOpen(true);
    }
    const next = new URLSearchParams(params);
    next.delete("event");
    next.delete("add");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const dayEvents = useMemo(
    () => events.filter((e) => occursOn(e, selected)).sort((a, b) => a.time.localeCompare(b.time)),
    [events, selected],
  );

  const eventDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const days: Date[] = [];
    for (let d = new Date(first); d.getMonth() === first.getMonth(); d.setDate(d.getDate() + 1)) {
      const day = new Date(d);
      if (events.some((e) => occursOn(e, day))) days.push(day);
    }
    return days;
  }, [events, month]);

  const next = useMemo(() => upcoming(events, 6, now), [events, now]);

  const openAdd = () => {
    setEditingId(null);
    setFormError(null);
    setDraft(emptyDraft(selected));
    setFormOpen(true);
  };

  const openEdit = (e: CalEvent) => {
    setEditingId(e.id);
    setFormError(null);
    setDraft({
      title: e.title,
      notes: e.notes ?? "",
      date: parseYmd(e.date),
      time: e.time,
      repeat: e.repeat,
      remindMinutesBefore: e.remindMinutesBefore,
      sound: (e.sound ?? DEFAULT_REMINDER_SOUND) as ReminderSoundId,
      category: e.category ?? "general",
    });
    setFormOpen(true);
  };

  const saveDraft = () => {
    if (!draft.title.trim()) {
      setFormError(t("Enter a title for the appointment.", "اكتب عنواناً للموعد."));
      return;
    }
    const dateStr = ymd(draft.date);
    const time = draft.time || "09:00";
    // A one-time event in the past is never scheduled (nextOccurrence() drops
    // it), so the user would never know why no reminder arrives: say so, in
    // the form itself (a toast behind a full-screen sheet is easy to miss).
    if (draft.repeat === "none" && eventDateTime(dateStr, time) <= new Date()) {
      setFormError(t("This time has already passed. Choose a future date and time.", "هذا الوقت قد فات بالفعل. اختر تاريخاً ووقتاً في المستقبل."));
      return;
    }
    setFormError(null);
    const existing = editingId ? events.find((x) => x.id === editingId) : undefined;
    const ev: CalEvent = {
      id: existing?.id ?? uid(),
      title: draft.title.trim(),
      date: dateStr,
      time,
      notes: draft.notes.trim() || undefined,
      repeat: draft.repeat,
      remindMinutesBefore: draft.remindMinutesBefore,
      sound: draft.sound,
      category: draft.category,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    setEvents((p) => (existing ? p.map((x) => (x.id === ev.id ? ev : x)) : [...p, ev]));
    setSelected(draft.date);
    setMonth(draft.date);
    setFormOpen(false);
    setEditingId(null);
    toast({ title: existing ? t("Event updated", "تم تحديث الموعد") : t("Event added", "تمت إضافة الموعد") });

    // First time a reminder is requested and iOS has never been asked: explain
    // why notifications are needed (the system prompt only ever appears from
    // the explanation card's button, never on its own).
    if (ev.remindMinutesBefore !== null && isIOSNativeApp()) {
      void checkPermissionStatus().then((st) => {
        if (st === "notDetermined") requestReopenNotificationOnboarding();
      });
    }
  };

  const removeEvent = (id: string) => {
    setEvents((p) => p.filter((e) => e.id !== id));
    if (editingId === id) {
      setFormOpen(false);
      setEditingId(null);
    }
  };

  const shiftMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;

  const primaryTitle = mode === "hijri" ? hijriMonthTitle(month, L) : fmtMonth(month, L, "gregory");
  const secondaryTitle = mode === "hijri" ? fmtMonth(month, L, "gregory") : hijriMonthTitle(month, L);

  const renderRow = (e: CalEvent, subtitle?: string) => {
    const Icon = CATEGORY_ICON[e.category ?? "general"];
    return (
      <li key={e.id + (subtitle ?? "")} className="flex items-center gap-2 px-1 py-1" data-event-id={e.id}>
        <button
          type="button"
          onClick={() => openEdit(e)}
          aria-label={`${t("Edit", "تعديل")}: ${e.title}`}
          className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-start"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-body font-semibold">{e.title}</span>
            <span className="block truncate text-body-sm text-foreground/60">{subtitle ?? e.notes ?? ""}</span>
          </span>
          <span dir="ltr" className="shrink-0 font-time text-body-sm font-bold tabular-nums text-foreground/75">
            {e.time}
          </span>
          {e.remindMinutesBefore !== null && (
            <Bell className="h-4 w-4 shrink-0 text-[hsl(var(--elite-gold-start))]" aria-label={t("Reminder on", "التذكير مفعّل")} />
          )}
        </button>
        <button
          type="button"
          onClick={() => removeEvent(e.id)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/45 transition hover:text-destructive"
          aria-label={`${t("Delete", "حذف")}: ${e.title}`}
        >
          <Trash2 className="h-[18px] w-[18px]" />
        </button>
      </li>
    );
  };

  return (
    <div dir={dir} className="space-y-4">
      {!hideHeading && <h2 className="px-1 font-display text-h3 font-bold">{t("Calendar & Events", "التقويم والمواعيد")}</h2>}

      {/* ---- Month card ---- */}
      <div className="glass rounded-3xl p-3">
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label={t("Previous month", "الشهر السابق")}
            className="grid h-10 w-10 place-items-center rounded-full bg-foreground/[0.06] transition active:scale-95"
          >
            <Prev className="h-5 w-5" />
          </button>
          <div className="min-w-0 text-center leading-tight">
            <div className="truncate font-display text-h3 font-bold" data-testid="cal-primary-title">
              {primaryTitle}
            </div>
            <div className="truncate text-body-sm text-foreground/60">{secondaryTitle}</div>
          </div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label={t("Next month", "الشهر التالي")}
            className="grid h-10 w-10 place-items-center rounded-full bg-foreground/[0.06] transition active:scale-95"
          >
            <Next className="h-5 w-5" />
          </button>
        </div>

        <div
          role="radiogroup"
          aria-label={t("Calendar type", "نوع التقويم")}
          className="mx-auto mb-2 flex w-full max-w-[260px] rounded-full bg-foreground/[0.06] p-0.5"
        >
          {(["gregorian", "hijri"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "min-h-[36px] flex-1 rounded-full px-3 text-body-sm font-semibold transition",
                mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/65",
              )}
            >
              {m === "gregorian" ? t("Gregorian", "ميلادي") : t("Hijri", "هجري")}
            </button>
          ))}
        </div>

        <Calendar
          mode="single"
          locale={lang === "ar" ? ar : enUS}
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          onSelect={(d) => d && setSelected(d)}
          modifiers={{ hasEvent: eventDays }}
          modifiersClassNames={{
            hasEvent:
              "relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-accent",
          }}
          formatters={{
            formatDay: (date) => {
              let hd = "";
              try {
                hd = String(toHijri(date.getFullYear(), date.getMonth() + 1, date.getDate()).hd);
              } catch {
                /* noop */
              }
              const greg = String(date.getDate());
              const [big, small] = mode === "hijri" ? [hd, greg] : [greg, hd];
              return (
                <div className="flex flex-col items-center justify-center gap-0.5 leading-none">
                  <span className="text-[16px] font-bold">{big}</span>
                  <span className="text-[11px] font-normal opacity-70">{small}</span>
                </div>
              );
            },
          }}
          classNames={{
            caption: "hidden",
            head_cell: "text-foreground/60 rounded-md w-11 font-semibold text-[0.8rem]",
            cell: "h-12 w-11 p-0 text-center text-sm relative focus-within:relative focus-within:z-20",
            day: "h-12 w-11 rounded-full p-0 font-normal transition aria-selected:opacity-100 hover:bg-primary/10",
            day_selected: "!bg-primary !text-primary-foreground hover:!bg-primary",
            day_today: "ring-2 ring-inset ring-accent",
            day_outside: "text-foreground/30 opacity-60",
          }}
          className="pointer-events-auto mx-auto p-0"
        />
      </div>

      {/* ---- Selected day ---- */}
      <div className="glass rounded-3xl p-4">
        <div className="min-w-0 leading-snug">
          <div className="truncate font-display text-body-lg font-bold" data-testid="cal-selected-greg">
            {fmtDay(selected, L, "gregory")}
          </div>
          <div className="truncate text-body-sm text-[hsl(var(--elite-gold-start))]" data-testid="cal-selected-hijri">
            {fmtDay(selected, L, "islamic-umalqura")}
          </div>
        </div>
        <ul className="mt-2 divide-y divide-foreground/[0.07]" data-testid="day-list">
          {dayEvents.length === 0 ? (
            <li className="py-7 text-center text-body-sm text-foreground/55">{t("No events for this day.", "لا توجد مواعيد في هذا اليوم.")}</li>
          ) : (
            dayEvents.map((e) => renderRow(e))
          )}
        </ul>
      </div>

      {/* ---- Upcoming ---- */}
      <div className="glass rounded-3xl p-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="font-display text-body-lg font-bold">{t("Upcoming Appointments", "المواعيد القادمة")}</h3>
          <button
            type="button"
            data-testid="add-event"
            onClick={openAdd}
            aria-label={t("Add event", "إضافة موعد")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-4 text-body-sm font-bold text-primary-foreground shadow-sm transition active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {t("Add", "إضافة")}
          </button>
        </div>
        {next.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-foreground/55">{t("No upcoming appointments.", "لا توجد مواعيد قادمة.")}</p>
        ) : (
          <ul className="divide-y divide-foreground/[0.07]" data-testid="upcoming-list">
            {next.map(({ ev, when }) => renderRow(ev, relativeLabel(when, L, now)))}
          </ul>
        )}
      </div>

      <EventForm
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingId(null);
        }}
        draft={draft}
        setDraft={(fn) => { setFormError(null); setDraft(fn); }}
        error={formError}
        editing={!!editingId}
        onSave={saveDraft}
        onDelete={editingId ? () => removeEvent(editingId) : undefined}
      />
    </div>
  );
}
