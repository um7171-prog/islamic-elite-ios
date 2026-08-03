import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Plus,
  Trash2,
  Clock,
  X,
  Bell,
  Stethoscope,
  Users,
  Briefcase,
  PartyPopper,
  Dumbbell,
  Receipt,
  Phone,
  Utensils,
  GraduationCap,
  Plane,
  Tag,
  CalendarIcon,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toHijri } from "hijri-converter";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------- Date helpers (numeric dual format) ----------
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmtGregorianNumeric(d: Date) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtHijriNumeric(d: Date) {
  try {
    const h = toHijri(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return `${pad(h.hd)}/${pad(h.hm)}/${h.hy}`;
  } catch {
    return "";
  }
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- Categories ----------
type CategoryId =
  | "general"
  | "doctor"
  | "meeting"
  | "work"
  | "family"
  | "sport"
  | "bills"
  | "call"
  | "food"
  | "study"
  | "travel";

type Category = {
  id: CategoryId;
  en: string;
  ar: string;
  Icon: typeof Tag;
  /** tailwind text + bg classes for the chip */
  color: string;
};

const CATEGORIES: Category[] = [
  { id: "general", en: "General", ar: "عام", Icon: Tag, color: "text-slate-400 bg-slate-400/15" },
  { id: "doctor", en: "Doctor", ar: "طبيب", Icon: Stethoscope, color: "text-rose-400 bg-rose-500/15" },
  { id: "meeting", en: "Meeting", ar: "اجتماع", Icon: Users, color: "text-sky-400 bg-sky-500/15" },
  { id: "work", en: "Work", ar: "عمل", Icon: Briefcase, color: "text-amber-400 bg-amber-500/15" },
  { id: "family", en: "Family", ar: "عائلة", Icon: PartyPopper, color: "text-pink-400 bg-pink-500/15" },
  { id: "sport", en: "Sport", ar: "رياضة", Icon: Dumbbell, color: "text-emerald-400 bg-emerald-500/15" },
  { id: "bills", en: "Bills", ar: "فواتير", Icon: Receipt, color: "text-yellow-400 bg-yellow-500/15" },
  { id: "call", en: "Call", ar: "اتصال", Icon: Phone, color: "text-indigo-400 bg-indigo-500/15" },
  { id: "food", en: "Food", ar: "طعام", Icon: Utensils, color: "text-orange-400 bg-orange-500/15" },
  { id: "study", en: "Study", ar: "دراسة", Icon: GraduationCap, color: "text-violet-400 bg-violet-500/15" },
  { id: "travel", en: "Travel", ar: "سفر", Icon: Plane, color: "text-cyan-400 bg-cyan-500/15" },
];

function getCategory(id?: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

type Appointment = {
  id: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:MM
  title: string;
  notes?: string;
  remindMinutesBefore?: number;
  category?: CategoryId;
};

const STORAGE_KEY = "elite.appointments.v1";

function loadAppointments(): Appointment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Appointment[]) : [];
  } catch {
    return [];
  }
}
function saveAppointments(list: Appointment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ---------- Notifications ----------
const NOTIFIED_KEY = "elite.appointments.notified.v1";
function loadNotified(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveNotified(m: Record<string, boolean>) {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(m));
}

export function AppointmentsPanel() {
  const { t, dir, lang } = useLocale();
  const [selected, setSelected] = useState<Date>(new Date());
  const [items, setItems] = useState<Appointment[]>(() => loadAppointments());
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<{
    title: string;
    time: string;
    notes: string;
    remindMinutesBefore: number;
    date: Date;
    category: CategoryId;
  }>({
    title: "",
    time: "09:00",
    notes: "",
    remindMinutesBefore: 15,
    date: new Date(),
    category: "general",
  });
  const notifiedRef = useRef<Record<string, boolean>>(loadNotified());

  useEffect(() => {
    saveAppointments(items);
  }, [items]);

  // Reminder loop — checks every 30s and fires browser notifications.
  useEffect(() => {
    const fire = (a: Appointment) => {
      const body = a.notes || t("Appointment reminder", "تذكير بموعد");
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(a.title, { body, tag: a.id });
        } catch {
          toast({ title: a.title, description: body });
        }
      } else {
        toast({ title: a.title, description: body });
      }
    };
    const tick = () => {
      const now = Date.now();
      let changed = false;
      for (const a of items) {
        const [y, m, d] = a.date.split("-").map(Number);
        const [hh, mm] = a.time.split(":").map(Number);
        const ts = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
        const remindAt = ts - (a.remindMinutesBefore ?? 0) * 60_000;
        if (!notifiedRef.current[a.id] && now >= remindAt && now - remindAt < 6 * 60 * 60 * 1000) {
          fire(a);
          notifiedRef.current[a.id] = true;
          changed = true;
        }
      }
      if (changed) saveNotified(notifiedRef.current);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [items, t]);

  const selectedKey = ymd(selected);
  const dayItems = useMemo(
    () => items.filter((i) => i.date === selectedKey).sort((a, b) => a.time.localeCompare(b.time)),
    [items, selectedKey],
  );

  const markedDates = useMemo(() => {
    const set = new Set(items.map((i) => i.date));
    return Array.from(set).map((s) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    });
  }, [items]);

  const requestNotifPermission = async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* noop */
      }
    }
  };

  const openAdd = () => {
    setDraft({
      title: "",
      time: "09:00",
      notes: "",
      remindMinutesBefore: 15,
      date: selected,
      category: "general",
    });
    setOpen(true);
  };

  const addAppointment = async () => {
    if (!draft.title.trim()) {
      toast({ title: t("Title required", "العنوان مطلوب"), variant: "destructive" });
      return;
    }
    await requestNotifPermission();
    const a: Appointment = {
      id: crypto.randomUUID(),
      date: ymd(draft.date),
      time: draft.time || "09:00",
      title: draft.title.trim(),
      notes: draft.notes.trim() || undefined,
      remindMinutesBefore: draft.remindMinutesBefore,
      category: draft.category,
    };
    setItems((prev) => [...prev, a]);
    setSelected(draft.date);
    setOpen(false);
    toast({ title: t("Appointment added", "تم إضافة الموعد") });
  };

  const removeAppointment = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    delete notifiedRef.current[id];
    saveNotified(notifiedRef.current);
  };

  const DualDate = ({ d, size = "sm" }: { d: Date; size?: "sm" | "xs" }) => (
    <span className={`inline-flex items-center gap-1.5 ${size === "xs" ? "text-[10px]" : "text-xs"}`}>
      <span className="font-mono font-semibold text-foreground/85">{fmtGregorianNumeric(d)}</span>
      <span className="text-foreground/30">·</span>
      <span className="font-mono text-elite-gold">{fmtHijriNumeric(d)}</span>
    </span>
  );

  return (
    <div dir={dir} className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-foreground/60">
            {t("Schedule & Calendar", "جدول المواعيد والتقويم")}
          </h2>
          <p className="mt-1 text-[11px] text-foreground/50">
            {t("Dual Hijri / Gregorian with smart reminders.", "تقويم هجري وميلادي مع تذكيرات ذكية.")}
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl p-3">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => d && setSelected(d)}
          modifiers={{ hasEvent: markedDates }}
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
            cell: "h-11 w-11 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
            day: "h-11 w-11 p-0 font-normal aria-selected:opacity-100 rounded-md hover:bg-accent/40 aria-selected:bg-primary aria-selected:text-primary-foreground",
          }}
          className="mx-auto pointer-events-auto"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-foreground/10 pt-3">
          <DualDate d={selected} />
          <span className="text-[10px] uppercase tracking-wider text-foreground/40">
            {t("DD/MM/YYYY", "يوم/شهر/سنة")}
          </span>
        </div>
      </div>

      <div className="glass rounded-2xl p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-8 w-8 shrink-0 rounded-lg grid place-items-center bg-accent/15 text-accent">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t("Appointments", "المواعيد")}</div>
              <div className="truncate">
                <DualDate d={selected} size="xs" />
              </div>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="h-9 w-9 shrink-0 rounded-full grid place-items-center text-accent-foreground shadow-lg transition active:scale-95 hover:scale-105"
            style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow-gold)" }}
            aria-label={t("Add appointment", "إضافة موعد")}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {dayItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-foreground/50">
            {t("No appointments for this day.", "لا توجد مواعيد في هذا اليوم.")}
          </div>
        ) : (
          <ul className="space-y-2">
            {dayItems.map((a) => {
              const cat = getCategory(a.category);
              const Icon = cat.Icon;
              return (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-xl border border-foreground/10 bg-background/40 px-3 py-2.5"
                >
                  <span className={cn("mt-0.5 h-9 w-9 shrink-0 rounded-lg grid place-items-center", cat.color)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-elite-gold">{a.time}</span>
                      <span className="truncate text-sm font-semibold">{a.title}</span>
                      <span className="ms-auto shrink-0 text-[10px] text-foreground/40">
                        {lang === "ar" ? cat.ar : cat.en}
                      </span>
                    </div>
                    {a.notes && <p className="mt-0.5 truncate text-[11px] text-foreground/60">{a.notes}</p>}
                    {!!a.remindMinutesBefore && (
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-foreground/50">
                        <Bell className="h-3 w-3" />
                        {t(`Reminder ${a.remindMinutesBefore}m before`, `تذكير قبل ${a.remindMinutesBefore} دقيقة`)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeAppointment(a.id)}
                    className="text-foreground/40 transition hover:text-destructive"
                    aria-label={t("Delete", "حذف")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={dir} className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-elite-gold">{t("New Appointment", "موعد جديد")}</DialogTitle>
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

            {/* Date picker (popup calendar) */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <CalendarIcon className="h-3.5 w-3.5" />
                {t("Date", "التاريخ")}
              </Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start font-mono text-xs"
                  >
                    <CalendarIcon className="h-4 w-4 me-2" />
                    <span>{fmtGregorianNumeric(draft.date)}</span>
                    <span className="mx-1.5 text-foreground/30">·</span>
                    <span className="text-elite-gold">{fmtHijriNumeric(draft.date)}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <Calendar
                    mode="single"
                    selected={draft.date}
                    onSelect={(d) => {
                      if (d) setDraft((p) => ({ ...p, date: d }));
                      setPickerOpen(false);
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("Time", "الوقت")}</Label>
              <Input
                type="time"
                value={draft.time}
                onChange={(e) => setDraft((p) => ({ ...p, time: e.target.value }))}
              />
            </div>

            {/* Category icons */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Tag className="h-3.5 w-3.5 text-elite-gold" />
                {t("Category", "التصنيف")}
              </Label>
              <div className="grid grid-cols-6 gap-1.5">
                {CATEGORIES.map((c) => {
                  const Icon = c.Icon;
                  const active = draft.category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setDraft((p) => ({ ...p, category: c.id }))}
                      title={lang === "ar" ? c.ar : c.en}
                      className={cn(
                        "aspect-square rounded-xl grid place-items-center border transition",
                        c.color,
                        active
                          ? "border-elite-gold ring-2 ring-elite-gold/40 scale-105"
                          : "border-transparent hover:border-foreground/20",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-foreground/50">
                {lang === "ar" ? getCategory(draft.category).ar : getCategory(draft.category).en}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Bell className="h-3.5 w-3.5" />
                {t("Remind before", "التذكير قبل")}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {[0, 5, 15, 30, 60, 1440].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, remindMinutesBefore: m }))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      draft.remindMinutesBefore === m
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-foreground/15 text-foreground/70 hover:border-foreground/30"
                    }`}
                  >
                    {m === 0
                      ? t("Off", "إيقاف")
                      : m === 1440
                        ? t("1 day", "يوم")
                        : m >= 60
                          ? t(`${m / 60}h`, `${m / 60} ساعة`)
                          : t(`${m}m`, `${m} د`)}
                  </button>
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
            <Button onClick={addAppointment}>
              <Plus className="h-4 w-4 me-1" />
              {t("Add", "إضافة")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
