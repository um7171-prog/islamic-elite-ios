import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Local assets shipped with the app (public/media). Nothing is fetched from the network. */
export const HARAM_HERO_VIDEO = "/media/haram-hero.mp4";
export const HARAM_HERO_POSTER = "/media/haram-hero-poster.jpg";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
const readReduce = () => {
  try {
    return window.matchMedia(REDUCE_QUERY).matches;
  } catch {
    return false;
  }
};

/**
 * Home hero: real, licensed tawaf footage of the Kaaba (see docs/HARAM_HERO_VIDEO.md for the
 * source and license). One muted, looping, inline <video> served from the app bundle, so it works
 * offline. The clip was stabilised on the Kaaba and cross-faded at the seam, so the loop has no visible jump.
 *
 * Cost model: a single hardware-decoded video element; no JS animation loop, no canvas, no state
 * that changes per frame. It is decorative (aria-hidden, pointer-events none), so it never blocks
 * a touch. With prefers-reduced-motion the video is not played: the still poster (its first frame)
 * stays on screen, and it follows the setting if the user changes it while the app is open.
 */
export function HaramHero({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [reduce, setReduce] = useState(readReduce);

  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia(REDUCE_QUERY);
    } catch {
      return;
    }
    const onChange = () => setReduce(mq!.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq!.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // React does not reflect `muted` to the DOM attribute; iOS only autoplays truly muted video.
    el.defaultMuted = true;
    el.muted = true;
    if (reduce) {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        /* metadata not loaded yet: the poster is showing anyway */
      }
    } else {
      // Autoplay can be refused (Low Power Mode, data saver): the poster simply stays.
      void el.play()?.catch(() => undefined);
    }
  }, [reduce]);

  return (
    <div
      aria-hidden="true"
      data-testid="haram-hero"
      className={cn("haram-hero-wrap pointer-events-none relative w-full select-none overflow-hidden", className)}
    >
      <div className="mx-auto aspect-[2/1] w-full max-w-[440px]">
        <video
          ref={ref}
          data-testid="haram-hero-video"
          className="haram-hero-video h-full w-full object-cover"
          src={HARAM_HERO_VIDEO}
          poster={HARAM_HERO_POSTER}
          muted
          loop
          playsInline
          autoPlay={!reduce}
          preload="auto"
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
        />
      </div>
    </div>
  );
}
