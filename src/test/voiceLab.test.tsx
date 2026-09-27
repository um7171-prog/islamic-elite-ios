import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

/* ---------- in-memory stand-ins for the native plugins ---------- */
const fsStore = new Map<string, string>(); // "<DIR>/<path>" -> base64
const native = { value: true };

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Library: "LIBRARY", LibraryNoCloud: "LIBRARY_NO_CLOUD", Cache: "CACHE", Documents: "DOCUMENTS", Data: "DATA" },
  Filesystem: {
    writeFile: vi.fn(async ({ directory, path, data }: { directory: string; path: string; data: string }) => {
      fsStore.set(`${directory}/${path}`, data);
      return { uri: `file:///${directory}/${path}` };
    }),
    deleteFile: vi.fn(async ({ directory, path }: { directory: string; path: string }) => {
      if (!fsStore.delete(`${directory}/${path}`)) throw new Error("File does not exist");
    }),
    stat: vi.fn(async ({ directory, path }: { directory: string; path: string }) => {
      const d = fsStore.get(`${directory}/${path}`);
      if (d == null) throw new Error("File does not exist");
      return { size: Math.floor((d.length * 3) / 4) - (d.endsWith("==") ? 2 : d.endsWith("=") ? 1 : 0), type: "file" };
    }),
    readFile: vi.fn(async ({ directory, path }: { directory: string; path: string }) => ({ data: fsStore.get(`${directory}/${path}`) ?? "" })),
    getUri: vi.fn(async ({ directory, path }: { directory: string; path: string }) => ({ uri: `file:///${directory}/${path}` })),
  },
}));
vi.mock("@/lib/platform", () => ({ isNativeApp: () => native.value, isIOSNativeApp: () => native.value, openNativeAppSettings: vi.fn() }));

import { Filesystem } from "@capacitor/filesystem";
import { PROTOTYPE_VOICE, NOTIFICATION_CLIP_SECONDS } from "@/lib/voiceLab/prototypeVoice";
import { describeWav, encodeWavPcm16, makeNotificationClip } from "@/lib/voiceLab/wav";
import { SHORT_DIR, deleteVoice, downloadVoice, shortFileName, shortPath, voiceStatus, type Decoder } from "@/lib/voiceLab/voiceStore";

/* ---------- synthetic "download" and "decode" (no network, no Web Audio) ---------- */
const FAKE_MP3 = new Uint8Array(200_000).map((_, i) => (i * 31) % 251);
const VOICE = { ...PROTOTYPE_VOICE, sha1: createHash("sha1").update(FAKE_MP3).digest("hex"), sizeBytes: FAKE_MP3.length };
const fakeFetch = (bytes: Uint8Array) =>
  (async () => {
    let sent = false;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": String(bytes.length) }),
      body: {
        getReader: () => ({
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
        }),
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
// 86.5 s stereo at 44.1 kHz, like the real recording (generated once, reused by every test)
let decoded: Awaited<ReturnType<Decoder>> | null = null;
const decoder: Decoder = async () => {
  if (!decoded) {
    const n = Math.floor(86.5 * 44100);
    const tone = (f: number) => Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * f * i) / 44100));
    decoded = { channels: [tone(440), tone(660)], sampleRate: 44100 };
  }
  return decoded;
};

beforeEach(() => {
  fsStore.clear();
  native.value = true;
  vi.clearAllMocks();
});

describe("notification clip (pure audio)", () => {
  it("an 86 s stereo recording becomes a mono 22.05 kHz 16-bit WAV of at most 29 s", async () => {
    const { channels, sampleRate } = await decoder(new ArrayBuffer(0));
    const wav = encodeWavPcm16(makeNotificationClip(channels, sampleRate, NOTIFICATION_CLIP_SECONDS, 22050), 22050);
    const info = describeWav(wav);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe("WAVE");
    expect(info).toMatchObject({ sampleRate: 22050, channels: 1, bitsPerSample: 16 });
    expect(info.seconds).toBeGreaterThan(28.9);
    expect(info.seconds).toBeLessThanOrEqual(29);
    expect(info.seconds).toBeLessThan(30); // iOS limit
  });

  it("fades out to silence (no click at the cut) and keeps short recordings whole", () => {
    const clip = makeNotificationClip([new Float32Array(44100 * 40).fill(0.8)], 44100, 29, 22050);
    expect(Math.abs(clip[clip.length - 1])).toBeLessThan(0.001);
    expect(clip[0]).toBeCloseTo(0.8, 5);
    const short = makeNotificationClip([new Float32Array(44100 * 5).fill(0.5)], 44100, 29, 22050);
    expect(short.length).toBe(22050 * 5);
  });
});

describe("download → store → delete → re-download", () => {
  it("saves the FULL file to LibraryNoCloud and the SHORT clip to Library/Sounds, with progress", async () => {
    const progress: number[] = [];
    const r = await downloadVoice(VOICE, (p) => progress.push(p), decoder, fakeFetch(FAKE_MP3));
    expect([...fsStore.keys()].sort()).toEqual([`LIBRARY/Sounds/${VOICE.id}-notify.wav`, `LIBRARY_NO_CLOUD/voice-lab/${VOICE.id}.mp3`]);
    expect(r.fullBytes).toBe(FAKE_MP3.length);
    expect(r.shortSeconds).toBeLessThanOrEqual(29);
    expect(r.shortSampleRate).toBe(22050);
    expect(progress.at(-1)).toBe(1);
    const st = await voiceStatus(VOICE);
    expect(st.fullBytes).toBe(FAKE_MP3.length);
    expect(st.shortBytes).toBe(r.shortBytes);
  });

  it("rejects a file whose SHA-1 does not match and keeps nothing", async () => {
    const tampered = FAKE_MP3.slice();
    tampered[10] ^= 0xff;
    await expect(downloadVoice(VOICE, undefined, decoder, fakeFetch(tampered))).rejects.toThrow(/SHA-1/);
    expect(fsStore.size).toBe(0);
    expect(Filesystem.writeFile).not.toHaveBeenCalled();
  });

  it("delete removes both files; it can be downloaded again", async () => {
    await downloadVoice(VOICE, undefined, decoder, fakeFetch(FAKE_MP3));
    await deleteVoice(VOICE);
    expect(fsStore.size).toBe(0);
    expect(await voiceStatus(VOICE)).toEqual({ fullBytes: null, shortBytes: null });
    await deleteVoice(VOICE); // deleting twice is harmless
    await downloadVoice(VOICE, undefined, decoder, fakeFetch(FAKE_MP3));
    expect(fsStore.size).toBe(2);
  });
});

describe("the notification-sound candidate is ONLY the short clip", () => {
  it("Library/Sounds receives exactly one file: the <= 29 s WAV named <id>-notify.wav (never the full MP3)", async () => {
    await downloadVoice(VOICE, undefined, decoder, fakeFetch(FAKE_MP3));
    const inSounds = [...fsStore.keys()].filter((k) => k.startsWith(`${SHORT_DIR}/Sounds/`));
    expect(inSounds).toEqual([`${SHORT_DIR}/${shortPath(VOICE)}`]);
    expect(shortFileName(VOICE)).toBe(`${VOICE.id}-notify.wav`);
    expect(inSounds.some((k) => k.endsWith(".mp3"))).toBe(false);
  });
});

describe("AdhanPlayer plays the full athan from a local URL (additive API)", () => {
  it("playAdhanFromUrl plays the given URL and stops the previous one", async () => {
    const played: string[] = [];
    const paused: string[] = [];
    class FakeAudio {
      constructor(public src: string) {}
      play() { played.push(this.src); return Promise.resolve(); }
      pause() { paused.push(this.src); }
    }
    vi.stubGlobal("Audio", FakeAudio);
    const { playAdhanFromUrl, stopAdhanPlayback } = await import("@/lib/notifications/AdhanPlayer");
    playAdhanFromUrl("capacitor://localhost/_capacitor_file_/LIBRARY_NO_CLOUD/voice-lab/a.mp3");
    playAdhanFromUrl("capacitor://localhost/_capacitor_file_/LIBRARY_NO_CLOUD/voice-lab/b.mp3");
    expect(played).toEqual([
      "capacitor://localhost/_capacitor_file_/LIBRARY_NO_CLOUD/voice-lab/a.mp3",
      "capacitor://localhost/_capacitor_file_/LIBRARY_NO_CLOUD/voice-lab/b.mp3",
    ]);
    expect(paused).toContain("capacitor://localhost/_capacitor_file_/LIBRARY_NO_CLOUD/voice-lab/a.mp3");
    stopAdhanPlayback();
    vi.unstubAllGlobals();
  });
});

describe("Voice Lab screen", () => {
  it("shows the voice and its license attribution", async () => {
    native.value = false;
    const { render, screen } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router-dom");
    const { HelmetProvider } = await import("react-helmet-async");
    const { LocaleProvider } = await import("@/contexts/LocaleContext");
    const { default: VoiceLabPage } = await import("@/pages/VoiceLabPage");
    localStorage.setItem("lang", "ar");
    render(<HelmetProvider><MemoryRouter><LocaleProvider><VoiceLabPage /></LocaleProvider></MemoryRouter></HelmetProvider>);
    const attribution = await screen.findByTestId("voice-lab-attribution");
    expect(attribution.textContent).toMatch(/CC BY-SA 4\.0/);
    expect(attribution.textContent).toMatch(/Atcovi/);
    expect(attribution.textContent).toMatch(/29 s/);
    expect(screen.getByTestId("download")).toBeTruthy();
  });
});
