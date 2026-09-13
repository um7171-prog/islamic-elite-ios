/**
 * Frequency capping for interstitial ads.
 *
 * An interstitial is only allowed when BOTH conditions hold:
 *  - the user completed at least `EVERY_N` actions since the last interstitial
 *  - at least `MIN_GAP_MS` elapsed since the last interstitial
 *
 * Never used inside worship sections (Quran, Athkar, prayer times, Qibla, Tasbeeh).
 */
const EVERY_N = 3;
const MIN_GAP_MS = 3 * 60 * 1000;

const COUNT_KEY = (k: string) => `ads.interstitial.${k}.count`;
const TIME_KEY = (k: string) => `ads.interstitial.${k}.last`;

function read(key: string) {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}
function write(key: string, value: number) {
  try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
}

/**
 * Registers one tool usage and returns whether an interstitial should be shown now.
 * Calling it also resets the counters when it returns true.
 */
export function shouldShowInterstitial(key: string): boolean {
  const count = read(COUNT_KEY(key)) + 1;
  const last = read(TIME_KEY(key));
  const now = Date.now();
  const gapOk = last === 0 || now - last >= MIN_GAP_MS;

  if (count >= EVERY_N && gapOk) {
    write(COUNT_KEY(key), 0);
    write(TIME_KEY(key), now);
    return true;
  }
  write(COUNT_KEY(key), count);
  return false;
}
