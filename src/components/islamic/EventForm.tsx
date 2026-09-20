import type { ElementType, ReactNode } from "react";
import { Bell, Briefcase, CalendarDays, ChevronDown, Clock, FileText, HeartPulse, Music2, Play, Repeat as RepeatIcon, Tag, Trash2, User, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useLocale } from "@/contexts/LocaleContext";
import { SettingsGroup } from "@/components/site/SettingsUI";
import { REMINDER_SOUNDS, previewSound, type ReminderSoundId } from "@/lib/notifications/sounds";
import { EVENT_CATEGORIES, REMINDER_CHOICES, REPEAT_CHOICES, ymd, type EventCategory, type Repeat } from "@/lib/events";
import { cn } from "@/lib/utils";

export interface EventDraft {
  title: string;
  notes: string;
  date: Date;
  time: string;
  repeat: Repeat;
  /** null = notification off */
  remindMinutesBefore: number | null;
  sound: ReminderSoundId;
  category: EventCategory;
}

export const CATEGORY_ICON: Record<EventCategory, ElementType> = {
  general: CalendarDays,
  work: Briefcase,
  personal: User,
  health: HeartPulse,
};

function Row({ icon: Icon, label, children, htmlFor }: { icon: ElementType; label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <label htmlFor={htmlFor} className="min-w-0 flex-1 text-body font-medium">
        {label}
      </label>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** Native <select> restyled as an iOS value row (platform picker on phones). */
function SelectValue<T extends string | number>({
  id,
  value,
  onChange,
  options,
}: {
  id?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          if (match) onChange(match.value);
        }}
        className="h-10 max-w-[170px] appearance-none rounded-xl bg-foreground/[0.06] ps-3 pe-8 text-body-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute end-2.5 h-4 w-4 text-foreground/50" />
    </span>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: EventDraft;
  setDraft: (updater: (d: EventDraft) => EventDraft) => void;
  editing: boolean;
  onSave: () => void;
  onDelete?: () => void;
  /** Validation message shown inside the form. */
  error?: string | null;
}

/** Full-screen "Add / Edit appointment" form in the app's iOS style. Real
 * controls only: title, notes, date, time, repeat, notification (switch +
 * lead time), reminder sound and category — all stored with the event. */
export function EventForm({ open, onOpenChange, draft, setDraft, editing, onSave, onDelete, error }: Props) {
  const { t, lang, dir } = useLocale();
  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const notifOn = draft.remindMinutesBefore !== null;
  const leadOptions = REMINDER_CHOICES.filter((c) => c.minutes !== null).map((c) => ({
    value: c.minutes as number,
    label: lang === "ar" ? c.ar : c.en,
  }));
  const currentSound = REMINDER_SOUNDS.find((s) => s.id === draft.sound);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={dir}
        aria-describedby={undefined}
        className="!left-0 !top-0 !flex h-[100dvh] !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:!rounded-none [&>button]:hidden"
      >
        <DialogDescription className="sr-only">{t("Appointment details", "تفاصيل الموعد")}</DialogDescription>
        {/* Header: back (close) · title · save */}
        <div
          className="bg-header shrink-0 rounded-b-[28px] px-4 pb-5"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        >
          <div className="mx-auto grid max-w-2xl grid-cols-[auto_1fr_auto] items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t("Close", "إغلاق")}
              className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white outline-none transition focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-0 active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="min-w-0 text-center">
              <DialogTitle className="truncate text-center font-display text-h2 font-bold leading-tight text-white">
                {editing ? t("Edit Appointment", "تعديل الموعد") : t("Add Appointment", "إضافة موعد")}
              </DialogTitle>
              {lang === "ar" && (
                <p className="truncate text-body-sm leading-tight text-white/70" dir="ltr">
                  {editing ? "Edit Appointment" : "Add Appointment"}
                </p>
              )}
            </div>
            <button
              type="button"
              data-testid="event-save"
              onClick={onSave}
              className="h-11 rounded-full border border-[hsl(var(--elite-gold-start))] px-5 text-body font-bold text-[hsl(var(--elite-gold-end))] transition active:scale-95"
            >
              {t("Save", "حفظ")}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-5">
            {error && (
              <div role="alert" data-testid="event-error" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3.5 text-body-sm font-medium leading-relaxed text-destructive">
                {error}
              </div>
            )}
            <SettingsGroup>
              <div className="px-4 py-3">
                <label htmlFor="ev-title" className="mb-1.5 block text-body-sm font-semibold text-foreground/70">
                  {t("Title", "عنوان الموعد")}
                </label>
                <input
                  id="ev-title"
                  data-testid="event-title"
                  value={draft.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder={t("Meeting, doctor, study…", "اجتماع، طبيب، مذاكرة…")}
                  className="h-12 w-full rounded-xl bg-foreground/[0.05] px-3 text-body outline-none placeholder:text-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="px-4 py-3">
                <label htmlFor="ev-notes" className="mb-1.5 block text-body-sm font-semibold text-foreground/70">
                  {t("Description (optional)", "الوصف (اختياري)")}
                </label>
                <textarea
                  id="ev-notes"
                  value={draft.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-xl bg-foreground/[0.05] px-3 py-2.5 text-body outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </SettingsGroup>

            <SettingsGroup>
              <Row icon={CalendarDays} label={t("Date", "التاريخ")} htmlFor="ev-date">
                <input
                  id="ev-date"
                  type="date"
                  value={ymd(draft.date)}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split("-").map(Number);
                    if (y && m && d) set("date", new Date(y, m - 1, d));
                  }}
                  className="h-10 rounded-xl bg-foreground/[0.06] px-3 text-body-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </Row>
              <Row icon={Clock} label={t("Time", "الوقت")} htmlFor="ev-time">
                <input
                  id="ev-time"
                  type="time"
                  value={draft.time}
                  onChange={(e) => set("time", e.target.value)}
                  className="h-10 rounded-xl bg-foreground/[0.06] px-3 text-body-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </Row>
              <Row icon={RepeatIcon} label={t("Repeat", "التكرار")} htmlFor="ev-repeat">
                <SelectValue
                  id="ev-repeat"
                  value={draft.repeat}
                  onChange={(v) => set("repeat", v)}
                  options={REPEAT_CHOICES.map((c) => ({ value: c.value, label: lang === "ar" ? c.ar : c.en }))}
                />
              </Row>
            </SettingsGroup>

            <SettingsGroup>
              <Row icon={Bell} label={t("Notification", "التنبيه")}>
                <Switch
                  aria-label={t("Notification", "التنبيه")}
                  checked={notifOn}
                  onCheckedChange={(v) => set("remindMinutesBefore", v ? 10 : null)}
                />
              </Row>
              {notifOn && (
                <>
                  <Row icon={Clock} label={t("Remind me", "وقت التذكير")} htmlFor="ev-lead">
                    <SelectValue
                      id="ev-lead"
                      value={draft.remindMinutesBefore ?? 10}
                      onChange={(v) => set("remindMinutesBefore", v)}
                      options={leadOptions}
                    />
                  </Row>
                  <Row icon={Music2} label={t("Sound", "الصوت")} htmlFor="ev-sound">
                    {currentSound?.previewUrl && (
                      <button
                        type="button"
                        aria-label={t("Preview", "استماع")}
                        onClick={() => previewSound(currentSound.previewUrl)}
                        className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary transition active:scale-95"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                    )}
                    <SelectValue
                      id="ev-sound"
                      value={draft.sound}
                      onChange={(v) => set("sound", v)}
                      options={REMINDER_SOUNDS.map((s) => ({ value: s.id as ReminderSoundId, label: lang === "ar" ? s.ar : s.en }))}
                    />
                  </Row>
                </>
              )}
            </SettingsGroup>

            <SettingsGroup>
              <Row icon={Tag} label={t("Category", "الفئة")} htmlFor="ev-cat">
                <SelectValue
                  id="ev-cat"
                  value={draft.category}
                  onChange={(v) => set("category", v)}
                  options={EVENT_CATEGORIES.map((c) => ({ value: c.id, label: lang === "ar" ? c.ar : c.en }))}
                />
              </Row>
            </SettingsGroup>

            {editing && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className={cn(
                  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/[0.07] text-body font-semibold text-destructive transition active:scale-[0.98]",
                )}
              >
                <Trash2 className="h-4 w-4" />
                {t("Delete appointment", "حذف الموعد")}
              </button>
            )}

            <p className="flex items-start gap-2 px-1 text-body-sm leading-relaxed text-foreground/55">
              <FileText className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t(
                  "Reminders are delivered by the iPhone app; in the browser the appointment is saved on this device only.",
                  "التذكيرات يرسلها تطبيق iPhone؛ أما في المتصفح فيُحفظ الموعد على هذا الجهاز فقط.",
                )}
              </span>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
