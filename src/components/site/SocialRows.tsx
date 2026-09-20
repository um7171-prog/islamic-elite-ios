import { Instagram } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { SettingsGroup, SettingsRow } from "@/components/site/SettingsUI";
import { SOCIAL_LINKS, type SocialLinks } from "@/lib/social";

/** TikTok glyph (lucide has no brand icon for it). */
export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden focusable="false">
      <path d="M16.6 3c.3 2.4 1.7 4 4 4.2v3.2a7.4 7.4 0 0 1-4-1.2v6.2a6 6 0 1 1-6-6c.3 0 .6 0 .9.1v3.3a2.8 2.8 0 1 0 1.9 2.6V3h3.2z" />
    </svg>
  );
}

/**
 * TikTok + Instagram rows. They open the official account links from
 * `SOCIAL_LINKS` (env-provided; never made up). While a link has not been
 * provided the row is shown as "coming soon" and does nothing.
 */
export function SocialRows({ links = SOCIAL_LINKS }: { links?: SocialLinks }) {
  const { t } = useLocale();
  const soon = t("Coming soon", "قريباً");
  return (
    <SettingsGroup>
      <SettingsRow
        icon={TikTokIcon}
        label={t("TikTok", "تيك توك")}
        href={links.tiktok || undefined}
        description={links.tiktok ? undefined : soon}
        data-social="tiktok"
      />
      <SettingsRow
        icon={Instagram}
        label={t("Instagram", "إنستغرام")}
        href={links.instagram || undefined}
        description={links.instagram ? undefined : soon}
        data-social="instagram"
      />
    </SettingsGroup>
  );
}
