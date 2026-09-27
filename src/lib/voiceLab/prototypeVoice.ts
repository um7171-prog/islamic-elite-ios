/**
 * Voice Lab — ONE licensed athan, used only to prove the download → local file → notification-sound
 * pipeline. This is not a catalog and not the future voice library.
 *
 * License verified from the file's own Wikimedia Commons description page (not from a listing):
 *   {{Information |source={{own}} |author=[[User:Atcovi|Atcovi]] |date=2020-12-23}}
 *   {{self|cc-by-sa-4.0}}
 * CC BY-SA 4.0 allows commercial use, storage and any use (including as a notification sound)
 * provided the work is ATTRIBUTED and adaptations (our 29-second clip) are shared under the same
 * license. The clip is produced on the user's device from the file the user downloads.
 *
 * Open point before any production use: the title names the muezzin ("Aaqib Azeez"); whether he
 * is the uploader or was recorded by the uploader is not documented. CC covers the recording's
 * copyright, not the performer's personality rights — confirm with the author first.
 */

export interface PrototypeVoice {
  id: string;
  nameAr: string;
  nameEn: string;
  muezzin: string;
  /** Full recording, served by Wikimedia (CORS: *). */
  sourceUrl: string;
  /** SHA-1 published by Wikimedia for the exact file; the download is rejected if it differs. */
  sha1: string;
  sizeBytes: number;
  durationSeconds: number;
  license: {
    name: "CC BY-SA 4.0";
    url: string;
    author: string;
    authorUrl: string;
    title: string;
    pageUrl: string;
    /** What this app changes when it makes the notification clip (required by BY-SA). */
    adaptation: string;
  };
}

export const PROTOTYPE_VOICE: PrototypeVoice = {
  id: "lab-aaqib-azeez",
  nameAr: "أذان — عاقب عزيز (تجريبي)",
  nameEn: "Adhan — Aaqib Azeez (lab)",
  muezzin: "Aaqib Azeez",
  sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/7/7d/The_Adhan_-_Muslim_Call_to_Prayer_-_Aaqib_Azeez.mp3",
  sha1: "971bced4b0bf6067358afc78cac6e9d219226c19",
  sizeBytes: 1448294,
  durationSeconds: 86.5,
  license: {
    name: "CC BY-SA 4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
    author: "Atcovi",
    authorUrl: "https://commons.wikimedia.org/wiki/User:Atcovi",
    title: "The Adhan - Muslim Call to Prayer - Aaqib Azeez",
    pageUrl: "https://commons.wikimedia.org/wiki/File:The_Adhan_-_Muslim_Call_to_Prayer_-_Aaqib_Azeez.mp3",
    adaptation: "Notification clip: first 29 s, mono, 22.05 kHz 16-bit WAV, 1.5 s fade-out. Licensed CC BY-SA 4.0.",
  },
};

/** iOS ignores a custom notification sound longer than 30 s; stay safely under it. */
export const NOTIFICATION_CLIP_SECONDS = 29;
export const NOTIFICATION_CLIP_RATE = 22050;
