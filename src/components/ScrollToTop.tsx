import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Reset + unlock the single app scroll container on every route change. */
export function resetAppScroll() {
  try {
    // Clear any leftover scroll-lock from unmounted Radix/react-remove-scroll layers.
    const body = document.body;
    body.removeAttribute("data-scroll-locked");
    body.style.removeProperty("position");
    body.style.removeProperty("top");
    body.style.removeProperty("pointer-events");
    body.style.removeProperty("touch-action");
    body.style.overflow = "hidden";
    document.documentElement.style.removeProperty("overflow");

    const scroll = document.getElementById("app-scroll");
    if (scroll) {
      scroll.style.overflowY = "auto";
      scroll.style.pointerEvents = "auto";
      scroll.style.touchAction = "pan-y";
      scroll.scrollTop = 0;
      scroll.scrollLeft = 0;
    }
  } catch {
    /* ignore */
  }
}

export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    resetAppScroll();
    const raf = requestAnimationFrame(resetAppScroll);
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
