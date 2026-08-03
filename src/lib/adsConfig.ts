/**
 * Central AdSense configuration.
 *
 * ⚠️ ضع هنا أرقام وحدات الإعلانات (data-ad-slot) من حساب AdSense.
 * كل رقم مكوّن من 10 خانات، مثال: "1234567890".
 * أي قيمة فارغة تبقي المكان غير مفعّل (لا يُعرض شيء، ولا يوجد Layout Shift).
 * لا تضع أرقامًا وهمية — AdSense سيرفض الطلبات ويحسبها أخطاء.
 */
export const ADSENSE_CLIENT = "ca-pub-7622141506694929";

/** 1) أداة تحليل TikTok */
const TIKTOK_ANALYZER_RESULTS_SLOT = "3443772162";
const TIKTOK_ANALYZER_FOOTER_SLOT = "3443772162";

/** 2) أداة تحميل TikTok */
const TIKTOK_DOWNLOAD_INFO_SLOT = "5878363810";
const TIKTOK_DOWNLOAD_DONE_SLOT = "5878363810";

/** 3) أداة تحميل YouTube */
const YOUTUBE_DOWNLOAD_INFO_SLOT = "5306538238";

/** 4) أداة تحويل الملفات */
const FILE_CONVERTER_RESULT_SLOT = "9054211553";

export const AD_SLOTS = {
  /** TikTok analyzer — banner directly below the "Start analysis" button. */
  tiktokAnalyzerCta: TIKTOK_ANALYZER_RESULTS_SLOT,
  /** TikTok analyzer — interstitial shown before the results appear. */
  tiktokAnalyzerInterstitial: TIKTOK_ANALYZER_FOOTER_SLOT,
  /** TikTok analyzer — directly below the results block. */
  tiktokAnalyzerResults: TIKTOK_ANALYZER_RESULTS_SLOT,
  /** TikTok analyzer — end of page, after the action buttons. */
  tiktokAnalyzerFooter: TIKTOK_ANALYZER_FOOTER_SLOT,
  /** TikTok downloader — banner below the link input box. */
  tiktokDownloadInput: TIKTOK_DOWNLOAD_INFO_SLOT,
  /** TikTok downloader — interstitial before the download link is produced. */
  tiktokDownloadInterstitial: TIKTOK_DOWNLOAD_DONE_SLOT,
  /** TikTok downloader — after video info, before the download button. */
  tiktokDownloadInfo: TIKTOK_DOWNLOAD_INFO_SLOT,
  /** TikTok downloader — end of page, after a download completes. */
  tiktokDownloadDone: TIKTOK_DOWNLOAD_DONE_SLOT,
  /** YouTube downloader — banner below the link input box. */
  youtubeDownloadInput: YOUTUBE_DOWNLOAD_INFO_SLOT,
  /** YouTube downloader — interstitial before the download link is produced. */
  youtubeDownloadInterstitial: YOUTUBE_DOWNLOAD_INFO_SLOT,
  /** YouTube downloader — after video info + qualities appear. */
  youtubeDownloadInfo: YOUTUBE_DOWNLOAD_INFO_SLOT,
  /** File converter — right after the conversion result appears. */
  fileConverterResult: FILE_CONVERTER_RESULT_SLOT,
} as const satisfies Record<string, string>;

export type AdSlotKey = keyof typeof AD_SLOTS;

