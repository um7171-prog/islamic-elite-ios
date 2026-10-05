#!/usr/bin/env python3
"""
Mastering of the iOS notification sounds for a phone's own speaker (v2).

Why: iOS plays a notification sound at the ringer volume with no gain of its own, so how loud it
sounds depends only on the file. A phone speaker reproduces little below ~400 Hz and is most
efficient around 1-4 kHz, so a file can measure loud (full-band LUFS) and still sound weak on the
phone if its energy sits in the bass and its peaks are far above its average. This chain works on
what the speaker can actually play:

  1. trim silence at both ends;
  2. high-pass (energy the speaker cannot reproduce only eats headroom);
  3. a small cut in the boxy low-mids, a presence lift around 2.5 kHz, a gentle high-shelf cut
     (clarity without harshness);
  4. a compressor (soft knee, 5 ms attack, 120 ms release) to shrink the peak-to-average gap;
  5. a true-peak look-ahead limiter at -1 dBTP (4x oversampled detection), so nothing clips.

For every file the drive (gain into the limiter), the compression ratio and the presence lift are
searched, and the setting with the highest loudness *through a phone-speaker model* is kept, under
limits that keep it clean: the limiter only catches peaks (99th percentile of its gain reduction
<= 3 dB), the crest factor stays natural (voice / athan >= 7 dB, short tones >= 5 dB) and the share
of 4-8 kHz energy may not grow much (no harshness).

Measurements reported for every file, before and after: integrated LUFS (ITU-R BS.1770), true
peak, RMS of the sounding part, crest factor (true peak - RMS), PLR (true peak - LUFS), energy per
band, and the loudness through the phone-speaker model ("LUFS-spk": a 4th-order 400 Hz high-pass
and a 10 kHz low-pass before the BS.1770 meter). The model approximates a phone speaker; the real
test is listening on an iPhone.

A v2 is never quieter through the speaker model than the file it replaces (--before): if the chain
does not beat it, that file's content is kept unchanged under the v2 name ("kept_previous_master").

Usage (needs numpy, scipy, pyloudnorm):
  python scripts/master-notification-sounds.py --src <dir of source .caf> --out <dir> \
         [--before <dir of the currently shipped .caf>] [--report report.json]
The sources are the original, unprocessed files (git: b4515d1:ios/App/App/<name>.caf); outputs are
written as <name>_v2.caf.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys

import numpy as np
import pyloudnorm as pyln
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d
from scipy.signal import butter, lfilter, resample_poly, sosfilt

VOICE = {"pre_athan_alert", "astaghfirullah_night", "athan_makkah", "athan_madinah", "athan_fajr", "athan_ibn_majid"}
CEILING_DBTP = -1.0
MAX_SECONDS = 29.5  # iOS plays at most 30 s of a notification sound


# ---------------------------------------------------------------- CAF (linear PCM, 16-bit, mono)

def read_caf(path: str):
    b = open(path, "rb").read()
    if b[:4] != b"caff":
        raise ValueError(f"{path}: not a CAF file")
    pos, chunks = 8, []
    while pos + 12 <= len(b):
        kind = b[pos:pos + 4]
        size = struct.unpack(">q", b[pos + 4:pos + 12])[0]
        end = len(b) if size == -1 else pos + 12 + size
        chunks.append((kind, b[pos + 12:end]))
        pos = end
    desc = next(body for kind, body in chunks if kind == b"desc")
    data = next(body for kind, body in chunks if kind == b"data")[4:]  # 4-byte edit count
    sr = struct.unpack(">d", desc[0:8])[0]
    fmt, flags = desc[8:12], struct.unpack(">I", desc[12:16])[0]
    ch, bits = struct.unpack(">I", desc[24:28])[0], struct.unpack(">I", desc[28:32])[0]
    if fmt != b"lpcm" or bits != 16:
        raise ValueError(f"{path}: expected 16-bit linear PCM, got {fmt!r} {bits}-bit")
    little = bool(flags & 2)
    x = np.frombuffer(data, dtype="<i2" if little else ">i2").astype(np.float64) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x, int(round(sr)), {"chunks": [(k, v) for k, v in chunks if k not in (b"data",)], "little": little}


def write_caf(path: str, x: np.ndarray, sr: int, header) -> None:
    """16-bit TPDF-dithered linear PCM, reusing the source's own header chunks (desc / chan / info)."""
    rng = np.random.default_rng(7)
    dither = (rng.random(len(x)) - rng.random(len(x))) / 32768.0
    q = np.clip(np.round((x + dither) * 32767.0), -32768, 32767).astype("<i2" if header["little"] else ">i2")
    out = [b"caff", struct.pack(">HH", 1, 0)]
    for kind, body in header["chunks"]:
        if kind == b"desc":
            body = struct.pack(">d", float(sr)) + body[8:]
        out += [kind, struct.pack(">q", len(body)), body]
    data = struct.pack(">I", 0) + q.tobytes()
    out += [b"data", struct.pack(">q", len(data)), data]
    with open(path, "wb") as f:
        f.write(b"".join(out))


# ---------------------------------------------------------------- measurements

def lufs(x: np.ndarray, sr: int) -> float:
    """BS.1770 integrated loudness; sounds under 0.5 s are measured inside 0.5 s of silence."""
    if len(x) < 0.5 * sr:
        x = np.concatenate([x, np.zeros(int(0.5 * sr) - len(x))])
    v = pyln.Meter(sr).integrated_loudness(x)
    return float(v) if np.isfinite(v) else float("nan")


def true_peak_db(x: np.ndarray) -> float:
    return float(20 * np.log10(np.max(np.abs(resample_poly(x, 4, 1))) + 1e-12))


def speaker(x: np.ndarray, sr: int) -> np.ndarray:
    """A phone speaker, roughly: little below ~400 Hz, rolling off above ~10 kHz."""
    y = sosfilt(butter(4, 400, "highpass", fs=sr, output="sos"), x)
    if sr > 22000:
        y = sosfilt(butter(2, 10000, "lowpass", fs=sr, output="sos"), y)
    return y


def active_rms_db(x: np.ndarray, sr: int) -> float:
    """RMS of the loud part: 50 ms windows within 20 dB of the loudest one (an echo or a decaying
    tail is not what the ear judges a notification's loudness by)."""
    w = max(1, int(0.05 * sr))
    ms = np.maximum(uniform_filter1d(x * x, w), 0.0)
    on = ms > max(10 ** (-50 / 10), ms.max() * 10 ** (-20 / 10))
    return float(10 * np.log10(np.mean(ms[on]) + 1e-20)) if on.any() else -120.0


BANDS = [("<250", 0, 250), ("250-1k", 250, 1000), ("1-4k", 1000, 4000), ("4-8k", 4000, 8000), (">8k", 8000, 1e9)]


def band_shares(x: np.ndarray, sr: int) -> dict:
    p = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / sr)
    tot = p.sum() + 1e-30
    return {name: round(float(100 * p[(f >= lo) & (f < hi)].sum() / tot), 1) for name, lo, hi in BANDS}


def hf_ratio_db(x: np.ndarray, sr: int) -> float:
    """4-8 kHz energy against 1-4 kHz energy: what makes a sound harsh, relative to its presence
    (unlike a share of the total, it does not rise just because the bass was removed)."""
    p = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / sr)
    hf = p[(f >= 4000) & (f < 8000)].sum()
    mid = p[(f >= 1000) & (f < 4000)].sum()
    return float(10 * np.log10((hf + 1e-30) / (mid + 1e-30)))


def measure(x: np.ndarray, sr: int) -> dict:
    tp, rms, lu = true_peak_db(x), active_rms_db(x, sr), lufs(x, sr)
    return {
        "seconds": round(len(x) / sr, 2),
        "lufs": round(lu, 2),
        "lufs_spk": round(lufs(speaker(x, sr), sr), 2),
        "true_peak": round(tp, 2),
        "rms": round(rms, 2),
        "crest": round(tp - rms, 2),
        "plr": round(tp - lu, 2) if math.isfinite(lu) else None,
        "bands": band_shares(x, sr),
        "hf_vs_presence_db": round(hf_ratio_db(x, sr), 2),
    }


# ---------------------------------------------------------------- processing

def biquad_peak(f0: float, gain_db: float, q: float, sr: int):
    a = 10 ** (gain_db / 40)
    w = 2 * math.pi * f0 / sr
    al = math.sin(w) / (2 * q)
    b = [1 + al * a, -2 * math.cos(w), 1 - al * a]
    d = [1 + al / a, -2 * math.cos(w), 1 - al / a]
    return np.array(b) / d[0], np.array(d) / d[0]


def biquad_highshelf(f0: float, gain_db: float, sr: int):
    a = 10 ** (gain_db / 40)
    w = 2 * math.pi * f0 / sr
    cs, al = math.cos(w), math.sin(w) / 2 * math.sqrt(2)
    s = 2 * math.sqrt(a) * al
    b = [a * ((a + 1) + (a - 1) * cs + s), -2 * a * ((a - 1) + (a + 1) * cs), a * ((a + 1) + (a - 1) * cs - s)]
    d = [(a + 1) - (a - 1) * cs + s, 2 * ((a - 1) - (a + 1) * cs), (a + 1) - (a - 1) * cs - s]
    return np.array(b) / d[0], np.array(d) / d[0]


def trim(x: np.ndarray, sr: int) -> np.ndarray:
    w = max(1, int(0.01 * sr))
    env = maximum_filter1d(np.abs(x), w)
    on = np.where(env > 10 ** (-55 / 20))[0]
    if not len(on):
        return x
    lo = max(0, on[0] - int(0.005 * sr))
    hi = min(len(x), on[-1] + int(0.06 * sr))
    return x[lo:hi][: int(MAX_SECONDS * sr)]


def eq(x: np.ndarray, sr: int, presence_db: float, hp_hz: float, shelf_db: float = -2.0) -> np.ndarray:
    y = sosfilt(butter(4, hp_hz, "highpass", fs=sr, output="sos"), x)
    y = lfilter(*biquad_peak(300, -2.0, 1.0, sr), y)
    y = lfilter(*biquad_peak(2500, presence_db, 0.9, sr), y)
    if sr > 16000:
        y = lfilter(*biquad_highshelf(min(6000, sr * 0.4), shelf_db, sr), y)
    return y


def compress(x: np.ndarray, sr: int, ratio: float, knee_db: float = 6.0):
    """Soft-knee compressor: 5 ms RMS detector, 5 ms attack / 100 ms release, on 1 ms blocks. It
    narrows the gap between the loud and the quieter parts (the tone against the voice, the
    syllables of a phrase); the limiter shaves what is left of the peaks. Threshold: 4 dB under
    the loud part's RMS."""
    blk = max(1, int(sr * 0.001))
    nb = int(math.ceil(len(x) / blk))
    pad = np.zeros(nb * blk)
    pad[: len(x)] = x
    ms = uniform_filter1d((pad.reshape(nb, blk) ** 2).mean(axis=1), 5)
    lvl = 10 * np.log10(np.maximum(ms, 0.0) + 1e-20)  # a moving mean of squares can round below 0
    thr = active_rms_db(x, sr) - 4.0
    over = lvl - thr
    slope = 1 - 1 / ratio
    gr = np.where(over <= -knee_db / 2, 0.0, np.where(over >= knee_db / 2, over * slope, slope * (over + knee_db / 2) ** 2 / (2 * knee_db)))
    att, rel = math.exp(-1 / 5.0), math.exp(-1 / 100.0)
    g, sm = 0.0, np.empty(nb)
    for i in range(nb):
        t = gr[i]
        c = att if t > g else rel
        g = c * g + (1 - c) * t
        sm[i] = g
    gain_db = np.interp(np.arange(len(x)), np.arange(nb) * blk + blk / 2, sm)
    return x * 10 ** (-gain_db / 20), sm


def limit(x: np.ndarray, sr: int, ceiling_db: float = CEILING_DBTP, hold_s: float = 0.005, release_s: float = 0.05):
    """Look-ahead brickwall on 4x-oversampled peaks: the gain never exceeds what each peak needs
    (a minimum over a 3 ms look-ahead + 5 ms hold, a box of the look-ahead length, a 50 ms release),
    so it shaves peaks without turning into a second compressor."""
    ceil = 10 ** (ceiling_db / 20)
    p = np.abs(resample_poly(x, 4, 1))[: len(x) * 4].reshape(-1, 4).max(axis=1)
    p = np.maximum(p, np.abs(x))
    need = np.minimum(1.0, ceil / np.maximum(p, 1e-12))
    w = max(1, int(0.003 * sr))
    hold = max(1, int(hold_s * sr))
    # g1[k] = minimum of `need` over [k - hold, k + w - 1]; g2[n] = mean of g1 over [n - w + 1, n].
    # Every one of those windows contains n, so g2[n] <= need[n]: no peak can pass the ceiling.
    # (scipy: a positive origin moves the window towards earlier samples.)
    n_min = hold + w
    g = minimum_filter1d(need, size=n_min, origin=hold - n_min // 2)
    g = uniform_filter1d(g, w, origin=(w - 1) - w // 2)
    g = np.minimum(g, need)
    r = math.exp(-1 / (release_s * sr))
    g = np.minimum(g, lfilter([1 - r], [1, -r], g, zi=[g[0] * r])[0])
    y = x * g
    tp = true_peak_db(y)
    if tp > ceiling_db:  # inter-sample rounding: a final trim
        y *= 10 ** ((ceiling_db - tp - 0.02) / 20)
    return y, -20 * np.log10(np.maximum(g, 1e-12))


def fades(x: np.ndarray, sr: int) -> np.ndarray:
    y = x.copy()
    a, b = int(0.003 * sr), int(0.03 * sr)
    y[:a] *= np.linspace(0, 1, a)
    y[-b:] *= np.linspace(1, 0, b)
    return y


def loud_part(y: np.ndarray, sr: int) -> np.ndarray:
    """Samples in the loud part (50 ms windows within 20 dB of the loudest one)."""
    ms = uniform_filter1d(y * y, max(1, int(0.05 * sr)))
    return ms > max(1e-5, ms.max() * 0.01)


def momentary_max_spk(x: np.ndarray, sr: int) -> float:
    """Loudest 400 ms through the speaker model (BS.1770 K-weighted mean square, no gating)."""
    y = speaker(x, sr)
    k = pyln.Meter(sr)._filters  # the meter's own K-weighting stages
    for f in k.values():
        y = lfilter(f.b, f.a, y)
    w, hop = int(0.4 * sr), int(0.05 * sr)
    if len(y) <= w:
        return float(10 * np.log10(np.mean(y * y) + 1e-20) - 0.691)
    ms = uniform_filter1d(y * y, w)[w // 2: len(y) - w // 2: hop]
    return float(10 * np.log10(ms.max() + 1e-20) - 0.691)


def find_gap(x: np.ndarray, sr: int, lo_s: float = 0.8, hi_s: float = 2.5):
    """The silent gap between the tone and the voice (< -50 dBFS), or None."""
    if len(x) < (hi_s + 0.1) * sr:
        return None
    env = uniform_filter1d(x * x, max(1, int(0.02 * sr)))
    lo, hi = int(lo_s * sr), int(hi_s * sr)
    gap = lo + int(np.argmin(env[lo:hi]))
    return gap if 10 * np.log10(env[gap] + 1e-20) <= -50 else None


def tone_voice(x: np.ndarray, sr: int):
    """Loudest 400 ms of the tone and of the voice, through the speaker model (None: no gap)."""
    gap = find_gap(x, sr)
    if gap is None:
        return None
    return {"tone": round(momentary_max_spk(x[:gap], sr), 2), "voice": round(momentary_max_spk(x[gap:], sr), 2)}


def balance_tone_voice(x: np.ndarray, sr: int, extra_db: float = 0.0):
    """The pre-prayer and night alerts are a tone, a silent gap, then the spoken «استغفر الله». The
    tone's peaks were taking the whole headroom (through a phone speaker the voice was 8-11 dB under
    it), so the message itself stayed faint. Where such a gap exists (< -50 dBFS between 1.0 and
    2.5 s), the tone is set 1 dB under the voice; the gain changes inside the silence, inaudibly."""
    if len(x) < 2.6 * sr:
        return x, None
    w = max(1, int(0.02 * sr))
    env = uniform_filter1d(x * x, w)
    lo, hi = int(1.0 * sr), int(2.5 * sr)
    gap = lo + int(np.argmin(env[lo:hi]))
    if 10 * np.log10(env[gap] + 1e-20) > -50:
        return x, None
    tone, voice = momentary_max_spk(x[:gap], sr), momentary_max_spk(x[gap:], sr)
    gain_db = (voice - tone) - 1.0 - extra_db
    g = np.ones(len(x))
    g[:gap] = 10 ** (gain_db / 20)
    ramp = min(int(0.005 * sr), gap)
    g[gap - ramp:gap] = np.linspace(10 ** (gain_db / 20), 1.0, ramp)
    return x * g, round(float(gain_db), 2)


def master(name: str, x: np.ndarray, sr: int, base: dict, extra_db: float = 0.0):
    """For each presence lift and compression ratio, the highest drive that stays clean (the limits
    only tighten as the drive rises, so it is found by bisection); the setting that is loudest
    through the speaker model wins. Clean means:
      - the limiter stays within ordinary mastering practice: over the loud part its mean gain
        reduction <= 4 dB, and never more than 12 dB on any single peak (a few ms of a consonant
        or a tone's attack; smooth look-ahead gain, no clipping);
      - a natural peak-to-loudness ratio: PLR >= 7 dB for voice / athan, >= 5 dB for short tones;
      - no harshness: 4-8 kHz energy (relative to 1-4 kHz) at most 1.5 dB above the source's
        (or 20 dB under 1-4 kHz, where it cannot sound harsh).
    High-pass: 220 Hz for voices (a male voice's fundamental, ~100-120 Hz, is what fills the peaks
    while a phone speaker cannot play it), 180 Hz for the tones."""
    voice = name in VOICE
    min_plr = 7.0 if voice else 5.0
    hp = 220.0 if voice else 180.0
    src = trim(x, sr)

    def harsh(y):
        """4-8 kHz against 1-4 kHz — on the spoken part only when a tone precedes it (the tone's
        pure 660/990 Hz would otherwise count as presence and hide the voice's own balance)."""
        gap = find_gap(y, sr)
        return hf_ratio_db(y[gap:] if gap is not None else y, sr)

    # (20 dB under the presence band, 4-8 kHz is inaudible as harshness: pure tones have none at all)
    hf_limit = max(harsh(src) + 1.5, -20.0)

    # A beep shorter than a second: a 50 ms release would hold the gain down over much of it.
    short = len(src) < 1.0 * sr
    lim_opts = {"hold_s": 0.001, "release_s": 0.01} if short else {}

    def render(comp, drive):
        y, lim_gr = limit(comp * 10 ** (drive / 20), sr, **lim_opts)
        y = fades(y, sr)
        on = loud_part(y, sr)
        mean_gr = float(lim_gr[on].mean()) if on.any() else 0.0
        active = float((lim_gr[on] > 1.0).mean()) if on.any() else 0.0
        m = measure(y, sr)
        m["hf_vs_presence_db"] = round(harsh(y), 2)
        ok = mean_gr <= 4.0 and float(lim_gr.max()) <= 12.0 and (m["plr"] or 0) >= min_plr and m["hf_vs_presence_db"] <= hf_limit
        return ok, y, m, {"limiter_gr_mean": round(mean_gr, 2), "limiter_active_pct": round(100 * active, 1), "limiter_gr_max": round(float(lim_gr.max()), 2)}

    best = None
    rejected = []
    # Long files (the 29 s athans) search a narrower grid around the settings the short ones settle on.
    long_file = len(src) > 10 * sr
    grid = ((3.5, -2.0), (5.0, -2.0), (3.5, -4.0), (5.0, -4.0)) if long_file else (
        (2.0, -2.0), (3.5, -2.0), (5.0, -2.0), (2.0, -4.0), (3.5, -4.0), (5.0, -4.0), (3.5, -6.0), (5.0, -6.0))
    for presence, shelf in grid:
        shaped, tone_gain = balance_tone_voice(eq(src, sr, presence, hp, shelf), sr, extra_db)
        for ratio in ((2.0, 3.0, 4.0) if long_file else (2.0, 3.0, 4.0, 6.0)):
            comp, comp_gr = compress(shaped, sr, ratio)
            comp /= np.max(np.abs(comp)) + 1e-12
            ok, *res = render(comp, 0.0)
            if not ok:
                rejected.append((presence, shelf, ratio, res[1]["plr"], res[1]["hf_vs_presence_db"], res[2]))
                continue
            lo, hi, found = 0.0, 24.0, res
            ok_hi, *res_hi = render(comp, hi)
            if ok_hi:
                lo, found = hi, res_hi
            else:
                while hi - lo > 0.25:
                    mid = (lo + hi) / 2
                    ok_mid, *res_mid = render(comp, mid)
                    if ok_mid:
                        lo, found = mid, res_mid
                    else:
                        hi = mid
            y, m, lim = found
            if best is None or m["lufs_spk"] > best["m"]["lufs_spk"]:
                best = {"y": y, "m": m, "params": {"highpass_hz": hp, "presence_db": presence, "shelf_6k_db": shelf, "tone_gain_db": tone_gain, "ratio": ratio, "drive_db": round(lo, 2),
                                                     **lim, "comp_gr_p95": round(float(np.percentile(comp_gr, 95)), 2)}}
    if best is None:
        raise RuntimeError(f"{name}: no clean setting (hf limit {hf_limit:.2f}, min PLR {min_plr}): {rejected[:4]}")
    return best


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--before")
    ap.add_argument("--report")
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    report = {}
    names = sorted(n[:-4] for n in os.listdir(a.src) if n.endswith(".caf"))
    for name in names:
        if a.only and name not in a.only:
            continue
        x, sr, header = read_caf(os.path.join(a.src, f"{name}.caf"))
        source = measure(x, sr)
        voice_hf = lambda y, r: round(hf_ratio_db(y[find_gap(y, r):] if find_gap(y, r) is not None else y, r), 2)
        source["hf_vs_presence_db"] = voice_hf(x, sr)
        before = None
        if a.before:
            yb, rb = read_caf(os.path.join(a.before, f"{name}.caf"))[:2]
            before = measure(yb, rb)
            before["hf_vs_presence_db"] = voice_hf(yb, rb)
        best = master(name, x, sr, source)
        # Tone + voice alerts: compression and limiting cut the voice's peaks more than the smooth
        # tone's, so the balance is checked on the result itself and the tone lowered further
        # until the voice is at least as loud as the tone (at most 3 more passes).
        extra = 0.0
        for _ in range(3):
            tv = tone_voice(best["y"], sr)
            if tv is None or tv["tone"] - tv["voice"] <= 0.5:
                break
            extra += tv["tone"] - tv["voice"]
            best = master(name, x, sr, source, extra)
        out = os.path.join(a.out, f"{name}_v2.caf")
        write_caf(out, best["y"], sr, header)
        # Never ship a v2 that is quieter through the speaker than the file it replaces: if this
        # chain did not beat it (a 15 ms click cannot be made much louder without changing the
        # sound), the current file's content is kept, unchanged, under the v2 name.
        if before is not None and measure(*read_caf(out)[:2])["lufs_spk"] < before["lufs_spk"]:
            with open(os.path.join(a.before, f"{name}.caf"), "rb") as src_f, open(out, "wb") as dst_f:
                dst_f.write(src_f.read())
            best["params"] = {**best["params"], "kept_previous_master": True}
        ya, ra = read_caf(out)[:2]
        after = measure(ya, ra)  # measured from the written file itself
        after["hf_vs_presence_db"] = voice_hf(ya, ra)
        report[name] = {"sample_rate": sr, "source": source, "before": before, "after": after, "params": best["params"]}
        if best["params"].get("tone_gain_db") is not None:
            parts = lambda path: tone_voice(*read_caf(path)[:2])
            report[name]["tone_vs_voice_spk"] = {"source": parts(os.path.join(a.src, f"{name}.caf")), "after": parts(out),
                                                 **({"before": parts(os.path.join(a.before, f"{name}.caf"))} if a.before else {})}
            print(f"{'':22s} tone vs voice (speaker, loudest 400 ms): {report[name]['tone_vs_voice_spk']}", flush=True)
        b = before or source
        print(f"{name:22s} LUFS {b['lufs']:6.1f}→{after['lufs']:6.1f} | LUFS-spk {b['lufs_spk']:6.1f}→{after['lufs_spk']:6.1f} | "
              f"TP {b['true_peak']:5.1f}→{after['true_peak']:5.1f} | crest {b['crest']:4.1f}→{after['crest']:4.1f} | "
              f"1-4k {b['bands']['1-4k']:4.1f}%→{after['bands']['1-4k']:4.1f}% | <250 {b['bands']['<250']:4.1f}%→{after['bands']['<250']:4.1f}% | "
              f"{best['params']}", flush=True)
    if a.report:
        with open(a.report, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
