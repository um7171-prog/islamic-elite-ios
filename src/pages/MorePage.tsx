import { Bell, LayoutGrid, Mail, Settings as SettingsIcon, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/site/SettingsUI";
import { SocialRows } from "@/components/site/SocialRows";
import { SEO } from "@/components/SEO";

const APP_URL = "https://www.techsnds.com";

/** Share the app: the native/Web Share sheet when available, otherwise copy the link. */
export async function shareApp(t: (en: string, ar: string) => string) {
  const data = {
    title: t("Islamic Elite", "النخبة الإسلامية"),
    text: t("Prayer times, Quran, Athkar and more.", "مواقيت الصلاة والقرآن والأذكار وأكثر."),
    url: APP_URL,
  };
  try {
    if (navigator.share) {
      await navigator.share(data);
      return;
    }
    await navigator.clipboard.writeText(APP_URL);
    toast.success(t("Link copied", "تم نسخ الرابط"));
  } catch (e) {
    // Dismissing the share sheet is not an error.
    if ((e as Error)?.name !== "AbortError") toast.error(t("Couldn't share", "تعذّرت المشاركة"));
  }
}

/** More: everything that doesn't need its own tab — all services, notification
 * center, share the app, contact us, social accounts and settings. */
export default function MorePage() {
  const { t, lang } = useLocale();
  return (
    <PageShell titleAr="المزيد" titleEn="More" fallback="/">
      <SEO
        title={t("More — Elite Islamic", "المزيد — النخبة الإسلامية")}
        description={t("All services, sharing, contact and social accounts.", "كل الخدمات والمشاركة والتواصل وحسابات التواصل الاجتماعي.")}
        path="/more"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-6">
        <SettingsSection id="more-explore" title={t("Explore", "استكشف")}>
          <SettingsGroup>
            <SettingsRow icon={LayoutGrid} to="/tools" label={t("All Services", "كل الخدمات")} />
            <SettingsRow icon={Bell} to="/notifications" label={t("Notification Center", "مركز الإشعارات")} />
            <SettingsRow icon={SettingsIcon} to="/settings" label={t("Settings", "الإعدادات")} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection id="more-share" title={t("Share & Contact", "المشاركة والتواصل")}>
          <SettingsGroup>
            <SettingsRow icon={Share2} onClick={() => void shareApp(t)} label={t("Share App", "مشاركة التطبيق")} data-more="share" />
            <SettingsRow icon={Mail} to="/contact" label={t("Contact Us", "تواصل معنا")} data-more="contact" />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection id="more-social" title={t("Social Media", "مواقع التواصل")}>
          <SocialRows />
        </SettingsSection>
      </div>
    </PageShell>
  );
}
