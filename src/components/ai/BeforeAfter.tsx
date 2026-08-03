import { useCallback, useRef, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Columns2, MoveHorizontal, ZoomIn } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

interface Props {
  before: string;
  after: string;
  transparent?: boolean;
}

const CHECKER = {
  backgroundImage:
    "linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%, transparent 75%, hsl(var(--muted)) 75%)",
  backgroundSize: "18px 18px",
  backgroundPosition: "0 0, 9px 9px",
};

/** Before / After viewer with slider, side-by-side and pinch-zoom modes. */
export function BeforeAfter({ before, after, transparent }: Props) {
  const { t } = useLocale();
  const [mode, setMode] = useState<"slider" | "side" | "zoom">("slider");
  const [pos, setPos] = useState(50);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = useCallback((clientX: number) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }, []);

  const tabs = [
    { key: "slider" as const, label: t("Slider", "مقارنة"), Icon: MoveHorizontal },
    { key: "side" as const, label: t("Side by side", "جنبًا لجنب"), Icon: Columns2 },
    { key: "zoom" as const, label: t("Zoom", "تكبير"), Icon: ZoomIn },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-foreground/5 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={`h-10 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition ${
              mode === tab.key ? "bg-background shadow-sm text-foreground" : "text-foreground/60"
            }`}
          >
            <tab.Icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {mode === "slider" && (
        <div
          ref={boxRef}
          className="relative w-full overflow-hidden rounded-2xl border border-foreground/10 select-none touch-none"
          style={transparent ? CHECKER : undefined}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            move(e.clientX);
          }}
          onPointerMove={(e) => dragging.current && move(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <img src={after} alt={t("Result", "النتيجة")} className="w-full block" draggable={false} />
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
            <img
              src={before}
              alt={t("Original", "الأصلية")}
              className="block h-full w-auto max-w-none object-cover"
              style={{ width: boxRef.current?.clientWidth ?? "100%" }}
              draggable={false}
            />
          </div>
          <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${pos}%` }}>
            <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-10 w-10 rounded-full bg-accent text-accent-foreground grid place-items-center shadow-lg">
              <MoveHorizontal className="h-4 w-4" />
            </span>
          </div>
        </div>
      )}

      {mode === "side" && (
        <div className="grid grid-cols-2 gap-2">
          <figure className="space-y-1.5">
            <figcaption className="text-[11px] text-foreground/60">{t("Original", "الأصلية")}</figcaption>
            <img src={before} alt={t("Original", "الأصلية")} className="w-full rounded-xl border border-foreground/10" />
          </figure>
          <figure className="space-y-1.5">
            <figcaption className="text-[11px] text-foreground/60">{t("Result", "النتيجة")}</figcaption>
            <div className="rounded-xl border border-foreground/10 overflow-hidden" style={transparent ? CHECKER : undefined}>
              <img src={after} alt={t("Result", "النتيجة")} className="w-full" />
            </div>
          </figure>
        </div>
      )}

      {mode === "zoom" && (
        <div
          className="rounded-2xl border border-foreground/10 overflow-hidden"
          style={transparent ? CHECKER : undefined}
        >
          <TransformWrapper doubleClick={{ mode: "toggle", step: 2 }} maxScale={6} centerOnInit>
            <TransformComponent wrapperClass="!w-full" contentClass="!w-full">
              <img src={after} alt={t("Result", "النتيجة")} className="w-full" />
            </TransformComponent>
          </TransformWrapper>
        </div>
      )}
    </div>
  );
}
