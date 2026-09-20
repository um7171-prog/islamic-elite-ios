import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  CountdownEvent, countdown, formatDate, formatGregorian, formatHijri, formatLastUpdated, formatWeekday,
  getPrivateSalaryDay, ISLAMIC_EVENTS, NATIONAL_EVENTS,
  nextGregorianDate, officialHolidays, PAYOUT_EVENTS, SCHOOL_COUNTDOWNS, setPrivateSalaryDay,
} from "@/lib/dailyTools";
import { Field, ResultCard, num, useLocalState } from "./ToolKit";

/** One-second ticking clock shared by every countdown surface. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

export function CountdownRow({
  event, now, detailed, onToggle,
}: { event: CountdownEvent; now: Date; detailed?: boolean; onToggle?: () => void }) {
  const { t, lang } = useLocale();
  const L = lang as "ar" | "en";
  const minuteKey = Math.floor(now.getTime() / 60000);
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  // Re-resolve whenever the calendar day flips (auto-refresh at midnight).
  useEffect(() => {
    const d = new Date().toDateString();
    if (d !== dayKey) setDayKey(d);
  }, [minuteKey, dayKey]);

  const target = useMemo(() => event.resolve(), [event, minuteKey, dayKey]);
  const after = useMemo(() => event.resolveAfter?.(), [event, minuteKey, dayKey]);
  const c = countdown(target, now);

  return (
    <div
      onClick={onToggle}
      className={cn(
        "rounded-2xl border border-border/60 bg-card/70 p-4 overflow-hidden",
        onToggle && "cursor-pointer active:scale-[0.99] transition",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold break-words">{lang === "ar" ? event.ar : event.en}</p>
          <p className="text-caption text-foreground/60 mt-0.5 break-words">
            {formatWeekday(target, L)} · {formatGregorian(target, L)}
          </p>
          <p className="text-caption text-foreground/45 break-words">{formatHijri(target, L)}</p>
          {event.note && <p className="text-caption text-primary/80 mt-1 leading-snug break-words">{lang === "ar" ? event.note.ar : event.note.en}</p>}
        </div>
        <div className="text-end shrink-0">
          <div className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: "hsl(var(--primary))" }}>
            {c.days}
          </div>
          <div className="text-caption text-foreground/55">{t("days", "يوم")}</div>
          <div className="text-caption font-semibold tabular-nums text-foreground/70 mt-1">
            {pad(c.hours)}:{pad(c.minutes)}:{pad(c.seconds)}
          </div>
        </div>
      </div>

      {detailed && (
        <>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              { v: c.days, l: t("Days", "يوم") },
              { v: c.hours, l: t("Hours", "ساعة") },
              { v: c.minutes, l: t("Minutes", "دقيقة") },
              { v: c.seconds, l: t("Seconds", "ثانية") },
            ].map((u) => (
              <div key={u.l} className="rounded-xl border border-border/50 bg-background/40 py-2 text-center">
                <div className="text-base font-extrabold tabular-nums leading-none">{u.v}</div>
                <div className="text-caption text-foreground/55 mt-1">{u.l}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 border-t border-border/50 pt-2.5">
            <div className="flex items-start justify-between gap-2 text-caption">
              <span className="text-foreground/55 shrink-0">{t("Day", "اليوم")}</span>
              <span className="font-semibold text-end break-words">{formatWeekday(target, L)}</span>
            </div>
            <div className="flex items-start justify-between gap-2 text-caption">
              <span className="text-foreground/55 shrink-0">{t("Gregorian date", "التاريخ الميلادي")}</span>
              <span className="font-semibold text-end break-words">{formatGregorian(target, L)}</span>
            </div>
            <div className="flex items-start justify-between gap-2 text-caption">
              <span className="text-foreground/55 shrink-0">{t("Hijri date", "التاريخ الهجري")}</span>
              <span className="font-semibold text-end break-words">{formatHijri(target, L)}</span>
            </div>
            {after && (
              <div className="flex items-start justify-between gap-2 text-caption">
                <span className="text-foreground/55 shrink-0">{t("Following date", "الموعد الذي يليه")}</span>
                <span className="font-semibold text-end break-words">{formatDate(after, L)}</span>
              </div>
            )}
          </div>
        </>
      )}

      <p className="mt-2 text-caption text-foreground/40 break-words">
        {t("Data last updated", "آخر تحديث للبيانات")}: {formatLastUpdated(L)}
      </p>
    </div>
  );
}

/** Lets the user set the day of month their private-sector salary is deposited. */
function PrivateSalarySetting() {
  const { t } = useLocale();
  const [day, setDay] = useState(() => getPrivateSalaryDay());
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-3">
      <Field label={t("My payday (day of month)", "يوم نزول راتبي (من الشهر الميلادي)")}>
        <Input
          type="number"
          min={1}
          max={31}
          value={day}
          onChange={(e) => {
            const v = Number(e.target.value);
            setDay(v);
            if (v >= 1 && v <= 31) setPrivateSalaryDay(v);
          }}
          className="h-11 bg-input/60"
        />
      </Field>
    </div>
  );
}

function EventList({ events }: { events: CountdownEvent[] }) {
  const now = useNow();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sorted = useMemo(
    () => [...events].sort((a, b) => a.resolve().getTime() - b.resolve().getTime()),
    [events, Math.floor(now.getTime() / 3600000)],
  );
  const hasPrivate = events.some((e) => e.id === "private-salary");
  return (
    <div className="space-y-2.5">
      {hasPrivate && <PrivateSalarySetting />}
      {sorted.map((e) => (
        <CountdownRow
          key={e.id}
          event={e}
          now={now}
          detailed={expandedId === e.id}
          onToggle={() => setExpandedId((id) => (id === e.id ? null : e.id))}
        />
      ))}
    </div>
  );
}

export function SingleCountdown({ id }: { id: string }) {
  const all = [...PAYOUT_EVENTS, ...SCHOOL_COUNTDOWNS, ...ISLAMIC_EVENTS, ...NATIONAL_EVENTS];
  const event = all.find((e) => e.id === id);
  const now = useNow();
  if (!event) return null;
  return (
    <div className="space-y-3">
      {id === "private-salary" && <PrivateSalarySetting />}
      <CountdownRow event={event} now={now} detailed />
    </div>
  );
}

export const PayoutCountdowns = () => <EventList events={PAYOUT_EVENTS} />;
export const SchoolCountdowns = () => <EventList events={SCHOOL_COUNTDOWNS} />;
export const IslamicCountdowns = () => <EventList events={ISLAMIC_EVENTS} />;
export const NationalCountdowns = () => <EventList events={NATIONAL_EVENTS} />;
export const OfficialHolidays = () => <EventList events={officialHolidays()} />;


/* ---------------- Retirement ---------------- */
export function RetirementCountdown() {
  const { t, lang } = useLocale();
  const now = useNow();
  const [birth, setBirth] = useLocalState("tool.retire.birth", "1985-01-01");
  const [age, setAge] = useLocalState("tool.retire.age", "60");

  const b = new Date(birth);
  const valid = !Number.isNaN(b.getTime());
  if (!valid) return null;
  const target = new Date(b.getFullYear() + num(age), b.getMonth(), b.getDate());
  const c = countdown(target, now);

  return (
    <div className="space-y-4">
      <Field label={t("Date of birth", "تاريخ الميلاد")}>
        <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className="h-11 bg-input/60" />
      </Field>
      <Field label={t("Retirement age", "سن التقاعد")}>
        <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} className="h-11 bg-input/60" />
      </Field>
      <ResultCard
        title={c.past ? t("Retirement reached", "تم بلوغ سن التقاعد") : t("Time to retirement", "المتبقي على التقاعد")}
        highlight={`${c.days} ${t("days", "يوم")} · ${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`}
        rows={[
          { label: t("Retirement date", "تاريخ التقاعد"), value: formatDate(target, lang as "ar" | "en") },
          { label: t("Hijri", "بالهجري"), value: formatHijri(target, lang as "ar" | "en") },
          { label: t("Years remaining", "السنوات المتبقية"), value: (c.days / 365.25).toFixed(1), strong: true },
        ]}
      />
    </div>
  );
}

/* ---------------- Custom date ---------------- */
export function CustomCountdown() {
  const { t, lang } = useLocale();
  const now = useNow();
  const [label, setLabel] = useLocalState("tool.custom.label", "");
  const [date, setDate] = useLocalState("tool.custom.date", nextGregorianDate(1, 1).toISOString().slice(0, 10));
  const [time, setTime] = useLocalState("tool.custom.time", "00:00");

  const target = new Date(`${date}T${time || "00:00"}:00`);
  const valid = !Number.isNaN(target.getTime());
  const c = valid ? countdown(target, now) : null;

  return (
    <div className="space-y-4">
      <Field label={t("Event name", "اسم المناسبة")}>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("My event", "مناسبتي")} className="h-11 bg-input/60" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Date", "التاريخ")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 bg-input/60" />
        </Field>
        <Field label={t("Time", "الوقت")}>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 bg-input/60" />
        </Field>
      </div>
      {c && (
        <ResultCard
          title={label || t("Countdown", "العد التنازلي")}
          highlight={`${c.days} ${t("days", "يوم")} · ${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`}
          rows={[
            { label: t("Target", "التاريخ المستهدف"), value: formatDate(target, lang as "ar" | "en") },
            { label: t("Hijri", "بالهجري"), value: formatHijri(target, lang as "ar" | "en") },
            { label: t("Status", "الحالة"), value: c.past ? t("Passed", "مضى") : t("Upcoming", "قادم"), strong: true },
          ]}
        />
      )}
    </div>
  );
}
