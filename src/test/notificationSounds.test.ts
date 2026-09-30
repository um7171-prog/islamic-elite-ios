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
function biquad(kind: "shelf" | "highpass", gainDb: number, q: number, fc: number, fs: number) {
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
const leadingSilence = (c: Caf) => {
  const thr = 10 ** (-50 / 20);
  const i = c.samples.findIndex((v) => Math.abs(v) > thr);
  return i / c.sampleRate;
};

const APP = "ios/App/App";
const PBXPROJ = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");

/** Loudness (LUFS) the mastered files must keep — each ~0.5 LU under what the mastering reached,
 * and all far above the originals (athan -15.8…-16.9, pre-prayer / night -16.7 LUFS). */
const MIN_LUFS: Record<string, number> = {
  "athan_makkah.caf": -9.5,
  "athan_madinah.caf": -10.0,
  "athan_fajr.caf": -10.8,
  "athan_ibn_majid.caf": -8.6,
  "pre_athan_alert.caf": -13.6,
  "astaghfirullah_night.caf": -13.2,
};

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
  it("each athan uses its own bundled file; «default» is the system sound", () => {
    for (const s of ATHAN_SOUNDS) {
      expect(athanNativeSound(s.id), s.id).toBe(s.nativeFile ?? "default");
    }
    expect(athanNativeSound("makkah")).toBe("athan_makkah.caf");
  });

  it("the pre-prayer reminder plays pre_athan_alert.caf; the night reminders astaghfirullah_night.caf", () => {
    expect(preprayerNativeSound()).toBe("pre_athan_alert.caf");
    expect(nightNativeSound()).toBe("astaghfirullah_night.caf");
    for (const s of REMINDER_SOUNDS) expect(reminderNativeSound(s.id)).toBe(s.nativeFile);
  });

  it("every file named to iOS is on disk and in the app's Copy Bundle Resources (else iOS plays silence)", () => {
    for (const f of NOTIFICATION_FILES) {
      expect(existsSync(`${APP}/${f}`), f).toBe(true);
      expect(PBXPROJ, f).toContain(`${f} in Resources`);
    }
  });
});

describe("notification sounds: files iOS can play, mastered loud and clean", () => {
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
      if (MIN_LUFS[f] !== undefined) expect(lufs(c.samples, c.sampleRate)).toBeGreaterThanOrEqual(MIN_LUFS[f]);
    });
  }
});
