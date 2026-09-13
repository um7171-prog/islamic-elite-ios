import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Plus, Trash2, Bell, Repeat as RepeatIcon, X, Clock, Play, Music2 } from "lucide-react";
import { toHijri } from "hijri-converter";
import { useLocale } from "@/contexts/LocaleContext";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DEFAULT_REMINDER_SOUND,
  REMINDER_SOUNDS,
  previewReminderSound,
  type ReminderSoundId,
} from "@/lib/reminderSounds";
import {
  CalEvent,
  REMINDER_CHOICES,
  REPEAT_CHOICES,
  Repeat,
  loadEvents,
  occursOn,
  pad2,
  relativeLabel,
  saveEvents,
  upcoming,
  ymd,
} from "@/lib/events";
import { requestNativeNotificationRebuild } from "@/lib/nativeNotificationCoordinator";

function fmtGregorian(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtHijri(d: Date) {
  try {
    const h = toHijri(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return `${pad2(h.hd)}/${pad2(h.hm)}/${h.hy}`;
  } catch {
    return "";
  }
}

const emptyDraft = (date: Date) => ({
  title: "",
  time: "09:00",
  notes: "",
  repeat: "none" as Repeat,
  remindMinutesBefore: 0 as number | null,
  sound: DEFAULT_REMINDER_SOUND as ReminderSoundId,
  date,
});

export function EventsCalendar() {
  const { t, dir, lang } = useLocale();
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<CalEvent[]>(() => loadEvents());
  const [selected, setSelected] = useState<Date>(new Date());
  const [month, setMonth] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(new Date()));
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    saveEvents(events);
    requestNativeNotificationRebuild();
  }, [events, lang]);

  // Opened from a notification tap: /calendar?event=<id>
  useEffect(() => {
    const id = params.get("event");
    if (!id) return;
    const ev = events.find((e) => e.id === id);
    if (ev) {
      const d = new Date(ev.date);
      setSelected(d);
      setMonth(d);
    }
    params.delete("event");
    setParams(params, { replace: true });
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
    setDraft(emptyDraft(selected));
    setOpen(true);
  };

  const addEvent = () => {
    if (!draft.title.trim()) {
      toast({ title: t("Title required", "العنوان مطلوب"), variant: "destructive" });
      return;
    }
    const ev: CalEvent = {
      id: crypto.randomUUID(),
      title: draft.title.trim(),
      date: ymd(draft.date),
      time: draft.time || "09:00",
      notes: draft.notes.trim() || undefined,
      repeat: draft.repeat,
      remindMinutesBefore: draft.remindMinutesBefore,
      sound: draft.sound,
      createdAt: Date.now(),
    };
    setEvents((p) => [...p, ev]);
    setSelected(draft.date);
    setOpen(false);
    toast({ title: t("Event added", "تمت إضافة الموعد") });
  };

  const removeEvent = (id: string) => setEvents((p) => p.filter((e) => e.id !== id));

  const repeatLabel = (r: Repeat) => {
    const c = REPEAT_CHOICES.find((x) => x.value === r)!;
    return lang === "ar" ? c.ar : c.en;
  };
  const reminderLabel = (m: number | null) => {
    const c = REMINDER_CHOICES.find((x) => x.minutes === m);
    return c ? (lang === "ar" ? c.ar : c.en) : "";
  };

  return (
    <div dir={dir} className="space-y-3">
      <div className="px-1">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-foreground/60">
          {t("Calendar & Events", "التقويم والمواعيد")}
        </h2>
        <p className="mt-1 text-[11px] text-foreground/50">
          {t("Hijri / Gregorian calendar with reminders.", "تقويم هجري وميلادي مع تذكيرات.")}
        </p>
      </div>

      <div className="glass rounded-2xl p-3">
        <Calendar
          mode="single"
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
              return (
                <div className="flex flex-col items-center justify-center leading-none gap-0.5">
                  <span className="text-[9px] font-normal text-muted-foreground">{date.getDate()}</span>
                  <span className="text-[15px] font-bold text-elite-gold">{hd}</span>
                </div>
              );
            },
          }}
          classNames={{
            head_cell: "text-muted-foreground rounded-md w-11 font-normal text-[0.8rem]",
            cell: "h-11 w-11 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
            day: "h-11 w-11 p-0 font-normal aria-selected:opacity-100 rounded-md hover:bg-accent/40 aria-selected:bg-primary aria-selected:text-primary-foreground",
            day_today: "ring-2 ring-elite-gold/70 rounded-md",
          }}
          className="mx-auto pointer-events-auto"
        />
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-foreground/10 pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="font-mono font-semibold text-foreground/85">{fmtGregorian(selected)}</span>
            <span className="text-foreground/30">·</span>
            <span className="font-mono text-elite-gold">{fmtHijri(selected)}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-foreground/40">
            {t("DD/MM/YYYY", "يوم/شهر/سنة")}
          </span>
        </div>
      </div>

      {/* Day events */}
      <div className="glass rounded-2xl p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-8 w-8 shrink-0 rounded-lg grid place-items-center bg-accent/15 text-accent">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t("Events", "مواعيد اليوم المحدد")}</div>
              <div className="truncate font-mono text-[10px] text-foreground/50">{fmtGregorian(selected)}</div>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="h-9 w-9 shrink-0 rounded-full grid place-items-center text-accent-foreground shadow-lg transition active:scale-95 hover:scale-105"
            style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow-gold)" }}
            aria-label={t("Add event", "إضافة موعد")}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {dayEvents.length === 0 ? (
          <div className="py-8 text-center text-xs text-foreground/50">
            {t("No events for this day.", "لا توجد مواعيد في هذا اليوم.")}
          </div>
        ) : (
          <ul className="space-y-2">
            {dayEvents.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-xl border border-foreground/10 bg-background/40 px-3 py-2.5"
              >
                <span className="mt-0.5 h-9 w-9 shrink-0 rounded-lg grid place-items-center bg-accent/15 text-accent">
                  <Clock className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-elite-gold">{e.time}</span>
                    <span className="truncate text-sm font-semibold">{e.title}</span>
                  </div>
                  {e.notes && <p className="mt-0.5 truncate text-[11px] text-foreground/60">{e.notes}</p>}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-foreground/50">
                    {e.repeat !== "none" && (
                      <span className="inline-flex items-center gap-1">
                        <RepeatIcon className="h-3 w-3" />
                        {repeatLabel(e.repeat)}
                      </span>
                    )}
                    {e.remindMinutesBefore !== null && (
                      <span className="inline-flex items-center gap-1">
                        <Bell className="h-3 w-3" />
                        {reminderLabel(e.remindMinutesBefore)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeEvent(e.id)}
                  className="text-foreground/40 transition hover:text-destructive"
                  aria-label={t("Delete", "حذف")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Upcoming */}
      {next.length > 0 && (
        <div className="glass rounded-2xl p-3">
          <div className="mb-2 text-sm font-semibold">{t("Upcoming", "المواعيد القادمة")}</div>
          <ul className="space-y-1.5">
            {next.map(({ ev, when }) => (
              <li key={ev.id + when.toISOString()} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-elite-gold">{ev.time}</span>
                <span className="truncate font-medium">{ev.title}</span>
                <span className="ms-auto shrink-0 text-[11px] text-foreground/60">
                  {relativeLabel(when, lang === "ar" ? "ar" : "en", now)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={dir} className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-elite-gold">{t("New Event", "موعد جديد")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Title", "العنوان")}</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                placeholder={t("Meeting, doctor, study…", "اجتماع، طبيب، مذاكرة…")}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Date", "التاريخ")}</Label>
                <Input
                  type="date"
                  value={ymd(draft.date)}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split("-").map(Number);
                    if (y && m && d) setDraft((p) => ({ ...p, date: new Date(y, m - 1, d) }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Time", "الوقت")}</Label>
                <Input
                  type="time"
                  value={draft.time}
                  onChange={(e) => setDraft((p) => ({ ...p, time: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <RepeatIcon className="h-3.5 w-3.5" />
                {t("Repeat", "التكرار")}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {REPEAT_CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, repeat: c.value }))}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition",
                      draft.repeat === c.value
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-foreground/15 text-foreground/70 hover:border-foreground/30",
                    )}
                  >
                    {lang === "ar" ? c.ar : c.en}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Bell className="h-3.5 w-3.5" />
                {t("Notification", "التنبيه")}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_CHOICES.map((c) => (
                  <button
                    key={String(c.minutes)}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, remindMinutesBefore: c.minutes }))}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition",
                      draft.remindMinutesBefore === c.minutes
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-foreground/15 text-foreground/70 hover:border-foreground/30",
                    )}
                  >
                    {lang === "ar" ? c.ar : c.en}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Music2 className="h-3.5 w-3.5" />
                {t("Reminder sound", "صوت التنبيه")}
              </Label>
              <div className="space-y-1.5 rounded-xl border border-foreground/10 p-2">
                {REMINDER_SOUNDS.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition",
                      draft.sound === s.id
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:bg-foreground/5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setDraft((p) => ({ ...p, sound: s.id }))}
                      className="min-w-0 flex-1 text-start text-[12px] font-medium"
                    >
                      {lang === "ar" ? s.ar : s.en}
                    </button>
                    {s.preview && (
                      <button
                        type="button"
                        onClick={() => previewReminderSound(s.id)}
                        aria-label={t("Preview", "استماع")}
                        className="h-7 w-7 shrink-0 rounded-full grid place-items-center bg-accent/15 text-accent transition active:scale-95"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("Notes", "ملاحظات")}</Label>
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder={t("Optional", "اختياري")}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              <X className="h-4 w-4 me-1" />
              {t("Cancel", "إلغاء")}
            </Button>
            <Button onClick={addEvent}>
              <Plus className="h-4 w-4 me-1" />
              {t("Add", "إضافة")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
