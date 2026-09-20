import { Bell, Check, MapPin } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useCity } from "@/contexts/CityContext";
import { usePrayerCalc, type MadhabId } from "@/contexts/PrayerCalcContext";
import { PRAYER_METHODS } from "@/lib/prayerMethods";
import { PageShell } from "@/components/site/PageHeader";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/site/SettingsUI";
import { SEO } from "@/components/SEO";

const MADHABS: { id: MadhabId; en: string; ar: string; note: { en: string; ar: string } }[] = [
  { id: "hanbali", en: "Hanbali", ar: "الحنبلي", note: { en: "Umm Al-Qura default", ar: "أم القرى (الافتراضي)" } },
  { id: "shafi", en: "Shafi'i", ar: "الشافعي", note: { en: "Standard Asr", ar: "العصر القياسي" } },
  { id: "maliki", en: "Maliki", ar: "المالكي", note: { en: "Standard Asr", ar: "العصر القياسي" } },
  { id: "hanafi", en: "Hanafi", ar: "الحنفي", note: { en: "Later Asr time", ar: "وقت العصر متأخر" } },
];

/** Prayer settings: the madhab (sets the Asr time) and the city used for the
 * calculation. Prayer times, the countdown and the scheduled alerts all follow
 * these immediately. */
export default function PrayerSettingsPage() {
  const { t, lang } = useLocale();
  const { city } = useCity();
  const { madhab, setMadhab, method, setMethod } = usePrayerCalc();

  return (
    <PageShell titleAr="إعدادات الصلاة" titleEn="Prayer Settings" fallback="/settings">
      <SEO
        title={t("Prayer Settings — Elite Islamic", "إعدادات الصلاة — النخبة الإسلامية")}
        description={t("Madhab and city for prayer times.", "المذهب والمدينة لمواقيت الصلاة.")}
        path="/prayer-settings"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-6">
        <SettingsSection
          id="p-madhab"
          title={t("Madhab", "المذهب")}
          footer={t("The madhab sets the Asr time. Prayer times update immediately.", "المذهب يحدد وقت العصر، وتتحدث المواقيت فوراً.")}
        >
          <SettingsGroup>
            {MADHABS.map((m) => (
              <SettingsRow key={m.id} label={t(m.en, m.ar)} description={t(m.note.en, m.note.ar)} onClick={() => setMadhab(m.id)}>
                <span className="grid h-6 w-6 place-items-center" aria-hidden>
                  {madhab === m.id && <Check className="h-5 w-5 text-primary" />}
                </span>
              </SettingsRow>
            ))}
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          id="p-method"
          title={t("Calculation Method", "طريقة الحساب")}
          footer={t("All methods listed are supported by the prayer-time engine.", "كل الطرق المعروضة مدعومة في محرك حساب المواقيت.")}
        >
          <SettingsGroup>
            {PRAYER_METHODS.map((m) => (
              <SettingsRow key={m.id} label={t(m.en, m.ar)} onClick={() => setMethod(m.id)}>
                <span className="grid h-6 w-6 place-items-center" aria-hidden data-method={m.id}>
                  {method === m.id && <Check className="h-5 w-5 text-primary" />}
                </span>
              </SettingsRow>
            ))}
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection id="p-city" title={t("City", "المدينة")}>
          <SettingsGroup>
            <SettingsRow icon={MapPin} to="/location" label={t("Location", "الموقع")} value={lang === "ar" ? city.ar : city.en} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection id="p-alerts" title={t("Alerts", "التنبيهات")}>
          <SettingsGroup>
            <SettingsRow icon={Bell} to="/notification-settings#n-prayer" label={t("Prayer notifications & Athan", "إشعارات الصلاة والأذان")} />
          </SettingsGroup>
        </SettingsSection>
      </div>
    </PageShell>
  );
}
