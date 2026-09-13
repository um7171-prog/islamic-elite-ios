import { isIOSNativeApp } from "@/lib/platform";

const KEY = "elite.ios.external-ai-consent.v1";

/**
 * Apple-facing disclosure for data sent to external AI processing.
 * Web behavior is unchanged; the installed iOS app asks once before the first send.
 */
export function ensureExternalAIConsent(lang: "ar" | "en"): boolean {
  if (!isIOSNativeApp()) return true;
  try {
    if (localStorage.getItem(KEY) === "1") return true;
  } catch {
    // Continue to the disclosure if storage is unavailable.
  }

  const message = lang === "ar"
    ? "لإتمام هذه العملية، سيتم إرسال النص أو الصورة التي تختارها إلى خادمنا ثم إلى مزود ذكاء اصطناعي خارجي (Google Gemini عبر Lovable AI Gateway) لمعالجتها. لن يتم الإرسال إلا بعد موافقتك. هل توافق؟"
    : "To complete this action, the text or image you choose will be sent to our server and then to an external AI provider (Google Gemini through Lovable AI Gateway) for processing. Nothing is sent until you consent. Do you agree?";

  const accepted = window.confirm(message);
  if (accepted) {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
  }
  return accepted;
}
