/**
 * Bridge to the native iOS document scanner (ios/App/App/DocumentScannerPlugin.swift).
 *
 * The whole flow runs natively: full-screen camera -> capture -> Vision rectangle detection on the
 * captured photo -> real corners -> "مسح" -> perspective correction + enhancement (Core Image).
 * JavaScript only asks for a page and receives the finished image. There is no web camera and no
 * JavaScript detection: outside the iPhone app the scanner is simply unavailable.
 */
import { registerPlugin } from "@capacitor/core";
import { isIOSNativeApp } from "@/lib/platform";

interface DocumentScannerPlugin {
  scan(options: { lang: string }): Promise<{ cancelled: boolean; image?: string; mimeType?: string; width?: number; height?: number }>;
  cancel(): Promise<void>;
}

export interface ScannedPage {
  /** data:image/jpeg;base64,... of the finished, flat, cropped page */
  dataUrl: string;
  width: number;
  height: number;
}

let plugin: DocumentScannerPlugin | null = null;
const getPlugin = () => (plugin ??= registerPlugin<DocumentScannerPlugin>("DocumentScanner"));

/** The scanner exists only inside the iPhone app. */
export const isScannerAvailable = (): boolean => isIOSNativeApp();

/** Opens the native scanner. Resolves with the page, or null when the user backed out. */
export async function scanDocument(lang: "ar" | "en"): Promise<ScannedPage | null> {
  if (!isScannerAvailable()) throw new Error("SCANNER_UNAVAILABLE");
  const result = await getPlugin().scan({ lang });
  if (result.cancelled || !result.image) return null;
  return {
    dataUrl: `data:${result.mimeType || "image/jpeg"};base64,${result.image}`,
    width: result.width ?? 0,
    height: result.height ?? 0,
  };
}

/** Closes the native scanner if it is open (e.g. the screen that started it is going away). */
export async function cancelScan(): Promise<void> {
  if (!isScannerAvailable()) return;
  try {
    await getPlugin().cancel();
  } catch {
    /* nothing open */
  }
}
