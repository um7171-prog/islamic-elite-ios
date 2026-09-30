import { memo, useCallback, useRef, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { PAGE_IMAGE_HEIGHT, PAGE_IMAGE_WIDTH, pageImageMirror, pageImageUrl, toArabicDigits } from "@/lib/mushaf";

interface Props {
  page: number;
  /** The page box in the reader's column (fit width, original aspect ratio). */
  top: number;
  left: number;
  width: number;
  height: number;
  night: boolean;
  /** This page is the zoomed one: it takes one-finger pans instead of the scroll view. */
  zoomed: boolean;
  /** Hands the zoom layer to the reader's gesture controller (null on unmount). */
  registerLayer: (page: number, el: HTMLElement | null) => void;
}

/**
 * One Mushaf page in the vertical reader: a box of fixed size at a fixed place in the
 * column, holding the page image exactly as published (never cropped, recoloured in day
 * mode or distorted). Zoom never resizes the box — the gesture controller transforms the
 * inner layer, which the box clips, so a zoomed page can't spill over its neighbours.
 */
export const MushafPageView = memo(function MushafPageView({
  page, top, left, width, height, night, zoomed, registerLayer,
}: Props) {
  const { t } = useLocale();
  const [src, setSrc] = useState(() => pageImageUrl(page));
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const retries = useRef(0);

  const layerRef = useCallback((el: HTMLDivElement | null) => registerLayer(page, el), [page, registerLayer]);
  // An image already in the memory cache can be complete before React sees its load event.
  const imgRef = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) setStatus("loaded");
  }, []);

  const onError = () => {
    // The CDN first, then the mirror; after that, a visible retry instead of a blank page.
    if (!src.startsWith(pageImageMirror(page))) setSrc(pageImageMirror(page));
    else setStatus("error");
  };

  const retry = () => {
    retries.current += 1;
    setStatus("loading");
    setSrc(`${pageImageUrl(page)}?retry=${retries.current}`);
  };

  return (
    <div
      data-testid="mushaf-page"
      data-page={page}
      className="absolute overflow-hidden"
      style={{
        top,
        left,
        width,
        height,
        touchAction: zoomed ? "none" : "pan-y",
        background: night ? "#11161d" : "#fffefa",
        boxShadow: night ? "0 1px 2px rgba(0,0,0,.6)" : "0 1px 3px rgba(60,45,20,.14)",
      }}
    >
      {status !== "loaded" && (
        <div className="absolute inset-0 grid place-items-center" aria-hidden={status !== "error"}>
          {status === "error" ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <p className={night ? "text-body-sm text-white/60" : "text-body-sm text-black/55"}>
                {t("Couldn't load this page", "تعذّر تحميل الصفحة")}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  retry();
                }}
                data-testid="mushaf-page-retry"
                className={night ? "rounded-full bg-white/10 px-4 py-2 text-label text-white" : "rounded-full bg-black/5 px-4 py-2 text-label text-black/70"}
              >
                {t("Try again", "إعادة المحاولة")}
              </button>
            </div>
          ) : (
            <span className={night ? "font-arabic text-h3 text-white/15" : "font-arabic text-h3 text-black/10"}>{toArabicDigits(page)}</span>
          )}
        </div>
      )}
      <div ref={layerRef} data-zoom-layer className="h-full w-full" style={{ transformOrigin: "0 0" }}>
        <img
          ref={imgRef}
          src={src}
          alt={t(`Mushaf page ${page}`, `صفحة ${page} من المصحف`)}
          width={PAGE_IMAGE_WIDTH}
          height={PAGE_IMAGE_HEIGHT}
          draggable={false}
          decoding="async"
          onLoad={() => setStatus("loaded")}
          onError={onError}
          className="pointer-events-none select-none"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity: status === "loaded" ? 1 : 0,
            transition: "opacity .2s ease",
            filter: night ? "invert(1) sepia(.35) saturate(.8) brightness(1.05)" : undefined,
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
          }}
        />
      </div>
    </div>
  );
});
