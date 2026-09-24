import { useState, type ElementType } from "react";
import {
  BatteryCharging, BookMarked, BookOpen, Briefcase, BriefcaseMedical, Cake, CalendarDays, Car, ChevronDown, CircleAlert,
  Coffee, Cpu, Dumbbell, Gauge, GraduationCap, Hospital, House, Landmark, Laptop, Luggage, MoonStar, NotebookPen,
  PartyPopper, PawPrint, Phone, Pill, Plane, Presentation, Receipt, Scissors, ShoppingCart, Smartphone, Sparkles,
  SprayCan, Star, Stethoscope, Trophy, Truck, User, Users, UtensilsCrossed, Volleyball, Wrench, Banknote, HeartPulse,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";
import type { CalEvent } from "@/lib/events";

/** One icon an appointment can show (all Lucide, same stroke and size). */
interface EventIconDef {
  id: string;
  Icon: ElementType;
  ar: string;
  en: string;
}

/** The default, general-purpose appointment icon. */
export const DEFAULT_EVENT_ICON = "general";

/** The library, in small groups so picking stays easy. Ids are stored with the appointment. The
 * four category ids (general / work / personal / health) keep the exact icons categories always
 * had, so an older appointment (no icon of its own) looks the same after it is edited. */
export const EVENT_ICON_GROUPS: { ar: string; en: string; icons: EventIconDef[] }[] = [
  {
    ar: "عام", en: "General",
    icons: [
      { id: "general", Icon: CalendarDays, ar: "عام", en: "General" },
      { id: "important", Icon: CircleAlert, ar: "مهم", en: "Important" },
      { id: "favorite", Icon: Star, ar: "مفضل", en: "Favorite" },
      { id: "personal", Icon: User, ar: "شخصي", en: "Personal" },
    ],
  },
  {
    ar: "الصحة", en: "Health",
    icons: [
      { id: "health", Icon: HeartPulse, ar: "صحي", en: "Health" },
      { id: "hospital", Icon: Hospital, ar: "مستشفى", en: "Hospital" },
      { id: "doctor", Icon: Stethoscope, ar: "طبيب", en: "Doctor" },
      { id: "pharmacy", Icon: BriefcaseMedical, ar: "صيدلية", en: "Pharmacy" },
      { id: "medicine", Icon: Pill, ar: "دواء", en: "Medicine" },
    ],
  },
  {
    ar: "الرياضة", en: "Sport",
    icons: [
      { id: "sport", Icon: Dumbbell, ar: "رياضة", en: "Sport" },
      { id: "football", Icon: Volleyball, ar: "كرة قدم", en: "Football" },
      { id: "club", Icon: Trophy, ar: "نادي", en: "Club" },
    ],
  },
  {
    ar: "الطعام", en: "Food",
    icons: [
      { id: "restaurant", Icon: UtensilsCrossed, ar: "مطعم", en: "Restaurant" },
      { id: "coffee", Icon: Coffee, ar: "قهوة", en: "Coffee" },
    ],
  },
  {
    ar: "السفر والتنقل", en: "Travel",
    icons: [
      { id: "travel", Icon: Luggage, ar: "سفر", en: "Travel" },
      { id: "plane", Icon: Plane, ar: "طائرة", en: "Flight" },
      { id: "car", Icon: Car, ar: "سيارة", en: "Car" },
      { id: "car-service", Icon: Gauge, ar: "صيانة سيارة", en: "Car service" },
    ],
  },
  {
    ar: "البيت والعمل", en: "Home & work",
    icons: [
      { id: "home", Icon: House, ar: "منزل", en: "Home" },
      { id: "work", Icon: Briefcase, ar: "عمل", en: "Work" },
      { id: "meeting", Icon: Presentation, ar: "اجتماع", en: "Meeting" },
      { id: "cleaning", Icon: SprayCan, ar: "تنظيف", en: "Cleaning" },
      { id: "maintenance", Icon: Wrench, ar: "صيانة", en: "Maintenance" },
    ],
  },
  {
    ar: "التعليم", en: "Study",
    icons: [
      { id: "study", Icon: BookOpen, ar: "دراسة", en: "Study" },
      { id: "university", Icon: GraduationCap, ar: "جامعة", en: "University" },
      { id: "lesson", Icon: NotebookPen, ar: "درس", en: "Lesson" },
    ],
  },
  {
    ar: "المال والتسوق", en: "Money & shopping",
    icons: [
      { id: "shopping", Icon: ShoppingCart, ar: "تسوق", en: "Shopping" },
      { id: "bank", Icon: Landmark, ar: "بنك", en: "Bank" },
      { id: "money", Icon: Banknote, ar: "مال", en: "Money" },
      { id: "bill", Icon: Receipt, ar: "فاتورة", en: "Bill" },
    ],
  },
  {
    ar: "المناسبات والتواصل", en: "Occasions & people",
    icons: [
      { id: "birthday", Icon: Cake, ar: "عيد ميلاد", en: "Birthday" },
      { id: "occasion", Icon: PartyPopper, ar: "مناسبة", en: "Occasion" },
      { id: "call", Icon: Phone, ar: "اتصال", en: "Call" },
      { id: "family", Icon: Users, ar: "عائلة", en: "Family" },
    ],
  },
  {
    ar: "العبادة", en: "Worship",
    icons: [
      { id: "mosque", Icon: MoonStar, ar: "مسجد", en: "Mosque" },
      { id: "quran", Icon: BookMarked, ar: "قرآن", en: "Quran" },
    ],
  },
  {
    ar: "العناية الشخصية", en: "Personal care",
    icons: [
      { id: "barber", Icon: Scissors, ar: "حلاق", en: "Barber" },
      { id: "salon", Icon: Sparkles, ar: "صالون", en: "Salon" },
    ],
  },
  {
    ar: "التقنية والخدمات", en: "Tech & services",
    icons: [
      { id: "computer", Icon: Laptop, ar: "كمبيوتر", en: "Computer" },
      { id: "tech", Icon: Cpu, ar: "تقنية", en: "Tech" },
      { id: "mobile", Icon: Smartphone, ar: "جوال", en: "Mobile" },
      { id: "charging", Icon: BatteryCharging, ar: "شحن", en: "Charging" },
      { id: "delivery", Icon: Truck, ar: "توصيل", en: "Delivery" },
      { id: "pets", Icon: PawPrint, ar: "حيوانات أليفة", en: "Pets" },
    ],
  },
];

const BY_ID = new Map(EVENT_ICON_GROUPS.flatMap((g) => g.icons).map((i) => [i.id, i]));

export function eventIconDef(id: string | undefined): EventIconDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** The icon an appointment shows: its chosen icon, else its category's icon (older appointments). */
export function eventIconFor(e: Pick<CalEvent, "icon">, categoryIcon: ElementType): ElementType {
  return eventIconDef(e.icon)?.Icon ?? categoryIcon;
}

/** Form row: shows the current icon; its grid opens on tap only (no clutter in the form). */
export function EventIconPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t, lang } = useLocale();
  const [open, setOpen] = useState(false);
  const current = eventIconDef(value) ?? eventIconDef(DEFAULT_EVENT_ICON)!;
  const CurrentIcon = current.Icon;
  return (
    <div data-testid="event-icon-picker">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="event-icon-toggle"
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-start"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <CurrentIcon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1 text-body font-medium">{t("Icon", "الأيقونة")}</span>
        <span className="shrink-0 text-body-sm text-foreground/60">{lang === "ar" ? current.ar : current.en}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-foreground/40 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="max-h-[46vh] space-y-3 overflow-y-auto border-t border-foreground/[0.07] px-3 pb-3 pt-2">
          {EVENT_ICON_GROUPS.map((g) => (
            <div key={g.en}>
              <div className="px-1 pb-1.5 text-caption font-semibold text-foreground/55">{lang === "ar" ? g.ar : g.en}</div>
              <div className="grid grid-cols-4 gap-2 min-[400px]:grid-cols-5" role="radiogroup" aria-label={lang === "ar" ? g.ar : g.en}>
                {g.icons.map((i) => {
                  const active = i.id === current.id;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-icon={i.id}
                      onClick={() => { onChange(i.id); setOpen(false); }}
                      className={cn(
                        "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 transition",
                        active ? "border-primary bg-primary/12 text-primary" : "border-foreground/10 text-foreground/75 active:bg-foreground/[0.04]",
                      )}
                    >
                      <i.Icon className="h-5 w-5" />
                      <span className="w-full truncate text-center text-[11px] leading-tight">{lang === "ar" ? i.ar : i.en}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
