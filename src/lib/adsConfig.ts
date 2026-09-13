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

