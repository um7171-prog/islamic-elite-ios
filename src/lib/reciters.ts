// Reciters catalog + offline audio cache helpers
// Audio sourced from mp3quran.net public CDN servers.

export interface Reciter {
  id: string;
  name: string;        // Arabic name
  nameEn: string;
  server: string;      // base URL, e.g. https://server8.mp3quran.net/afs/
  rewaya?: string;     // optional note (e.g. "مجود")
  /** everyayah.com folder holding this reciter's per-ayah files (SSSAAA.mp3). */
  ayahFolder: string;
}

// Default 10 reciters (verified mp3quran.net server paths)
export const RECITERS: Reciter[] = [
  { id: "sudais",   name: "عبد الرحمن السديس",    nameEn: "Abdul Rahman Al-Sudais",        server: "https://server11.mp3quran.net/sds/", ayahFolder: "Abdurrahmaan_As-Sudais_192kbps" },
  { id: "shuraim",  name: "سعود الشريم",            nameEn: "Saud Al-Shuraim",               server: "https://server7.mp3quran.net/shur/", ayahFolder: "Saood_ash-Shuraym_128kbps" },
  { id: "afasy",    name: "مشاري العفاسي",          nameEn: "Mishary Rashid Al-Afasy",       server: "https://server8.mp3quran.net/afs/", ayahFolder: "Alafasy_128kbps" },
  { id: "maher",    name: "ماهر المعيقلي",          nameEn: "Maher Al-Muaiqly",              server: "https://server12.mp3quran.net/maher/", ayahFolder: "MaherAlMuaiqly128kbps" },
  { id: "dossari",  name: "ياسر الدوسري",           nameEn: "Yasser Al-Dossari",             server: "https://server11.mp3quran.net/yasser/", ayahFolder: "Yasser_Ad-Dussary_128kbps" },
  { id: "ghamdi",   name: "سعد الغامدي",            nameEn: "Saad Al-Ghamdi",                server: "https://server7.mp3quran.net/s_gmd/", ayahFolder: "Ghamadi_40kbps" },
  { id: "basit",    name: "عبد الباسط عبد الصمد",  nameEn: "Abdul Basit Abdul Samad",       server: "https://server7.mp3quran.net/basit/", rewaya: "مرتل", ayahFolder: "Abdul_Basit_Murattal_192kbps" },
  { id: "husary",   name: "محمود خليل الحصري",     nameEn: "Mahmoud Khalil Al-Husary",      server: "https://server13.mp3quran.net/husr/", ayahFolder: "Husary_128kbps" },
  { id: "minshawi", name: "محمد صديق المنشاوي",    nameEn: "Mohammed Siddiq Al-Minshawi",   server: "https://server10.mp3quran.net/minsh/", ayahFolder: "Minshawy_Murattal_128kbps" },
  { id: "qatami",   name: "ناصر القطامي",           nameEn: "Nasser Al-Qatami",              server: "https://server6.mp3quran.net/qtm/", ayahFolder: "Nasser_Alqatami_128kbps" },
];

export function surahUrl(reciter: Reciter, surahNumber: number) {
  const s = String(surahNumber).padStart(3, "0");
  return `${reciter.server}${s}.mp3`;
}

/** Per-ayah recitation file — lets playback start at any ayah. */
export function ayahUrl(reciter: Reciter, surah: number, ayah: number) {
  return `https://everyayah.com/data/${reciter.ayahFolder}/${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}.mp3`;
}

/* ------------ Favorites (localStorage) ------------ */
const FAV_KEY = "quran:fav-reciters";
export function getFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; }
}
export function toggleFavorite(id: string): string[] {
  const cur = getFavorites();
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  localStorage.setItem(FAV_KEY, JSON.stringify(next));
  return next;
}
export function sortByFavorites(list: Reciter[], favs: string[]) {
  const fav = list.filter(r => favs.includes(r.id));
  const rest = list.filter(r => !favs.includes(r.id));
  return [...fav, ...rest];
}

const SELECTED_KEY = "quran:selected-reciter";
export function getSelectedReciterId(): string {
  return localStorage.getItem(SELECTED_KEY) || RECITERS[2].id; // default Afasy
}
export function setSelectedReciterId(id: string) {
  localStorage.setItem(SELECTED_KEY, id);
}
export function getReciter(id: string): Reciter {
  return RECITERS.find(r => r.id === id) || RECITERS[2];
}

/* ------------ Offline cache via Cache Storage API ------------ */
const CACHE_NAME = "quran-audio-v1";

async function openCache() {
  if (typeof caches === "undefined") return null;
  try { return await caches.open(CACHE_NAME); } catch { return null; }
}

/**
 * Returns a playable URL for the surah. If cached, returns an object URL
 * (works offline). Otherwise returns the remote URL and triggers a
 * background cache write so subsequent plays work offline.
 */
export async function getPlayableUrl(reciter: Reciter, surahNumber: number): Promise<string> {
  const remote = surahUrl(reciter, surahNumber);
  const cache = await openCache();
  if (!cache) return remote;
  try {
    const hit = await cache.match(remote);
    if (hit) {
      const blob = await hit.blob();
      return URL.createObjectURL(blob);
    }
  } catch {}
  // Fire-and-forget caching
  void cacheSurah(reciter, surahNumber).catch(() => {});
  return remote;
}

export async function cacheSurah(reciter: Reciter, surahNumber: number): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  const url = surahUrl(reciter, surahNumber);
  try {
    const existing = await cache.match(url);
    if (existing) return true;
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return false;
    await cache.put(url, res.clone());
    return true;
  } catch { return false; }
}

export async function isCached(reciter: Reciter, surahNumber: number): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  try { return !!(await cache.match(surahUrl(reciter, surahNumber))); } catch { return false; }
}

export async function clearAudioCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try { await caches.delete(CACHE_NAME); } catch {}
}

/* ------------ MediaSession (lock-screen / background controls) ------------ */
export function setMediaSession(opts: {
  title: string; artist: string; album?: string;
  onPlay?: () => void; onPause?: () => void;
  onNext?: () => void; onPrev?: () => void;
}) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
      title: opts.title,
      artist: opts.artist,
      album: opts.album || "المصحف الشريف",
    });
    const ms = (navigator as any).mediaSession;
    ms.setActionHandler?.("play",  opts.onPlay  || null);
    ms.setActionHandler?.("pause", opts.onPause || null);
    ms.setActionHandler?.("nexttrack",     opts.onNext || null);
    ms.setActionHandler?.("previoustrack", opts.onPrev || null);
  } catch {}
}
