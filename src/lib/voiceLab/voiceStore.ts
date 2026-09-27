import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { isNativeApp } from "@/lib/platform";
import { NOTIFICATION_RANGES, cancelGroup, pendingIds, replaceGroup } from "@/lib/notifications/NotificationScheduler";
import { NOTIFICATION_CLIP_RATE, NOTIFICATION_CLIP_SECONDS, type PrototypeVoice } from "./prototypeVoice";
import { describeWav, encodeWavPcm16, makeNotificationClip } from "./wav";

/**
 * Voice Lab storage (prototype, one voice). Two files per voice, never mixed up:
 *
 *   FULL  → Directory.LibraryNoCloud  voice-lab/<id>.mp3
 *           the whole recording, played in-app; excluded from iCloud backup (re-downloadable)
 *   SHORT → Directory.Library         Sounds/<id>-notify.wav
 *           ≤ 29 s clip; iOS looks up UNNotificationSound(named:) in the app bundle and then in
 *           <container>/Library/Sounds, so ONLY this file can ever be a notification sound
 *
 * Nothing here touches the prayer / pre-adhan / night / appointment / athkar notifications. The
 * test notification goes through NotificationScheduler like every other notification, in its own
 * "lab" group (ids 49000–49009, cap 1), so it can never replace or cancel a real one and the caps
 * still sum to iOS's 64-pending limit.
 */

export const FULL_DIR = Directory.LibraryNoCloud;
export const SHORT_DIR = Directory.Library;
export const fullPath = (v: PrototypeVoice) => `voice-lab/${v.id}.mp3`;
export const shortFileName = (v: PrototypeVoice) => `${v.id}-notify.wav`;
export const shortPath = (v: PrototypeVoice) => `Sounds/${shortFileName(v)}`;

export interface DecodedAudio {
  channels: Float32Array[];
  sampleRate: number;
}
export type Decoder = (bytes: ArrayBuffer) => Promise<DecodedAudio>;

/** Web Audio decode (WKWebView supports MP3). */
export const webAudioDecoder: Decoder = async (bytes) => {
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
  if (!Ctx) throw new Error("Web Audio is not available");
  const ctx = new Ctx();
  try {
    const buf = await new Promise<AudioBuffer>((resolve, reject) => ctx.decodeAudioData(bytes.slice(0), resolve, reject));
    return { channels: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), sampleRate: buf.sampleRate };
  } finally {
    void ctx.close?.();
  }
};

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes.slice());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function statSize(directory: Directory, path: string): Promise<number | null> {
  try {
    const s = await Filesystem.stat({ directory, path });
    return typeof s.size === "number" ? s.size : null;
  } catch {
    return null;
  }
}

export interface VoiceStatus {
  fullBytes: number | null;
  shortBytes: number | null;
}

export async function voiceStatus(v: PrototypeVoice): Promise<VoiceStatus> {
  const [fullBytes, shortBytes] = await Promise.all([statSize(FULL_DIR, fullPath(v)), statSize(SHORT_DIR, shortPath(v))]);
  return { fullBytes, shortBytes };
}

export interface DownloadResult {
  fullBytes: number;
  shortBytes: number;
  shortSeconds: number;
  shortSampleRate: number;
}

/**
 * Downloads the full recording (with progress), verifies its SHA-1, saves it, then builds the
 * ≤ 29 s WAV clip on the device and saves it to Library/Sounds. On any failure nothing is kept.
 */
export async function downloadVoice(
  v: PrototypeVoice,
  onProgress: (fraction: number) => void = () => undefined,
  decode: Decoder = webAudioDecoder,
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadResult> {
  const res = await fetchImpl(v.sourceUrl);
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length")) || v.sizeBytes;
  let bytes: Uint8Array;
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      onProgress(Math.min(0.99, got / total));
    }
    bytes = new Uint8Array(got);
    let off = 0;
    for (const p of parts) { bytes.set(p, off); off += p.length; }
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
  }

  const hash = await sha1Hex(bytes);
  if (hash !== v.sha1) throw new Error("integrity check failed (SHA-1 mismatch) — file not saved");

  const decoded = await decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const clip = makeNotificationClip(decoded.channels, decoded.sampleRate, NOTIFICATION_CLIP_SECONDS, NOTIFICATION_CLIP_RATE);
  const wav = encodeWavPcm16(clip, NOTIFICATION_CLIP_RATE);
  const info = describeWav(wav);
  if (info.seconds > 30) throw new Error("clip longer than 30 s — refused");

  try {
    await Filesystem.writeFile({ directory: FULL_DIR, path: fullPath(v), data: toBase64(bytes), recursive: true });
    await Filesystem.writeFile({ directory: SHORT_DIR, path: shortPath(v), data: toBase64(wav), recursive: true });
  } catch (e) {
    await deleteVoice(v);
    throw e;
  }
  onProgress(1);
  return { fullBytes: bytes.length, shortBytes: wav.length, shortSeconds: info.seconds, shortSampleRate: info.sampleRate };
}

export async function deleteVoice(v: PrototypeVoice): Promise<void> {
  for (const [directory, path] of [[FULL_DIR, fullPath(v)], [SHORT_DIR, shortPath(v)]] as const) {
    try { await Filesystem.deleteFile({ directory, path }); } catch { /* already gone */ }
  }
}

/** A URL an <audio> element can play for a stored file (native: capacitor file URL; web: blob URL). */
export async function localPlayableUrl(directory: Directory, path: string, mime: string): Promise<string> {
  if (isNativeApp()) {
    const { uri } = await Filesystem.getUri({ directory, path });
    return Capacitor.convertFileSrc(uri);
  }
  const { data } = await Filesystem.readFile({ directory, path });
  if (typeof data !== "string") return URL.createObjectURL(data);
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: mime }));
}

/* ---------------- test notification (through the scheduler's "lab" group) ---------------- */

export const LAB_TEST_NOTIFICATION_ID = NOTIFICATION_RANGES.lab.min;

export type LabTestResult =
  | { ok: true; at: Date; sound: string }
  | { ok: false; reason: "not-native" | "permission-denied" | "no-clip" | "not-kept" | "error"; detail?: string };

/**
 * Schedules ONE test notification `inSeconds` from now whose sound is the short clip's file name
 * (`<id>-notify.wav`, looked up by iOS in Library/Sounds) — never the full recording.
 */
export async function scheduleLabTestNotification(v: PrototypeVoice, inSeconds = 20): Promise<LabTestResult> {
  if (!isNativeApp()) return { ok: false, reason: "not-native" };
  if ((await statSize(SHORT_DIR, shortPath(v))) == null) return { ok: false, reason: "no-clip" };
  const at = new Date(Date.now() + inSeconds * 1000);
  const sound = shortFileName(v);
  const res = await replaceGroup("lab", [{
    id: LAB_TEST_NOTIFICATION_ID,
    title: "اختبار صوت الإشعار (مختبر)",
    body: `${v.nameAr} — مقطع ${NOTIFICATION_CLIP_SECONDS} ثانية`,
    at,
    sound,
    extra: { kind: "voice-lab", route: "/labs/voice" },
  }]);
  if (res.reason === "not-native") return { ok: false, reason: "not-native" };
  if (res.reason === "permission-denied") return { ok: false, reason: "permission-denied" };
  if (res.verifiedIds.includes(LAB_TEST_NOTIFICATION_ID)) return { ok: true, at, sound };
  if (res.errors.length) return { ok: false, reason: "error", detail: res.errors.join("; ") };
  return { ok: false, reason: "not-kept" };
}

/** Removes the lab test notification (only the lab group; nothing else is touched). */
export async function cancelLabTestNotification(): Promise<void> {
  await cancelGroup("lab");
}

/** Whether a lab test notification is currently pending in iOS. */
export async function isLabTestPending(): Promise<boolean> {
  return (await pendingIds("lab")).length > 0;
}
