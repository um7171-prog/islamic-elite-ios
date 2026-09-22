/**
 * Central AdSense configuration.
 *
 * ⚠️ ضع هنا أرقام وحدات الإعلانات (data-ad-slot) من حساب AdSense.
 * كل رقم مكوّن من 10 خانات، مثال: "1234567890".
 * أي قيمة فارغة تبقي المكان غير مفعّل (لا يُعرض شيء، ولا يوجد Layout Shift).
 * لا تضع أرقامًا وهمية — AdSense سيرفض الطلبات ويحسبها أخطاء.
 */
export const ADSENSE_CLIENT = "ca-pub-7622141506694929";

/** 1) أداة تحويل الملفات */
const FILE_CONVERTER_RESULT_SLOT = "9054211553";

export const AD_SLOTS = {
  /** File converter — right after the conversion result appears. */
  fileConverterResult: FILE_CONVERTER_RESULT_SLOT,
} as const satisfies Record<string, string>;

export type AdSlotKey = keyof typeof AD_SLOTS;


/* ------------ User on/off switch (Settings) ------------ */
const ADS_ENABLED_KEY = "elite.ads.enabled.v1";
export const ADS_ENABLED_CHANGED_EVENT = "elite:ads-enabled-changed";

/** Default ON (matches the app's existing behaviour before this switch existed). */
export function isAdsEnabled(): boolean {
  try {
    const v = localStorage.getItem(ADS_ENABLED_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setAdsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ADS_ENABLED_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new CustomEvent(ADS_ENABLED_CHANGED_EVENT, { detail: { enabled } }));
  } catch {
    /* storage unavailable */
  }
}
