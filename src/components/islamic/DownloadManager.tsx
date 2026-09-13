import { useEffect, useRef, useState } from "react";
import { Camera, Download, FileText, Music, Pause, Play, Trash2, UploadCloud, X, Eye, FolderDown } from "lucide-react";
import { get, set, del } from "idb-keyval";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/contexts/LocaleContext";
import { toast } from "@/hooks/use-toast";
import { trackDownload } from "@/lib/analytics";

function extractFirstUrl(value: string) {
  const match = value.trim().match(/https?:\/\/[^\s<>"']+/i);
  return (match ? match[0] : value.trim()).replace(/[)\]}.,;]+$/, "");
}

// TikTok/YouTube downloading was removed (see project audit). This detector
// exists only to catch those links early and explain why, instead of letting
// them silently fail as a generic (and useless) HTML-page download.
const TIKTOK_RE = /(?:tiktok\.com|vm\.tiktok|vt\.tiktok)/i;
const YOUTUBE_RE = /(?:youtube\.com|youtu\.be)/i;

type ShareNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};
type MediaWindow = Window & typeof globalThis;

const STORE_PREFIX = "dl:";
const META_KEY = "dl:_meta";

type SavedFile = {
  id: string;
  name: string;
  url: string;
  size: number;
  mime: string;
  savedAt: number;
};

type Meta = SavedFile[];

function fmtBytes(n: number) {
  if (!n || !isFinite(n)) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}
function fmtSpeed(bps: number) { return `${fmtBytes(bps)}/s`; }
function guessName(url: string, headers?: Headers) {
  const cd = headers?.get("content-disposition") || "";
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
  if (m) return decodeURIComponent(m[1]);
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "download";
    return decodeURIComponent(last);
  } catch { return "download"; }
}
function guessMime(name: string, fallback: string) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    mp4: "video/mp4", webm: "video/webm", txt: "text/plain", json: "application/json",
    zip: "application/zip", csv: "text/csv",
  };
  return map[ext] || fallback || "application/octet-stream";
}

function getErrorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function isAbortError(e: unknown) {
  return e instanceof DOMException && e.name === "AbortError";
}

async function isProbablyBrokenVideo(blob: Blob, responseType: string) {
  if (/text\/|html|json|xml/i.test(responseType)) return true;
  const head = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  const text = new TextDecoder("latin1").decode(head);
  return blob.type === "video/mp4" && !text.includes("ftyp") && !text.includes("moov") && !text.includes("mdat");
}

function openMediaFallback(blob: Blob, name: string, mime: string, preparedWindow?: Window | null, remoteUrl?: string) {
  const mediaWindow = preparedWindow && !preparedWindow.closed ? preparedWindow : window.open("", "_blank");

  if (mediaWindow) {
    const targetWindow = mediaWindow as MediaWindow;
    const windowBlob = new targetWindow.Blob([blob], { type: mime });
    const blobUrl = targetWindow.URL.createObjectURL(windowBlob);
    const doc = targetWindow.document;
    const appStyles = getComputedStyle(document.documentElement);
    const bg = appStyles.getPropertyValue("--background").trim() || "0 0% 3%";
    const fg = appStyles.getPropertyValue("--foreground").trim() || "0 0% 100%";
    const primary = appStyles.getPropertyValue("--primary").trim() || "199 89% 48%";
    const muted = appStyles.getPropertyValue("--muted-foreground").trim() || fg;
    doc.open();
    doc.write("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title></title></head><body></body></html>");
    doc.close();
    const isVideo = mime.startsWith("video/");
    doc.title = name;
    doc.body.dir = "rtl";
    doc.body.style.cssText = `margin:0;background:hsl(${bg});color:hsl(${fg});font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:grid;min-height:100vh;place-items:center;padding:18px;box-sizing:border-box;gap:14px`;
    const media = doc.createElement(mime.startsWith("image/") ? "img" : "video");
    media.setAttribute("src", blobUrl);
    media.setAttribute("controls", "true");
    media.setAttribute("playsinline", "true");
    media.setAttribute("webkit-playsinline", "true");
    media.style.cssText = `max-width:100%;max-height:72vh;border-radius:16px;background:hsl(${bg})`;
    const title = doc.createElement("h1");
    title.textContent = isVideo ? "حفظ الفيديو في الاستوديو" : "حفظ الصورة في الاستوديو";
    title.style.cssText = "font-size:20px;line-height:1.4;text-align:center;margin:0;font-weight:800";
    const hint = doc.createElement("p");
    hint.textContent = isVideo
      ? "اضغط الزر الأصفر ثم اختر حفظ الفيديو من نافذة المشاركة. إذا لم يظهر الخيار، افتح الفيديو مباشرة واضغط مشاركة من المتصفح."
      : "اضغط الزر الأصفر ثم اختر حفظ الصورة من نافذة المشاركة. إذا لم يظهر الخيار، اضغط مطولاً على الصورة.";
    hint.style.cssText = `font-size:14px;line-height:1.6;text-align:center;max-width:320px;color:hsl(${muted});margin:0`;
    const actions = doc.createElement("div");
    actions.style.cssText = "display:grid;gap:10px;width:min(100%,340px)";
    const shareButton = doc.createElement("button");
    shareButton.textContent = isVideo ? "حفظ في الصور" : "حفظ الصورة";
    shareButton.style.cssText = `border:0;color:hsl(${fg});background:hsl(${primary});border-radius:999px;padding:14px 18px;font-weight:800;font-size:15px`;
    shareButton.onclick = async () => {
      const shareNavigator = mediaWindow.navigator as ShareNavigator;
      try {
        const FileCtor = targetWindow.File || File;
        const file = new FileCtor([windowBlob], name, { type: mime });
        const data: ShareData = { files: [file], title: name };
        if (shareNavigator.canShare?.(data) && shareNavigator.share) {
          await shareNavigator.share(data);
        } else if (remoteUrl) {
          mediaWindow.location.href = remoteUrl;
        } else {
          const a = doc.createElement("a");
          a.href = blobUrl;
          a.download = name;
          a.click();
        }
      } catch {
        if (remoteUrl) mediaWindow.location.href = remoteUrl;
      }
    };
    actions.appendChild(shareButton);
    if (remoteUrl) {
      const openDirect = doc.createElement("a");
      openDirect.href = remoteUrl;
      openDirect.textContent = isVideo ? "فتح الفيديو مباشرة" : "فتح الصورة مباشرة";
      openDirect.style.cssText = `color:hsl(${fg});background:hsl(${fg} / .12);text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:700;text-align:center`;
      actions.appendChild(openDirect);
    }
    const link = doc.createElement("a");
    link.href = blobUrl;
    link.download = name;
    link.textContent = "تنزيل للملفات";
    link.style.cssText = `color:hsl(${fg});background:hsl(${fg} / .12);text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:700;text-align:center`;
    actions.appendChild(link);
    doc.body.append(title, media, hint, actions);
    setTimeout(() => targetWindow.URL.revokeObjectURL(blobUrl), 120000);
  } else {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
  }
}

async function loadMeta(): Promise<Meta> { return ((await get<Meta>(META_KEY)) || []); }
async function saveMeta(m: Meta) { await set(META_KEY, m); }

type Job = {
  id: string;
  url: string;
  name: string;
  total: number;
  loaded: number;
  speed: number;
  status: "queued" | "downloading" | "paused" | "done" | "error";
  error?: string;
  resumable: boolean;
  chunks: Uint8Array[];
  controller?: AbortController;
  savedFileId?: string;
};

export function DownloadManager() {
  const { t, dir } = useLocale();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"new" | "files">("new");
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [files, setFiles] = useState<SavedFile[]>([]);
  const [previewing, setPreviewing] = useState<{ file: SavedFile; blobUrl: string } | null>(null);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const blobsRef = useRef<Record<string, Blob>>({});

  useEffect(() => { loadMeta().then(setFiles); }, []);

  const updateJob = (id: string, patch: Partial<Job>) =>
    setJobs((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const startJob = async (job: Job, fromByte = 0) => {
    const ctrl = new AbortController();
    job.controller = ctrl;
    updateJob(job.id, { status: "downloading", controller: ctrl });
    let lastT = performance.now();
    let lastLoaded = job.loaded;
    try {
      const headers: HeadersInit = {};
      if (fromByte > 0) headers.Range = `bytes=${fromByte}-`;
      const res = await fetch(job.url, { signal: ctrl.signal, headers });
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const acceptRanges = res.headers.get("accept-ranges");
      const cr = res.headers.get("content-range");
      const contentLen = Number(res.headers.get("content-length") || 0);
      let total = job.total;
      if (cr) {
        const m = /\/(\d+)$/.exec(cr);
        if (m) total = Number(m[1]);
      } else if (contentLen && fromByte === 0) total = contentLen;
      const resumable = (acceptRanges || "").toLowerCase().includes("bytes") || res.status === 206;
      const name = job.name || guessName(job.url, res.headers);
      updateJob(job.id, { total, resumable, name });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          job.chunks.push(value);
          job.loaded += value.byteLength;
          const now = performance.now();
          if (now - lastT > 400) {
            const speed = ((job.loaded - lastLoaded) * 1000) / (now - lastT);
            lastT = now; lastLoaded = job.loaded;
            updateJob(job.id, { loaded: job.loaded, speed });
          } else {
            updateJob(job.id, { loaded: job.loaded });
          }
        }
      }
      // Force mime from filename (proxies often return generic content-type which breaks Photos save)
      const responseType = res.headers.get("content-type") || "";
      const mime = guessMime(name, responseType);
      const blob = new Blob(job.chunks as BlobPart[], { type: mime });
      job.chunks = [];
      if (mime.startsWith("video/") && (blob.size < 4096 || await isProbablyBrokenVideo(blob, responseType))) {
        throw new Error(t("The video link returned an invalid file. Try another format.", "رابط الفيديو أعطى ملفاً غير صالح. جرّب صيغة أخرى."));
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      blobsRef.current[id] = blob;
      await set(STORE_PREFIX + id, blob);
      const meta: SavedFile = { id, name, url: job.url, size: blob.size, mime, savedAt: Date.now() };
      const next = [meta, ...(await loadMeta())];
      await saveMeta(next);
      setFiles(next);
      updateJob(job.id, { status: "done", speed: 0, savedFileId: id });
      trackDownload(name, job.url);
      // Do NOT auto-share: the user-activation gesture is gone after a long fetch,
      // so iOS will silently refuse the share sheet and the video never reaches Photos.
      // Instead surface a prominent "Save to Studio" button (fresh tap = valid gesture).
      toast({
        title: t("Ready to save", "جاهز للحفظ"),
        description: t("Tap 'Save to Studio' to add it to Photos.", "اضغط 'حفظ في الاستوديو' لإضافته للصور."),
      });
    } catch (e: unknown) {
      if (isAbortError(e)) {
        updateJob(job.id, { status: "paused", speed: 0 });
      } else {
        const message = getErrorMessage(e);
        updateJob(job.id, { status: "error", error: message, speed: 0 });
        toast({ title: t("Download failed", "فشل التنزيل"), description: message });
      }
    }
  };

  const startJobFromUrl = (downloadUrl: string, name: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const job: Job = {
      id, url: downloadUrl, name,
      total: 0, loaded: 0, speed: 0, status: "queued", resumable: false, chunks: [],
    };
    setJobs((p) => ({ ...p, [id]: job }));
    startJob(job);
  };

  const start = () => {
    const trimmed = extractFirstUrl(url);
    if (!/^https?:\/\//i.test(trimmed)) {
      toast({
        title: t("Invalid URL", "رابط غير صالح"),
        description: t("Use a full http(s):// link", "الصق رابطاً كاملاً يبدأ بـ https://"),
      });
      return;
    }
    if (TIKTOK_RE.test(trimmed) || YOUTUBE_RE.test(trimmed)) {
      toast({
        title: t("No longer supported", "الخدمة لم تعد مدعومة"),
        description: t(
          "Downloading from TikTok/YouTube is no longer supported. You can still download files from a direct link.",
          "تنزيل الفيديوهات من TikTok وYouTube لم يعد مدعومًا في هذا التطبيق. يمكنك تنزيل الملفات من رابط مباشر.",
        ),
      });
      return;
    }
    startJobFromUrl(trimmed, guessName(trimmed));
    setUrl("");
    setTab("new");
  };

  const pause = (id: string) => {
    const j = jobsRef.current[id]; if (!j) return;
    j.controller?.abort();
  };
  const resume = (id: string) => {
    const j = jobsRef.current[id]; if (!j) return;
    if (!j.resumable) {
      // server doesn't support range — restart
      j.chunks = []; j.loaded = 0;
      startJob(j, 0);
    } else {
      startJob(j, j.loaded);
    }
  };
  const cancel = (id: string) => {
    const j = jobsRef.current[id]; if (!j) return;
    j.controller?.abort();
    setJobs((p) => { const n = { ...p }; delete n[id]; return n; });
  };

  const downloadSaved = async (f: SavedFile) => {
    const blob = await get<Blob>(STORE_PREFIX + f.id);
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1500);
  };
  const shareSaved = async (f: SavedFile) => {
    const blob = blobsRef.current[f.id] || await get<Blob>(STORE_PREFIX + f.id);
    if (!blob) return;
    try {
      const file = new File([blob], f.name, { type: f.mime });
      const data: ShareData = { files: [file], title: f.name };
      const shareNavigator = navigator as ShareNavigator;
      if (shareNavigator.canShare?.(data) && shareNavigator.share) await shareNavigator.share(data);
      else downloadSaved(f);
    } catch (e: unknown) {
      if (!isAbortError(e)) toast({ title: t("Share failed", "فشلت المشاركة"), description: getErrorMessage(e) });
    }
  };
  const saveToGallery = async (f: SavedFile) => {
    const cachedBlob = blobsRef.current[f.id];
    const blob = cachedBlob || await get<Blob>(STORE_PREFIX + f.id);
    if (!blob) return;
    // Force proper mime — iOS Photos rejects octet-stream
    const mime = guessMime(f.name, f.mime);
    const typedBlob = blob.type === mime ? blob : new Blob([blob], { type: mime });
    const shareNavigator = navigator as ShareNavigator;
    const file = new File([typedBlob], f.name, { type: mime });
    const data: ShareData = { files: [file], title: f.name };
    if (shareNavigator.canShare?.(data) && shareNavigator.share) {
      await shareNavigator.share(data);
      return;
    }
    const preparedWindow = window.open("", "_blank");
    if (preparedWindow) {
      preparedWindow.document.write("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>جاري التجهيز...</title></head><body dir='rtl' style='margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#111;color:#fff'>جاري تجهيز صفحة الحفظ...</body></html>");
      preparedWindow.document.close();
    }
    openMediaFallback(typedBlob, f.name, mime, preparedWindow, f.url);
    toast({
      title: t("Save page opened", "تم فتح صفحة الحفظ"),
      description: t("Tap the yellow button, then choose Save Video.", "اضغط الزر الأصفر ثم اختر حفظ الفيديو."),
    });
  };
  const removeSaved = async (f: SavedFile) => {
    await del(STORE_PREFIX + f.id);
    delete blobsRef.current[f.id];
    const next = (await loadMeta()).filter((x) => x.id !== f.id);
    await saveMeta(next); setFiles(next);
  };
  const openPreview = async (f: SavedFile) => {
    const blob = await get<Blob>(STORE_PREFIX + f.id);
    if (!blob) return;
    setPreviewing({ file: f, blobUrl: URL.createObjectURL(blob) });
  };
  const closePreview = () => {
    if (previewing) URL.revokeObjectURL(previewing.blobUrl);
    setPreviewing(null);
  };

  const jobList = Object.values(jobs).sort((a, b) => Number(b.id) - Number(a.id));
  const activeCount = jobList.filter((j) => j.status === "downloading").length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        dir={dir}
        className="glass group flex w-full items-center gap-3 rounded-2xl p-4 text-start transition hover:border-accent/40"
      >
        <span className="h-12 w-12 shrink-0 rounded-2xl grid place-items-center bg-primary/15 text-primary group-hover:bg-primary/25">
          <FolderDown className="h-6 w-6" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold text-elite-gold">{t("Smart Media Downloader", "تنزيل الوسائط الذكي")}</h3>
          <p className="text-[11px] text-foreground/60 truncate">
            {activeCount > 0
              ? t(`${activeCount} downloading…`, `${activeCount} قيد التنزيل…`)
              : t("Paste a link to download.", "الصق رابطاً لبدء التنزيل.")}
          </p>
        </div>
        {files.length > 0 && (
          <span className="text-[10px] rounded-full bg-accent/15 text-accent px-2 py-0.5 tabular-nums">{files.length}</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir={dir}
          className="max-w-none w-screen h-[100dvh] max-h-[100dvh] sm:rounded-none p-0 gap-0 border-0 left-0 top-0 translate-x-0 translate-y-0 flex flex-col overflow-hidden [&>button.absolute]:hidden"
        >
          <DialogHeader className="px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3 border-b border-foreground/10 shrink-0">
            <DialogTitle className="text-elite-gold flex items-center gap-2 pe-16 min-h-14">
              <FolderDown className="h-5 w-5 shrink-0" />
              {t("Smart Media Downloader", "تنزيل الوسائط الذكي")}
            </DialogTitle>
            <DialogClose
              aria-label={t("Close", "إغلاق")}
              className="absolute end-3 top-[max(env(safe-area-inset-top),0.75rem)] grid h-12 w-12 place-items-center rounded-full bg-secondary/80 text-foreground shadow-md ring-1 ring-foreground/10 hover:bg-secondary active:scale-95 transition focus:outline-none focus:ring-2 focus:ring-elite-gold"
            >
              <X className="h-6 w-6" />
            </DialogClose>
          </DialogHeader>


          <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "files")} className="flex-1 flex flex-col overflow-hidden px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
            <TabsList className="grid w-full grid-cols-2 bg-secondary/60">
              <TabsTrigger value="new">{t("Download", "تنزيل")}</TabsTrigger>
              <TabsTrigger value="files">{t("History", "السجل")} ({files.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="space-y-3 pt-3 overflow-y-auto pr-1">
              <div className="rounded-2xl border border-accent/20 bg-accent/5 p-3 space-y-2.5">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    const clean = extractFirstUrl(pasted);
                    if (clean) {
                      e.preventDefault();
                      setUrl(clean);
                    }
                  }}
                  placeholder={t("Paste a link here", "الصق رابطاً هنا")}
                  inputMode="url"
                  className="w-full placeholder:text-foreground/40"
                />
                <Button
                  onClick={start}
                  disabled={!extractFirstUrl(url)}
                  className="min-h-[48px] w-full gap-2"
                >
                  <Download className="h-4 w-4" />
                  {t("Download", "تنزيل")}
                </Button>
              </div>

              <p className="text-[10px] text-foreground/45 leading-relaxed text-center">
                {t(
                  "Tip: tap 'Save Video' in the share sheet to add it to Photos.",
                  "ملاحظة: اضغط 'حفظ الفيديو' من قائمة المشاركة لإضافته للاستوديو.",
                )}
              </p>

              {jobList.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="text-[11px] uppercase tracking-wider text-foreground/55">{t("Active", "النشطة")}</div>
                  {jobList.map((j) => {
                    const pct = j.total ? Math.min(100, (j.loaded / j.total) * 100) : 0;
                    return (
                      <div key={j.id} className="rounded-xl border border-foreground/10 bg-background/40 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-accent shrink-0" />
                          <span className="text-xs flex-1 truncate" title={j.name}>{j.name}</span>
                          {j.status === "downloading" && (
                            <button onClick={() => pause(j.id)} className="p-1 rounded hover:bg-secondary text-foreground/70" aria-label="pause">
                              <Pause className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {(j.status === "paused" || j.status === "error") && (
                            <button onClick={() => resume(j.id)} className="p-1 rounded hover:bg-secondary text-foreground/70" aria-label="resume">
                              <Play className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => cancel(j.id)} className="p-1 rounded hover:bg-secondary text-destructive" aria-label="cancel">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <div className="flex items-center justify-between text-[10px] text-foreground/55 tabular-nums">
                          <span>{fmtBytes(j.loaded)}{j.total ? ` / ${fmtBytes(j.total)}` : ""}</span>
                          <span>
                            {j.status === "downloading" && fmtSpeed(j.speed)}
                            {j.status === "paused" && t("Paused", "متوقف")}
                            {j.status === "done" && t("Done", "تم")}
                            {j.status === "error" && (j.error || "Error")}
                            {j.status === "queued" && "…"}
                          </span>
                        </div>
                        {j.status === "done" && j.savedFileId && (() => {
                          const f = files.find((x) => x.id === j.savedFileId);
                          if (!f) return null;
                          return (
                            <Button
                              onClick={() => saveToGallery(f)}
                              size="lg"
                              className="w-full gap-2 mt-1 h-12 font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg"
                            >
                              <Camera className="h-4 w-4" />
                              {t("Save to Studio (Photos)", "حفظ في الاستوديو (الصور)")}
                            </Button>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="files" className="space-y-2 pt-3 overflow-y-auto pr-1">
              {files.length === 0 ? (
                <div className="text-center text-xs text-foreground/50 py-8">
                  {t("No files yet.", "لا توجد ملفات بعد.")}
                </div>
              ) : (
                files.map((f) => {
                  const isAudio = f.mime.startsWith("audio/");
                  const isPdf = f.mime === "application/pdf";
                  const isImage = f.mime.startsWith("image/");
                  const canPreview = isAudio || isPdf || isImage;
                  return (
                    <div key={f.id} className="rounded-xl border border-foreground/10 bg-background/40 p-2.5 flex items-center gap-2">
                      <span className="h-8 w-8 grid place-items-center rounded-lg bg-secondary/60 text-foreground/60 shrink-0">
                        {isAudio ? <Music className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate" title={f.name}>{f.name}</div>
                        <div className="text-[10px] text-foreground/55 tabular-nums">{fmtBytes(f.size)}</div>
                      </div>
                      {canPreview && (
                        <button onClick={() => openPreview(f)} className="p-1 rounded hover:bg-secondary text-foreground/70 hover:text-accent" aria-label={t("Preview", "معاينة")} title={t("Preview", "معاينة")}>
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {(f.mime.startsWith("image/") || f.mime.startsWith("video/")) && (
                        <button onClick={() => saveToGallery(f)} className="p-1 rounded hover:bg-secondary text-foreground/70 hover:text-accent" aria-label={t("Save to gallery", "حفظ في الاستوديو")} title={t("Save to gallery", "حفظ في الاستوديو")}>
                          <Camera className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => shareSaved(f)} className="p-1 rounded hover:bg-secondary text-foreground/70 hover:text-accent" aria-label={t("Share", "إرسال")} title={t("Share", "إرسال")}>
                        <UploadCloud className="h-3.5 w-3.5 rotate-180" />
                      </button>
                      <button onClick={() => downloadSaved(f)} className="p-1 rounded hover:bg-secondary text-foreground/70 hover:text-accent" aria-label={t("Save", "حفظ")} title={t("Save", "حفظ")}>
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeSaved(f)} className="p-1 rounded hover:bg-secondary text-destructive" aria-label={t("Delete", "حذف")} title={t("Delete", "حذف")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewing} onOpenChange={(v) => { if (!v) closePreview(); }}>
        <DialogContent dir={dir} className="max-w-2xl">
          {previewing && (
            <>
              <DialogHeader>
                <DialogTitle className="text-elite-gold truncate">{previewing.file.name}</DialogTitle>
              </DialogHeader>
              {previewing.file.mime === "application/pdf" && (
                <iframe src={previewing.blobUrl} className="w-full h-[70vh] rounded-lg bg-background" title={previewing.file.name} />
              )}
              {previewing.file.mime.startsWith("audio/") && (
                <audio src={previewing.blobUrl} controls className="w-full" />
              )}
              {previewing.file.mime.startsWith("image/") && (
                <img src={previewing.blobUrl} alt={previewing.file.name} className="w-full max-h-[70vh] object-contain rounded-lg" />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
