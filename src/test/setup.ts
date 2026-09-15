import "@testing-library/jest-dom";

// Node 22+'s own experimental `localStorage` global shadows jsdom's
// implementation and is undefined without the (unset here) --localstorage-file
// flag, so both `localStorage` and `window.localStorage` are undefined in
// this test environment unless polyfilled — even though this is jsdom.
// Components that access localStorage unguarded (most app code wraps it in
// try/catch, but not universally) would otherwise crash on mount in tests.
if (typeof globalThis.localStorage === "undefined") {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length() { return this.store.size; }
    clear() { this.store.clear(); }
    getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
    key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
    removeItem(key: string) { this.store.delete(key); }
    setItem(key: string, value: string) { this.store.set(key, String(value)); }
  }
  const memoryStorage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, writable: true });
  Object.defineProperty(window, "localStorage", { value: memoryStorage, writable: true });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
