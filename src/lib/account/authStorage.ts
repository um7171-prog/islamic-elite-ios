/**
 * Where the ACCOUNT session lives: its own IndexedDB database — never the app's localStorage, and
 * never the legacy Supabase client's storage. Only the accounts client reads or writes it.
 */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** false for the in-memory fallback (the session is then lost when the app closes). */
  readonly persistent: boolean;
}

export const AUTH_DB_NAME = "elite-account-auth";
const STORE = "kv";

/** Volatile storage: used in tests, and when IndexedDB is unavailable. */
export function createMemoryAuthStorage(): AuthStorage {
  const m = new Map<string, string>();
  return {
    persistent: false,
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => { m.set(k, v); },
    removeItem: async (k) => { m.delete(k); },
  };
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(AUTH_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createIndexedDbAuthStorage(factory: IDBFactory): AuthStorage {
  let db: Promise<IDBDatabase> | null = null;
  const run = <T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    (db ??= openDb(factory)).then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const req = op(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }),
    );
  return {
    persistent: true,
    getItem: async (k) => {
      const v = await run<unknown>("readonly", (s) => s.get(k));
      return typeof v === "string" ? v : null;
    },
    setItem: async (k, v) => { await run("readwrite", (s) => s.put(v, k)); },
    removeItem: async (k) => { await run("readwrite", (s) => s.delete(k)); },
  };
}

/** IndexedDB when the platform has it (WKWebView / browsers), otherwise the volatile fallback. */
export function createDefaultAuthStorage(): AuthStorage {
  const factory = typeof globalThis.indexedDB !== "undefined" ? globalThis.indexedDB : null;
  return factory ? createIndexedDbAuthStorage(factory) : createMemoryAuthStorage();
}
