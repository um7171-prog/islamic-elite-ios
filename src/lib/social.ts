/**
 * Official social accounts. The URLs are NOT invented: they come from build-time
 * env vars (VITE_SOCIAL_TIKTOK_URL / VITE_SOCIAL_INSTAGRAM_URL). Until the real
 * account links are provided the Settings rows show as "coming soon" and open
 * nothing — the user is never sent to a made-up address.
 */
const clean = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https:\/\/[^\s]+$/i.test(s) ? s : "";
};

export const SOCIAL_LINKS = {
  tiktok: clean(import.meta.env?.VITE_SOCIAL_TIKTOK_URL),
  instagram: clean(import.meta.env?.VITE_SOCIAL_INSTAGRAM_URL),
} as const;

export type SocialLinks = { tiktok: string; instagram: string };
