import { useLocale } from "@/contexts/LocaleContext";
import { EventsCalendar } from "@/components/islamic/EventsCalendar";
import { PageShell } from "@/components/site/PageHeader";
import { SEO } from "@/components/SEO";

/** Dedicated Calendar screen (Services / Home → Calendar): month grid with
 * Hijri + Gregorian days, the selected day's appointments, upcoming
 * appointments and add / edit / delete — backed by lib/events and the shared
 * notification pipeline. */
export default function CalendarPage() {
  const { t, lang } = useLocale();
  return (
    <PageShell titleAr="المواعيد" titleEn="Appointments" fallback="/">
      <SEO
        title={t("Calendar & Appointments — Elite Islamic", "التقويم والمواعيد — النخبة الإسلامية")}
        description={t(
          "Hijri and Gregorian calendar with appointments, repeats and reminders.",
          "تقويم هجري وميلادي مع إضافة المواعيد والتكرار والتذكيرات.",
        )}
        path="/calendar"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <EventsCalendar hideHeading />
    </PageShell>
  );
}
