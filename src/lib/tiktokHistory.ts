/** Local search history + short-lived result cache for the TikTok analyzer. */

const HISTORY_KEY = "tiktok:history";
const CACHE_KEY = "tiktok:cache";
const AD_KEY = "tiktok:lastAd";

const MAX_HISTORY = 5;
export const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const AD_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

export function getHistory(): string[] {
  return read<string[]>(HISTORY_KEY, []).slice(0, MAX_HISTORY);
}

export function addHistory(username: string): string[] {
  const clean = username.trim().replace(/^@/, "").toLowerCase();
  if (!clean) return getHistory();
  const next = [clean, ...getHistory().filter((u) => u !== clean)].slice(0, MAX_HISTORY);
  write(HISTORY_KEY, next);
  return next;
}

export function removeHistory(username: string): string[] {
  const next = getHistory().filter((u) => u !== username);
  write(HISTORY_KEY, next);
  return next;
}

type CacheMap = Record<string, { at: number; data: unknown }>;

export function getCached<T>(username: string): T | null {
  const key = username.trim().replace(/^@/, "").toLowerCase();
  const map = read<CacheMap>(CACHE_KEY, {});
  const entry = map[key];
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    delete map[key];
    write(CACHE_KEY, map);
    return null;
  }
  return entry.data as T;
}

export function setCached(username: string, data: unknown) {
  const key = username.trim().replace(/^@/, "").toLowerCase();
  const map = read<CacheMap>(CACHE_KEY, {});
  // drop stale entries so the cache never grows unbounded
  const now = Date.now();
  for (const k of Object.keys(map)) if (now - map[k].at > CACHE_TTL_MS) delete map[k];
  map[key] = { at: now, data };
  write(CACHE_KEY, map);
}

/** True when the rewarded ad was already shown within the cooldown window. */
export function adRecentlyShown(): boolean {
  const last = Number(localStorage.getItem(AD_KEY) || 0);
  return Number.isFinite(last) && Date.now() - last < AD_COOLDOWN_MS;
}

export function markAdShown() {
  try {
    localStorage.setItem(AD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}
