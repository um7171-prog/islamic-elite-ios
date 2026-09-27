/**
 * Pure audio helpers for the notification clip (no Web Audio, no DOM — fully unit-testable).
 * Output is Linear PCM WAV, one of the formats iOS accepts for a UNNotificationSound
 * (Linear PCM / MA4 / µLaw / aLaw in .aiff, .wav or .caf).
 */

/** Average all channels into one. */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] / channels.length;
  return out;
}

/** Linear-interpolation resample (adequate for speech/athan at 22.05 kHz). */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const outLen = Math.max(0, Math.floor((input.length * toRate) / fromRate));
  const out = new Float32Array(outLen);
  const ratio = fromRate / toRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Mono clip of at most `maxSeconds` (from the start), resampled to `targetRate`, with a linear
 * fade-out so the cut never clicks. Shorter recordings are kept whole.
 */
export function makeNotificationClip(
  channels: Float32Array[],
  sampleRate: number,
  maxSeconds: number,
  targetRate: number,
  fadeSeconds = 1.5,
): Float32Array {
  const mono = downmix(channels);
  const trimmed = mono.subarray(0, Math.min(mono.length, Math.floor(maxSeconds * sampleRate)));
  const out = Float32Array.from(resample(trimmed, sampleRate, targetRate));
  const fade = Math.min(out.length, Math.floor(fadeSeconds * targetRate));
  for (let i = 0; i < fade; i++) out[out.length - fade + i] *= 1 - (i + 1) / fade;
  return out;
}

/** 16-bit little-endian PCM WAV (RIFF) for mono samples in [-1, 1]. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // format: PCM
  v.setUint16(22, 1, true); // channels: mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  v.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** Reads back the header fields tests (and the lab screen) need. */
export function describeWav(bytes: Uint8Array): { sampleRate: number; channels: number; bitsPerSample: number; seconds: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = v.getUint32(24, true);
  const channels = v.getUint16(22, true);
  const bitsPerSample = v.getUint16(34, true);
  const dataBytes = v.getUint32(40, true);
  return { sampleRate, channels, bitsPerSample, seconds: dataBytes / (sampleRate * channels * (bitsPerSample / 8)) };
}
