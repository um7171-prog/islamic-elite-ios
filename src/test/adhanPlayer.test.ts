import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { playFullAdhan, stopAdhanPlayback, _resetAdhanPlayerDedupe } from "@/lib/notifications/AdhanPlayer";
import { athanFullAudioUrl, ATHAN_SOUNDS } from "@/lib/notifications/NotificationSounds";

describe("AdhanPlayer: full, untruncated in-app playback", () => {
  let playSpy: ReturnType<typeof vi.fn>;
  let pauseSpy: ReturnType<typeof vi.fn>;
  let lastSrc = "";

  beforeEach(() => {
    _resetAdhanPlayerDedupe();
    playSpy = vi.fn().mockResolvedValue(undefined);
    pauseSpy = vi.fn();
    vi.stubGlobal(
      "Audio",
      vi.fn().mockImplementation((src: string) => {
        lastSrc = src;
        return { play: playSpy, pause: pauseSpy };
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("plays the LOCAL full-length file for the given athan sound (never the short .caf)", () => {
    playFullAdhan("makkah", 41000);
    expect(lastSrc).toBe(athanFullAudioUrl("makkah"));
    expect(lastSrc).not.toMatch(/\.caf$/);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("every athan sound resolves to a real local file, all bundled under public/sounds", () => {
    for (const s of ATHAN_SOUNDS) {
      if (s.id === "default") continue;
      expect(athanFullAudioUrl(s.id)).toMatch(/^\/sounds\/.+\.mp3$/);
    }
  });

  it("de-dupes by notification id: foreground-received then tapped plays only once", () => {
    playFullAdhan("fajr", 41020);
    playFullAdhan("fajr", 41020); // the same notification's second event (tap after receive)
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("a different notification id plays again, stopping the previous one first", () => {
    playFullAdhan("fajr", 41020);
    playFullAdhan("madinah", 41022);
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(pauseSpy).toHaveBeenCalledTimes(1); // the first was stopped before the second started
    expect(lastSrc).toBe(athanFullAudioUrl("madinah"));
  });

  it("stopAdhanPlayback pauses and clears the dedupe, so the same id can play again later", () => {
    playFullAdhan("fajr", 41020);
    stopAdhanPlayback();
    expect(pauseSpy).toHaveBeenCalled();
    playFullAdhan("fajr", 41020);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("never throws when Audio is unavailable (e.g. very old WebView)", () => {
    vi.stubGlobal("Audio", undefined);
    expect(() => playFullAdhan("fajr", 999)).not.toThrow();
  });
});
