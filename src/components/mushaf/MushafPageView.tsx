import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import { PAGE_RATIO, pageImageMirror, pageImageUrl } from "@/lib/mushaf";

interface Props {
  page: number;
  /** Only the active page reacts to gestures / reports zoom. */
  active: boolean;
  night: boolean;
  onZoomChange?: (scale: number) => void;
  onTap?: () => void;
  /** Increment to force a reset back to 1x. */
  resetToken?: number;
}

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.6;

/**
 * A single Mushaf page rendered as ONE image whose pixel box is fixed to the
 * "fit" size of the viewport. Zoom/pan is pure `translate3d(...) scale(...)`
 * on the wrapper, so the page never re-layouts, never crops and never
 * re-renders while zooming — iOS Photos behaviour.
 */
export const MushafPageView = memo(function MushafPageView({
  page, active, night, onZoomChange, onTap, resetToken = 0,
}: Props) {
  const apiRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const tapTimer = useRef<number | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const zoomedRef = useRef(false);

  const [zoomed, setZoomed] = useState(false);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [src, setSrc] = useState(() => pageImageUrl(page));
  const [loaded, setLoaded] = useState(false);

  /* ---------- fixed fit-box, recomputed only on resize ---------- */
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const w = Math.min(cw, ch * PAGE_RATIO);
      const h = w / PAGE_RATIO;
      setBox((cur) => (cur && Math.abs(cur.w - w) < 0.5 && Math.abs(cur.h - h) < 0.5 ? cur : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-centre the fitted page when the viewport (and so the page box) changes size.
  useEffect(() => {
    if (box) apiRef.current?.centerView(1, 0);
  }, [box]);

  useEffect(() => {
    const next = pageImageUrl(page);
    setSrc((cur) => (cur === next ? cur : next));
    // A cached image never fires onLoad again — trust `complete` instead.
    setLoaded(imgRef.current?.src === next && imgRef.current?.complete === true);
  }, [page]);

  useEffect(() => {
    if (!resetToken) return;
    apiRef.current?.resetTransform(280, "easeOutQuart");
    zoomedRef.current = false;
    setZoomed(false);
  }, [resetToken]);

  // Leaving the active slot always returns the page to 1x.
  useEffect(() => {
    if (!active && zoomedRef.current) {
      apiRef.current?.resetTransform(0);
      zoomedRef.current = false;
      setZoomed(false);
    }
  }, [active]);

  const handleTransformed = useCallback((_ref: ReactZoomPanPinchRef, state: { scale: number }) => {
    const isZoomed = state.scale > 1.01;
    if (zoomedRef.current !== isZoomed) {
      zoomedRef.current = isZoomed;
      setZoomed(isZoomed);
    }
    if (active) onZoomChange?.(state.scale);
  }, [active, onZoomChange]);

  /* ---------- double tap: zoom to the tapped point, toggle back ---------- */
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!active) return;
    if (tapTimer.current) { window.clearTimeout(tapTimer.current); tapTimer.current = null; }
    const api = apiRef.current;
    const host = hostRef.current;
    if (!api || !host) return;

    const { scale, positionX, positionY } = api.instance.getContext().state;
    if (scale > 1.01) { api.resetTransform(300, "easeOutQuart"); return; }

    const rect = host.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const k = DOUBLE_TAP_SCALE / scale;
    const x = px - (px - positionX) * k;
    const y = py - (py - positionY) * k;
    api.setTransform(x, y, DOUBLE_TAP_SCALE, 300, "easeOutQuart");
  }, [active]);

  const handleClick = useCallback(() => {
    if (!active) return;
    if (tapTimer.current) { window.clearTimeout(tapTimer.current); tapTimer.current = null; return; }
    tapTimer.current = window.setTimeout(() => { tapTimer.current = null; onTap?.(); }, 260);
  }, [active, onTap]);

  useEffect(() => () => { if (tapTimer.current) window.clearTimeout(tapTimer.current); }, []);

  return (
    <div ref={hostRef} className="h-full w-full overflow-hidden" style={{ touchAction: "none" }}>
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={MAX_SCALE}
        centerOnInit
        limitToBounds
        centerZoomedOut
        
        velocityAnimation={{ sensitivityTouch: 1, animationTime: 320, animationType: "easeOutQuart" }}
        doubleClick={{ disabled: true }}
        pinch={{ step: 8 }}
        wheel={{ step: 0.2 }}
        panning={{ disabled: !zoomed, velocityDisabled: false }}
        onTransform={handleTransformed}
      >
        {(api) => {
          apiRef.current = api;
          return (
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%", overflow: "hidden" }}
              // The pan/zoom content is exactly the page box (not the whole viewport), so
              // the pan bounds are the page's own edges: zoomed in, every edge of the page
              // can be brought fully into view, and no letterbox margin is ever dragged along.
              contentStyle={{
                width: box ? `${box.w}px` : "100%",
                height: box ? `${box.h}px` : "100%",
              }}
            >
              <div
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                style={{ width: "100%", height: "100%" }}
              >
                <img
                  ref={(el) => { imgRef.current = el; if (el?.complete && el.naturalWidth > 0) setLoaded(true); }}
                  src={src}
                  alt={`صفحة المصحف ${page}`}
                  draggable={false}
                  decoding="async"
                  loading="eager"
                  onLoad={() => setLoaded(true)}
                  onError={() => setSrc(pageImageMirror(page))}
                  className="select-none pointer-events-none"
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    objectFit: "fill",
                    opacity: loaded ? 1 : 0,
                    transition: "opacity .25s ease",
                    filter: night ? "invert(1) sepia(.35) saturate(.8) brightness(1.05)" : "none",
                    transform: "translate3d(0,0,0)",
                    backfaceVisibility: "hidden",
                    imageRendering: "auto",
                    WebkitUserSelect: "none",
                  }}
                />
              </div>
            </TransformComponent>
          );
        }}
      </TransformWrapper>
    </div>
  );
});
