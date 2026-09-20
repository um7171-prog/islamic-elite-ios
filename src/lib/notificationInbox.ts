import { useEffect, useState } from "react";

/**
 * Notification Center inbox.
 *
 * Every entry carries the REAL time it was received. The Notification Center
 * only ever DISPLAYS entries younger than 30 minutes; older ones are dropped
 * from this inbox (a display list). This has nothing to do with scheduling:
 * prayer / Athkar / appointment notifications scheduled natively are untouched.
 */
export type InboxKind = "announcement" | "push" | "local";

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  /** epoch ms — when the notification arrived */
  receivedAt: number;
  kind: InboxKind;
  route?: string;
}

export const INBOX_KEY = "elite.notifications.inbox.v1";
export const INBOX_TTL_MS = 30 * 60_000;
export const INBOX_EVENT = "elite-notifications:inbox-changed";

/** An item is shown only while it is younger than the TTL (30 min and older are hidden). */
export function isFresh(receivedAt: number, now = Date.now()): boolean {
  return now - receivedAt < INBOX_TTL_MS;
}

export function visibleItems<T extends { receivedAt: number }>(items: T[], now = Date.now()): T[] {
  return items.filter((i) => isFresh(i.receivedAt, now)).sort((a, b) => b.receivedAt - a.receivedAt);
}

/** "منذ 3 دقائق" / "3 minutes ago" — whole minutes, as the user reads them. */
export function relativeAgo(receivedAt: number, lang: "ar" | "en", now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - receivedAt) / 60_000));
  if (lang === "ar") {
    if (min < 1) return "الآن";
    if (min === 1) return "منذ دقيقة";
    if (min === 2) return "منذ دقيقتين";
    if (min <= 10) return `منذ ${min} دقائق`;
    return `منذ ${min} دقيقة`;
  }
  if (min < 1) return "Just now";
  return min === 1 ? "1 minute ago" : `${min} minutes ago`;
}

function read(): InboxItem[] {
  try {
    const raw = localStorage.getItem(INBOX_KEY);
    const list = raw ? (JSON.parse(raw) as InboxItem[]) : [];
    return Array.isArray(list) ? list.filter((i) => i && typeof i.receivedAt === "number") : [];
  } catch {
    return [];
  }
}

function write(list: InboxItem[]) {
  try {
    localStorage.setItem(INBOX_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage full / private mode */
  }
}

/** Inbox contents, with expired entries removed (and pruned from storage). */
export function loadInbox(now = Date.now()): InboxItem[] {
  const all = read();
  const fresh = visibleItems(all, now);
  if (fresh.length !== all.length) write(fresh);
  return fresh;
}

/** Record a notification at the moment it arrives. Duplicate ids are ignored. */
export function addInboxItem(input: Omit<InboxItem, "id" | "receivedAt"> & { id?: string; receivedAt?: number }): InboxItem {
  const item: InboxItem = {
    id: input.id ?? `${input.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    body: input.body,
    kind: input.kind,
    route: input.route,
    receivedAt: input.receivedAt ?? Date.now(),
  };
  const list = loadInbox();
  if (list.some((i) => i.id === item.id)) return item;
  write([item, ...list]);
  try {
    window.dispatchEvent(new CustomEvent(INBOX_EVENT));
  } catch {
    /* non-DOM env */
  }
  return item;
}

/** Live inbox: re-reads on changes and re-filters every 15 s so items expire on screen. */
export function useInbox(): { items: InboxItem[]; now: number } {
  const [tick, setTick] = useState(() => Date.now());
  const [items, setItems] = useState<InboxItem[]>(() => loadInbox());
  useEffect(() => {
    const refresh = () => {
      setTick(Date.now());
      setItems(loadInbox());
    };
    const id = window.setInterval(refresh, 15_000);
    window.addEventListener(INBOX_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(INBOX_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return { items, now: tick };
}
