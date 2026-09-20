import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, UploadCloud } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SEO } from "@/components/SEO";
import { cn } from "@/lib/utils";
import { CONVERSIONS, ConversionDialog, FileBadge, type Conversion } from "@/components/islamic/EliteTools";

/**
 * File Converter screen. The conversions themselves (image/PDF/Word/text/SVG
 * engines and their run dialog) live in EliteTools and are unchanged; this page
 * only presents them: "Convert to" / "Convert from" format tiles that filter the
 * real conversions, and a drop zone that matches a dropped file to the
 * conversions that can take it.
 */

interface Tile {
  id: string;
  label: string;
  labelAr?: string;
  color: string;
  /** ids of CONVERSIONS this tile shows */
  ids: string[];
}

const TO_TILES: Tile[] = [
  { id: "to-pdf", label: "PDF", color: "#E53935", ids: ["img-to-pdf", "word-to-pdf", "txt-to-pdf"] },
  { id: "to-jpg", label: "JPG", color: "#0097A7", ids: ["pdf-to-jpg", "png-to-jpg", "webp-to-jpg", "svg-to-jpg"] },
  { id: "to-png", label: "PNG", color: "#0097A7", ids: ["pdf-to-png", "jpg-to-png", "webp-to-png", "svg-to-png"] },
  { id: "to-webp", label: "WEBP", color: "#6D4C41", ids: ["png-to-webp", "jpg-to-webp"] },
  { id: "merge", label: "PDF+", labelAr: "دمج", color: "#2E7D32", ids: ["merge-pdf"] },
  { id: "compress", label: "ZIP", labelAr: "ضغط", color: "#FB8C00", ids: ["compress-img", "compress-pdf"] },
];

const FROM_TILES: Tile[] = [
  { id: "from-pdf", label: "PDF", color: "#E53935", ids: ["pdf-to-jpg", "pdf-to-png", "merge-pdf", "compress-pdf"] },
  { id: "from-img", label: "IMG", labelAr: "صور", color: "#7B1FA2", ids: ["img-to-pdf", "png-to-jpg", "jpg-to-png", "webp-to-png", "webp-to-jpg", "png-to-webp", "jpg-to-webp", "compress-img"] },
  { id: "from-word", label: "DOCX", labelAr: "Word", color: "#1565C0", ids: ["word-to-pdf"] },
  { id: "from-text", label: "TXT", labelAr: "نص", color: "#455A64", ids: ["txt-to-pdf"] },
  { id: "from-svg", label: "SVG", color: "#F9A825", ids: ["svg-to-png", "svg-to-jpg"] },
];

/** Does `conv` accept `file`? (mirrors the file input's `accept` list) */
function accepts(conv: Conversion, file: File): boolean {
  const name = file.name.toLowerCase();
  return conv.accept.split(",").some((tok) => {
    const a = tok.trim().toLowerCase();
    if (!a) return false;
    if (a.endsWith("/*")) return file.type.startsWith(a.slice(0, -1));
    if (a.startsWith(".")) return name.endsWith(a);
    return file.type === a;
  });
}

export default function FileConverterPage() {
  const { t, lang, dir } = useLocale();
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;
  const [tab, setTab] = useState<"to" | "from">("to");
  const [tileId, setTileId] = useState<string | null>(null);
  const [active, setActive] = useState<Conversion | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const tiles = tab === "to" ? TO_TILES : FROM_TILES;
  const tile = tiles.find((x) => x.id === tileId) ?? null;

  const takeFiles = (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    setFiles(arr);
    setTileId(null);
  };

  // What to list: conversions matching the dropped files, else the chosen tile.
  const forFiles = files.length ? CONVERSIONS.filter((c) => files.every((f) => accepts(c, f))) : [];
  const shown: Conversion[] = files.length
    ? forFiles
    : tile
      ? tile.ids.map((id) => CONVERSIONS.find((c) => c.id === id)).filter((c): c is Conversion => !!c)
      : [];

  const tileLabel = (x: Tile) => (lang === "ar" && x.labelAr ? x.labelAr : x.label);

  return (
    <PageShell titleAr="تحويل الملفات" titleEn="File Converter" fallback="/tools">
      <SEO
        title="تحويل الملفات — صور إلى PDF، دمج وضغط PDF، وتحويل الصيغ"
        description="حوّل ملفاتك مباشرة على جهازك: صور إلى PDF، دمج وضغط ملفات PDF، Word إلى PDF، ونص إلى PDF، بالإضافة إلى تحويل الصور بين JPG وPNG وWEBP وSVG."
        path="/convert"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-5">
        <div role="tablist" className="flex rounded-full bg-foreground/[0.06] p-1">
          {(
            [
              ["to", t("Convert to", "تحويل إلى")],
              ["from", t("Convert from", "تحويل من")],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              data-tab={k}
              onClick={() => {
                setTab(k);
                setTileId(null);
                setFiles([]);
              }}
              className={cn(
                "min-h-[42px] flex-1 rounded-full px-3 text-body font-bold transition",
                tab === k ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/65",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3" data-testid="format-tiles">
          {tiles.map((x) => (
            <button
              key={x.id}
              type="button"
              data-tile={x.id}
              aria-pressed={tileId === x.id}
              onClick={() => {
                setTileId(tileId === x.id ? null : x.id);
                setFiles([]);
              }}
              className={cn(
                "flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl bg-card px-2 py-3 text-center shadow-sm ring-1 transition active:scale-[0.97]",
                tileId === x.id ? "ring-2 ring-primary" : "ring-foreground/[0.07]",
              )}
            >
              <FileBadge label={x.label} color={x.color} />
              <span className="text-body-sm font-semibold">{tileLabel(x)}</span>
            </button>
          ))}
        </div>

        {/* Drop zone */}
        <div
          data-testid="dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            takeFiles(e.dataTransfer.files);
          }}
          className={cn(
            "rounded-3xl border-2 border-dashed p-6 text-center transition",
            dragging ? "border-primary bg-primary/10" : "border-foreground/20 bg-card/60",
          )}
        >
          <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-2" data-testid="dropzone-pick">
            <UploadCloud className="h-9 w-9 text-primary" />
            <span className="text-body font-bold">{t("Drag files here", "اسحب الملفات هنا")}</span>
            <span className="text-body-sm text-foreground/60">{t("or tap to choose", "أو اضغط للاختيار")}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            data-testid="dropzone-input"
            className="sr-only"
            onChange={(e) => {
              takeFiles(e.target.files ?? []);
              e.target.value = "";
            }}
          />
          <p className="mt-3 text-body-sm text-foreground/50" dir="ltr">
            PDF · DOCX · TXT · JPG · PNG · WEBP · SVG
          </p>
        </div>

        {/* Conversions available for the chosen tile / dropped files */}
        {(files.length > 0 || tile) && (
          <section data-testid="conversion-list" className="space-y-2">
            <h2 className="px-1 font-display text-body-lg font-bold">
              {files.length > 0
                ? t(`Available for ${files.length} file(s)`, `المتاح لـ ${files.length} ملف`)
                : t("Choose a conversion", "اختر نوع التحويل")}
            </h2>
            {shown.length === 0 ? (
              <p className="glass rounded-2xl p-5 text-center text-body-sm text-foreground/60">
                {t("No conversion supports these files together.", "لا يوجد تحويل يدعم هذه الملفات معاً.")}
              </p>
            ) : (
              <ul className="glass overflow-hidden rounded-2xl divide-y divide-foreground/[0.07]">
                {shown.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      data-conv={c.id}
                      onClick={() => setActive(c)}
                      className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2 text-start transition active:bg-foreground/[0.04]"
                    >
                      <FileBadge label={c.badge} color={c.badgeBg} />
                      <span className="min-w-0 flex-1 text-body font-semibold">{lang === "ar" ? c.labelAr : c.labelEn}</span>
                      <Chevron className="h-5 w-5 shrink-0 text-foreground/35" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <ConversionDialog conv={active} onClose={() => setActive(null)} initialFiles={files} />
    </PageShell>
  );
}
