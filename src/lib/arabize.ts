// Global Latin → Arabic-Indic digit converter.
// Activates when <html lang="ar">. Walks text nodes and re-converts on mutation.
// Avoids inputs, scripts, styles, and code/pre blocks.

const MAP: Record<string, string> = { "0":"٠","1":"١","2":"٢","3":"٣","4":"٤","5":"٥","6":"٦","7":"٧","8":"٨","9":"٩" };
const HAS_LATIN = /[0-9]/;
const SKIP_TAGS = new Set(["SCRIPT","STYLE","NOSCRIPT","TEXTAREA","INPUT","CODE","PRE"]);

export function toArabicDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, d => MAP[d]);
}

function shouldSkip(node: Node | null): boolean {
  let n: Node | null = node;
  while (n) {
    if (n.nodeType === 1) {
      const el = n as Element;
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.hasAttribute?.("data-no-arabize")) return true;
    }
    n = n.parentNode;
  }
  return false;
}

function convertNode(node: Node) {
  if (node.nodeType === 3) {
    const t = node.nodeValue;
    if (t && HAS_LATIN.test(t) && !shouldSkip(node.parentNode)) {
      node.nodeValue = t.replace(/[0-9]/g, d => MAP[d]);
    }
    return;
  }
  if (node.nodeType === 1) {
    const el = node as Element;
    if (SKIP_TAGS.has(el.tagName) || el.hasAttribute?.("data-no-arabize")) return;
    el.childNodes.forEach(convertNode);
  }
}

let observer: MutationObserver | null = null;

export function startArabize() {
  if (observer) return;
  convertNode(document.body);
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData") {
        convertNode(m.target);
      } else if (m.type === "childList") {
        m.addedNodes.forEach(convertNode);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

export function stopArabize() {
  if (observer) { observer.disconnect(); observer = null; }
}
