import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  ATHAN_SOUNDS, NIGHT_SOUND_FILE, PRE_PRAYER_SOUND_FILE, REMINDER_SOUNDS, athanNativeSound, nightNativeSound,
  preprayerNativeSound, reminderNativeSound,
} from "@/lib/notifications/NotificationSounds";

/* ---------- a CAF reader and an ITU-R BS.1770 loudness meter (mono) ---------- */

interface Caf {
  sampleRate: number;
  format: string;
  channels: number;
  bits: number;
  samples: Float64Array;
}

function readCaf(path: string): Caf {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 4).toString("latin1"), path).toBe("caff");
  let pos = 8;
  let desc: Omit<Caf, "samples"> & { flags: number } | null = null;
  let data: Buffer | null = null;
  while (pos + 12 <= buf.length) {
    const type = buf.subarray(pos, pos + 4).toString("latin1");
    const size = Number(buf.readBigInt64BE(pos + 4));
    const end = size === -1 ? buf.length : pos + 12 + size;
    const body = buf.subarray(pos + 12, end);
    if (type === "desc") {
      desc = {
        sampleRate: body.readDoubleBE(0),
        format: body.subarray(8, 12).toString("latin1"),
        flags: body.readUInt32BE(12),
        channels: body.readUInt32BE(24),
        bits: body.readUInt32BE(28),
      };
    } else if (type === "data") data = body.subarray(4); // 4-byte edit count
    pos = end;
  }
  if (!desc || !data) throw new Error(`${path}: no desc/data chunk`);
  const little = (desc.flags & 2) !== 0;
  const samples = new Float64Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = (little ? data.readInt16LE(i * 2) : data.readInt16BE(i * 2)) / 32768;
  return { ...desc, samples };
}

/** RBJ biquad (the K-weighting stages used by pyloudnorm / BS.1770). */
function biquad(kind: "shelf" | "highpass" | "lowpass", gainDb: number, q: number, fc: number, fs: number) {
  const A = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * fc) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b: number[];
  let a: number[];
  if (kind === "shelf") {
    const s = 2 * Math.sqrt(A) * alpha;
    b = [A * ((A + 1) + (A - 1) * cos + s), -2 * A * ((A - 1) + (A + 1) * cos), A * ((A + 1) + (A - 1) * cos - s)];
    a = [(A + 1) - (A - 1) * cos + s, 2 * ((A - 1) - (A + 1) * cos), (A + 1) - (A - 1) * cos - s];
  } else if (kind === "lowpass") {
    b = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    a = [1 + alpha, -2 * cos, 1 - alpha];
  } else {
    b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    a = [1 + alpha, -2 * cos, 1 - alpha];
  }
  return (x: Float64Array) => {
    const y = new Float64Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = (b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2) / a[0];
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
      y[i] = v;
    }
    return y;
  };
}

/** Integrated loudness (LUFS), gated as in BS.1770-4. Sounds shorter than one 400 ms block are
 * measured inside 0.5 s of silence (as the mastering did). */
function lufs(x: Float64Array, fs: number): number {
  let s = x;
  if (s.length < 0.5 * fs) {
    s = new Float64Array(Math.ceil(0.5 * fs));
    s.set(x);
  }
  const k = biquad("highpass", 0, 0.5, 38, fs)(biquad("shelf", 4, 1 / Math.SQRT2, 1500, fs)(s));
  const T = 0.4;
  const step = 0.25;
  const blocks = Math.round((k.length / fs - T) / (T * step)) + 1;
  const z: number[] = [];
  for (let j = 0; j < blocks; j++) {
    const lo = Math.floor(T * j * step * fs);
    const hi = Math.floor(T * (j * step + 1) * fs);
    let sum = 0;
    for (let i = lo; i < hi && i < k.length; i++) sum += k[i] * k[i];
    z.push(sum / (T * fs));
  }
  const l = (v: number) => -0.691 + 10 * Math.log10(v);
  const abs = z.filter((v) => l(v) >= -70);
  const rel = l(abs.reduce((p, v) => p + v, 0) / abs.length) - 10;
  const gated = z.filter((v) => l(v) > rel && l(v) >= -70);
  return l(gated.reduce((p, v) => p + v, 0) / gated.length);
}

const peakDb = (x: Float64Array) => 20 * Math.log10(x.reduce((m, v) => Math.max(m, Math.abs(v)), 0));

/** A phone speaker, roughly (as in scripts/master-notification-sounds.py): a 4th-order 400 Hz
 * high-pass (two Butterworth sections) and a 10 kHz low-pass. */
const speaker = (x: Float64Array, fs: number) => {
  let y = biquad("highpass", 0, 0.5412, 400, fs)(biquad("highpass", 0, 1.3066, 400, fs)(x));
  if (fs > 22000) y = biquad("lowpass", 0, Math.SQRT1_2, 10000, fs)(y);
  return y;
};
const lufsSpk = (x: Float64Array, fs: number) => lufs(speaker(x, fs), fs);

/** Loudest 400 ms through the speaker (K-weighted mean square, ungated). */
function momentaryMaxSpk(x: Float64Array, fs: number): number {
  const k = biquad("highpass", 0, 0.5, 38, fs)(biquad("shelf", 4, 1 / Math.SQRT2, 1500, fs)(speaker(x, fs)));
  const w = Math.floor(0.4 * fs);
  const hop = Math.floor(0.05 * fs);
  let best = -Infinity;
  for (let lo = 0; lo + w <= k.length; lo += hop) {
    let sum = 0;
    for (let i = lo; i < lo + w; i++) sum += k[i] * k[i];
    best = Math.max(best, -0.691 + 10 * Math.log10(sum / w));
  }
  return best;
}

/** The silent gap between the tone and «استغفر الله» (< -50 dBFS between 0.8 and 2.5 s). */
function toneVoiceGap(x: Float64Array, fs: number): number | null {
  if (x.length < 2.6 * fs) return null; // too short to hold a tone, a gap and a phrase
  const w = Math.floor(0.02 * fs);
  let best = -1;
  let bestE = Infinity;
  for (let c = Math.floor(0.8 * fs); c < Math.min(x.length - w, Math.floor(2.5 * fs)); c += Math.floor(w / 4)) {
    let e = 0;
    for (let i = c - w / 2; i < c + w / 2; i++) e += x[Math.floor(i)] ** 2;
    if (e / w < bestE) {
      bestE = e / w;
      best = c;
    }
  }
  return best > 0 && 10 * Math.log10(bestE + 1e-20) <= -50 ? best : null;
}
const leadingSilence = (c: Caf) => {
  const thr = 10 ** (-50 / 20);
  const i = c.samples.findIndex((v) => Math.abs(v) > thr);
  return i / c.sampleRate;
};

const APP = "ios/App/App";
const PBXPROJ = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");

/** Through the phone-speaker model (LUFS-spk), as measured by scripts/master-notification-sounds.py
 * (scripts/master-notification-sounds.report.json): what the files they replace (v1) reached, and
 * the floor each v2 must keep (0.3 LU under what its mastering reached). */
const V1_LUFS_SPK: Record<string, number> = {
  "pre_athan_alert_v2.caf": -14.74, "athan_makkah_v2.caf": -9.05, "athan_madinah_v2.caf": -10.72, "athan_fajr_v2.caf": -10.43,
  "athan_ibn_majid_v2.caf": -8.23, "astaghfirullah_night_v2.caf": -15.08, "notif_chime_v2.caf": -14.63, "notif_bell_v2.caf": -15.78,
  "notif_alert_v2.caf": -21.48, "notif_calm_v2.caf": -14.52,
};
const MIN_LUFS_SPK: Record<string, number> = {
  "pre_athan_alert_v2.caf": -13.7, "athan_makkah_v2.caf": -8.6, "athan_madinah_v2.caf": -10.2, "athan_fajr_v2.caf": -9.6,
  "athan_ibn_majid_v2.caf": -8.4, "astaghfirullah_night_v2.caf": -14.9, "notif_chime_v2.caf": -10.7, "notif_bell_v2.caf": -13.8,
  "notif_alert_v2.caf": -21.8, "notif_calm_v2.caf": -13.5,
};

const OLD_NAMES = [
  "pre_athan_alert.caf", "astaghfirullah_night.caf", "athan_makkah.caf", "athan_madinah.caf", "athan_fajr.caf", "athan_ibn_majid.caf",
  "notif_chime.caf", "notif_bell.caf", "notif_alert.caf", "notif_calm.caf",
];

const NOTIFICATION_FILES = [
  ...ATHAN_SOUNDS.flatMap((s) => (s.nativeFile ? [s.nativeFile] : [])),
  ...REMINDER_SOUNDS.map((s) => s.nativeFile),
  PRE_PRAYER_SOUND_FILE,
  NIGHT_SOUND_FILE,
];

describe("the loudness meter itself (calibration)", () => {
  it("reads the BS.1770 reference: a 997 Hz sine of amplitude A is 20·log10(A) − 3.01 LUFS", () => {
    for (const [fs, amp] of [[44100, 0.1], [22050, 0.5]] as const) {
      const x = new Float64Array(fs * 3).map((_, i) => amp * Math.sin((2 * Math.PI * 997 * i) / fs));
      expect(lufs(x, fs)).toBeCloseTo(20 * Math.log10(amp) - 3.01, 0);
      expect(Math.abs(lufs(x, fs) - (20 * Math.log10(amp) - 3.01))).toBeLessThan(0.3);
    }
  });
});

describe("notification sounds: which file iOS is asked to play", () => {
  it("each notification type plays its own v2 file; «default» is the system sound", () => {
    expect(athanNativeSound("makkah")).toBe("athan_makkah_v2.caf");
    expect(athanNativeSound("madinah")).toBe("athan_madinah_v2.caf");
    expect(athanNativeSound("fajr")).toBe("athan_fajr_v2.caf");
    expect(athanNativeSound("ibnMajid")).toBe("athan_ibn_majid_v2.caf");
    expect(athanNativeSound("default")).toBe("default");
    expect(preprayerNativeSound()).toBe("pre_athan_alert_v2.caf");
    expect(nightNativeSound()).toBe("astaghfirullah_night_v2.caf");
    expect(REMINDER_SOUNDS.map((s) => reminderNativeSound(s.id))).toEqual(["notif_chime_v2.caf", "notif_bell_v2.caf", "notif_alert_v2.caf", "notif_calm_v2.caf"]);
  });

  it("only v2 files can be asked for: the old names are gone from the bundle, the Xcode project, the build check and the code", () => {
    expect(NOTIFICATION_FILES).toHaveLength(10);
    for (const f of NOTIFICATION_FILES) expect(f).toMatch(/_v2\.caf$/);
    const viteConfig = readFileSync("vite.config.ts", "utf8") + readFileSync("vitest.config.ts", "utf8");
    const code = ["src/lib/notifications/NotificationSounds.ts", "src/lib/notifications/NightNotificationService.ts", "src/lib/notifications/PrayerNotificationService.ts"]
      .map((p) => readFileSync(p, "utf8"))
      .join("\n");
    for (const old of OLD_NAMES) {
      expect(existsSync(`${APP}/${old}`), old).toBe(false);
      expect(PBXPROJ, old).not.toMatch(new RegExp(`(^|[^_a-z])${old.replace(".", "\\.")}`));
      expect(viteConfig, old).not.toContain(`"${old}"`);
      expect(code, old).not.toMatch(new RegExp(`(^|[^_a-z])${old.replace(".", "\\.")}`));
    }
  });

  it("every v2 file is inside the target's Copy Bundle Resources phase (what Xcode copies into the .app)", () => {
    const phase = PBXPROJ.slice(PBXPROJ.indexOf("/* Begin PBXResourcesBuildPhase section */"), PBXPROJ.indexOf("/* End PBXResourcesBuildPhase section */"));
    for (const f of NOTIFICATION_FILES) {
      expect(phase, f).toContain(`/* ${f} in Resources */`);
      expect(PBXPROJ, f).toContain(`path = ${f};`);
    }
  });

  it("every file named to iOS is on disk and in the app's Copy Bundle Resources (else iOS plays silence)", () => {
    for (const f of NOTIFICATION_FILES) {
      expect(existsSync(`${APP}/${f}`), f).toBe(true);
      expect(PBXPROJ, f).toContain(`${f} in Resources`);
    }
  });
});

describe("notification sounds (v2): files iOS can play, mastered for a phone speaker, loud and clean", () => {
  for (const f of NOTIFICATION_FILES) {
    it(f, () => {
      const c = readCaf(`${APP}/${f}`);
      // A format UNNotificationSound supports (linear PCM in CAF), under Apple's 30 s limit.
      expect(c.format).toBe("lpcm");
      expect(c.bits).toBe(16);
      expect(c.channels).toBe(1);
      expect([22050, 44100]).toContain(c.sampleRate);
      expect(c.samples.length / c.sampleRate).toBeLessThan(30);
      // Loud without clipping: peaks kept 1 dB under full scale.
      expect(peakDb(c.samples)).toBeLessThanOrEqual(-1.0);
      expect(peakDb(c.samples)).toBeGreaterThan(-1.5);
      // It starts right away (no dead air before the sound).
      expect(leadingSilence(c)).toBeLessThan(0.05);
      // Through a phone speaker: never quieter than the file it replaces, and at its mastered level.
      const spk = lufsSpk(c.samples, c.sampleRate);
      expect(spk, `${f} vs v1`).toBeGreaterThanOrEqual(V1_LUFS_SPK[f] - 0.05);
      expect(spk, f).toBeGreaterThanOrEqual(MIN_LUFS_SPK[f]);
      // «استغفر الله» after its tone: the spoken message is no longer drowned by the tone
      // (in v1 it was 5.6-6.1 dB under it through a phone speaker).
      const gap = toneVoiceGap(c.samples, c.sampleRate);
      if (f === "pre_athan_alert_v2.caf" || f === "astaghfirullah_night_v2.caf") {
        expect(gap, f).not.toBeNull();
        const tone = momentaryMaxSpk(c.samples.slice(0, gap!), c.sampleRate);
        const voice = momentaryMaxSpk(c.samples.slice(gap!), c.sampleRate);
        expect(voice, `${f} voice vs tone`).toBeGreaterThanOrEqual(tone - 2);
      }
    });
  }
});
