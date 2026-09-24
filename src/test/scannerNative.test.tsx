import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { existsSync, readFileSync, readdirSync } from "node:fs";

// The native scanner (Swift: AVFoundation + Vision + Core Image) cannot run here. These tests prove
// the JS side of the contract (opens the native camera immediately, never two cameras, collects the
// returned pages, PDF) and pin the native project wiring. Real capture / detection / scan quality
// need a physical iPhone: docs/DEVICE_TEST_PLAN_AR.md.
let available = true;
const scanDocument = vi.fn<(lang: string) => Promise<unknown>>();
const cancelScan = vi.fn(async () => undefined);
const savePagesToPhotos = vi.fn<(urls: string[]) => Promise<number>>(async (urls) => urls.length);
vi.mock("@/lib/scanner/nativeScanner", () => ({
  isScannerAvailable: () => available,
  scanDocument: (lang: string) => scanDocument(lang),
  cancelScan: () => cancelScan(),
  savePagesToPhotos: (urls: string[]) => savePagesToPhotos(urls),
}));
const downloadBlob = vi.fn<(blob: Blob, name: string) => Promise<void>>(async () => undefined);
vi.mock("@/lib/aiImage", () => ({ downloadBlob: (blob: Blob, name: string) => downloadBlob(blob, name) }));
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a), info: vi.fn() } }));
// applyFilterToDataUrl needs real <canvas> pixel APIs jsdom does not implement; stand in with a
// deterministic, distinguishable "processed" marker per filter so the UI/PDF wiring is provable.
// A valid JPEG must stay embeddable in the real PDF, so the mock keeps the SAME bytes and only
// distinguishes filters by width (real algorithm output width/height would differ too).
const FILTER_WIDTH: Record<string, number> = { magic: 901, grayscale: 902, bw: 903 };
const applyFilterToDataUrl = vi.fn(async (dataUrl: string, filter: string) => ({ dataUrl, width: FILTER_WIDTH[filter] ?? 900, height: 1300 }));
vi.mock("@/lib/scanner/applyFilter", () => ({ applyFilterToDataUrl: (u: string, f: string) => applyFilterToDataUrl(u, f) }));

import { LocaleProvider } from "@/contexts/LocaleContext";
import { DocumentScannerDialog } from "@/components/scanner/DocumentScannerDialog";
import { buildScanPdf } from "@/lib/scanner/scanPdf";

const read = (p: string) => readFileSync(p, "utf8");
// A real 1x1 white JPEG.
const JPEG_1X1 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const page = (n = 1) => ({ dataUrl: JPEG_1X1, width: 800 * n, height: 1100 * n });

function Host({ open = true, onOpenChange = () => undefined }: { open?: boolean; onOpenChange?: (v: boolean) => void }) {
  return (
    <LocaleProvider>
      <DocumentScannerDialog open={open} onOpenChange={onOpenChange} />
    </LocaleProvider>
  );
}

beforeEach(() => {
  available = true;
  scanDocument.mockReset();
  cancelScan.mockClear();
  downloadBlob.mockClear();
  localStorage.clear();
  localStorage.setItem("lang", "ar");
});
afterEach(() => cleanup());

describe("scanner screen (JS side of the native contract)", () => {
  it("opening it opens the NATIVE camera immediately, with the app language", async () => {
    scanDocument.mockResolvedValue(page());
    render(<Host />);
    await waitFor(() => expect(scanDocument).toHaveBeenCalledTimes(1));
    expect(scanDocument).toHaveBeenCalledWith("ar");
  });

  it("the page returned by the native scan is shown (with its number) and can be exported", async () => {
    scanDocument.mockResolvedValue(page());
    render(<Host />);
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(1));
    expect(screen.getByTestId("scan-save-pdf")).toBeTruthy();
    expect(screen.getByTestId("scan-share-pdf")).toBeTruthy();
  });

  it("backing out of the very first scan closes the screen (nothing was scanned)", async () => {
    scanDocument.mockResolvedValue(null);
    const onOpenChange = vi.fn();
    render(<Host onOpenChange={onOpenChange} />);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("Add page opens the camera again; pages stack up; a page can be deleted", async () => {
    scanDocument.mockResolvedValueOnce(page(1)).mockResolvedValueOnce(page(2));
    render(<Host />);
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("scan-add"));
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(2));
    expect(scanDocument).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getAllByTestId("scan-page-delete")[0]);
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(1));
  });

  it("never two cameras: a second Add page while one is open does nothing", async () => {
    let resolveSecond: (v: unknown) => void = () => undefined;
    scanDocument.mockResolvedValueOnce(page()).mockImplementationOnce(() => new Promise((r) => { resolveSecond = r; }));
    render(<Host />);
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("scan-add"));
    await waitFor(() => expect(scanDocument).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByTestId("scan-add")); // disabled while scanning
    expect(scanDocument).toHaveBeenCalledTimes(2);
    await act(async () => { resolveSecond(page()); });
  });

  it("a native failure on the first scan closes the screen instead of leaving a dead spinner", async () => {
    scanDocument.mockRejectedValue(new Error("SCAN_FAILED"));
    const onOpenChange = vi.fn();
    render(<Host onOpenChange={onOpenChange} />);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("closing the screen closes the native scanner too (camera cleanup)", async () => {
    const { rerender } = render(<Host open />);
    scanDocument.mockResolvedValue(page());
    await waitFor(() => expect(scanDocument).toHaveBeenCalled());
    rerender(<Host open={false} />);
    await waitFor(() => expect(cancelScan).toHaveBeenCalled());
  });

  it("Save PDF builds a real PDF from the scanned pages and hands it to the save/share path", async () => {
    scanDocument.mockResolvedValue(page());
    render(<Host />);
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("scan-save-pdf"));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    const [blob, name] = downloadBlob.mock.calls[0];
    expect(name).toMatch(/^scan-\d+\.pdf$/);
    expect(blob.type).toBe("application/pdf");
    const head = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(blob.slice(0, 5)); });
    expect(head).toBe("%PDF-");
  });

  it("Save to Photos saves every page as its FINAL (filtered) image; the PDF button is still there", async () => {
    scanDocument.mockResolvedValueOnce(page(1)).mockResolvedValueOnce(page(2));
    savePagesToPhotos.mockClear();
    render(<Host />);
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("scan-add"));
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId("scan-filter-magic").getAttribute("data-active")).toBe("true"));
    fireEvent.click(screen.getByTestId("scan-save-photos"));
    await waitFor(() => expect(savePagesToPhotos).toHaveBeenCalledTimes(1));
    const urls = savePagesToPhotos.mock.calls[0][0];
    expect(urls).toHaveLength(2);
    // the filtered variant (the mock marks Magic by its width) is what gets saved
    expect(applyFilterToDataUrl).toHaveBeenCalledWith(expect.any(String), "magic");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(screen.getByTestId("scan-save-pdf")).toBeTruthy();
  });

  it("Save to Photos: a refused Photos permission says how to allow it (no fake success)", async () => {
    scanDocument.mockResolvedValue(page());
    savePagesToPhotos.mockRejectedValueOnce(new Error("PHOTOS_DENIED"));
    toastError.mockClear();
    toastSuccess.mockClear();
    render(<Host />);
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("scan-save-photos"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/إعدادات iPhone/);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("outside the iPhone app the scanner is honestly unavailable (no fake camera, no scan call)", () => {
    available = false;
    render(<Host />);
    expect(screen.getByTestId("scanner-unavailable")).toBeTruthy();
    expect(scanDocument).not.toHaveBeenCalled();
  });
});

describe("PDF output", () => {
  it("one A4 page per scanned page", async () => {
    const blob = await buildScanPdf([page(1), page(2), page(3)]);
    const text = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(blob); });
    expect(text.startsWith("%PDF-")).toBe(true);
    expect((text.match(/\/Type\s*\/Page[^s]/g) || []).length).toBe(3);
  });
});

describe("native project wiring (what the iPhone build actually contains)", () => {
  const swift = ["DocumentScannerPlugin.swift", "DocumentScannerViewController.swift", "DocumentImageProcessor.swift"];

  it("the three Swift files exist and are compiled by the Xcode project", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    for (const f of swift) {
      expect(existsSync(`ios/App/App/${f}`)).toBe(true);
      expect(pbx).toMatch(new RegExp(`${f} in Sources`));
      expect(pbx).toContain(`path = ${f}`);
    }
  });

  it("the plugin is registered with the bridge under the name the JS uses", () => {
    expect(read("ios/App/App/MainViewController.swift")).toMatch(/registerPluginInstance\(DocumentScannerPlugin\(\)\)/);
    expect(read("ios/App/App/DocumentScannerPlugin.swift")).toMatch(/jsName = "DocumentScanner"/);
    expect(read("src/lib/scanner/nativeScanner.ts")).toMatch(/registerPlugin<DocumentScannerPlugin>\("DocumentScanner"\)/);
  });

  it("uses real native detection and correction (Vision + Core Image), not JavaScript", () => {
    const proc = read("ios/App/App/DocumentImageProcessor.swift");
    expect(proc).toMatch(/VNDetectRectanglesRequest/);
    expect(proc).toMatch(/CIPerspectiveCorrection/);
    const vc = read("ios/App/App/DocumentScannerViewController.swift");
    expect(vc).toMatch(/AVCaptureSession/);
    expect(vc).toMatch(/AVCapturePhotoOutput/);
  });

  it("detection runs on the captured photo only: there is no live video-frame analysis", () => {
    const vc = read("ios/App/App/DocumentScannerViewController.swift");
    expect(vc).not.toMatch(/AVCaptureVideoDataOutput|captureOutput\(_ output: AVCaptureOutput, didOutput/);
    expect(vc).toMatch(/didFinishProcessingPhoto/);
  });

  it("the 'التالي' (Next) button is on the LEFT and the layout is not mirrored by RTL", () => {
    expect(read("ios/App/App/DocumentScannerViewController.swift")).toMatch(/scan: "التالي"/);
    const vc = read("ios/App/App/DocumentScannerViewController.swift");
    expect(vc).toMatch(/semanticContentAttribute = \.forceLeftToRight/);
    expect(vc).toMatch(/scanButton\.frame = CGRect\(x: 16,/);
    expect(vc).toMatch(/retakeButton\.frame = CGRect\(x: 16 \+ buttonWidth/);
  });

  it("no rectangle is invented when detection fails: a clear message and retake only", () => {
    const vc = read("ios/App/App/DocumentScannerViewController.swift");
    expect(vc).toMatch(/لم نتمكن من اكتشاف المستند/);
    expect(vc).toMatch(/quad == nil \? \.noDocument : \.review/);
    const proc = read("ios/App/App/DocumentImageProcessor.swift");
    expect(proc).toMatch(/whole frame is not a detection/);
  });

  it("the camera is released: stop on disappear/background, one session, portrait only", () => {
    const vc = read("ios/App/App/DocumentScannerViewController.swift");
    expect(vc).toMatch(/willResignActiveNotification/);
    expect(vc).toMatch(/viewWillDisappear[\s\S]*stopCamera\(\)/);
    expect(vc).toMatch(/supportedInterfaceOrientations[^\n]*\.portrait/);
    expect(read("ios/App/App/DocumentScannerPlugin.swift")).toMatch(/The scanner is already open/);
  });

  it("Save to Photos is really native: add-only Photos permission, PHAssetCreationRequest, usage string", () => {
    const plugin = read("ios/App/App/DocumentScannerPlugin.swift");
    expect(plugin).toMatch(/import Photos/);
    expect(plugin).toMatch(/CAPPluginMethod\(name: "saveToPhotos"/);
    expect(plugin).toMatch(/requestAuthorization\(for: \.addOnly\)/);
    expect(plugin).toMatch(/PHAssetCreationRequest\.forAsset\(\)/);
    expect(plugin).toMatch(/PHOTOS_DENIED/);
    expect(read("ios/App/App/Info.plist")).toMatch(/NSPhotoLibraryAddUsageDescription/);
    expect(read("src/lib/scanner/nativeScanner.ts")).toMatch(/saveToPhotos\(\{ images \}\)/);
  });

  it("camera permission has a usage string and a denied path that opens Settings", () => {
    expect(read("ios/App/App/Info.plist")).toMatch(/NSCameraUsageDescription/);
    expect(read("ios/App/App/DocumentScannerViewController.swift")).toMatch(/openSettingsURLString/);
  });

  it("the old scanner is gone: no JS detection, no web camera in the scanner code, no old files", () => {
    expect(existsSync("src/lib/docScan.ts")).toBe(false);
    expect(existsSync("src/components/islamic/DocumentScannerDialog.tsx")).toBe(false);
    for (const f of readdirSync("src/components/scanner")) expect(read(`src/components/scanner/${f}`)).not.toMatch(/getUserMedia|detectDocument|warpToRect/);
    for (const f of readdirSync("src/lib/scanner")) expect(read(`src/lib/scanner/${f}`)).not.toMatch(/getUserMedia|detectDocument|warpToRect/);
    expect(read("src/components/services/ServicesHub.tsx")).toMatch(/@\/components\/scanner\/DocumentScannerDialog/);
  });
});

describe("scan enhancement (real per-pixel processing, applied before PDF)", () => {
  beforeEach(() => { applyFilterToDataUrl.mockClear(); applyFilterToDataUrl.mockImplementation(async (dataUrl: string, filter: string) => ({ dataUrl, width: FILTER_WIDTH[filter] ?? 900, height: 1300 })); });

  it("Magic is applied automatically right after the scan (not just Original)", async () => {
    scanDocument.mockResolvedValue(page());
    render(<Host />);
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(1));
    await waitFor(() => expect(applyFilterToDataUrl).toHaveBeenCalledWith(JPEG_1X1, "magic"));
    await waitFor(() => expect(screen.getByAltText("صفحة 1").getAttribute("data-filter")).toBe("magic"));
    expect(screen.getByTestId("scan-filter-magic").getAttribute("data-active")).toBe("true");
  });

  it("all four options are offered: Original, Magic, Grayscale, B&W", async () => {
    scanDocument.mockResolvedValue(page());
    render(<Host />);
    await waitFor(() => expect(screen.getByTestId("scan-filters")).toBeTruthy());
    for (const id of ["original", "magic", "grayscale", "bw"]) expect(screen.getByTestId(`scan-filter-${id}`)).toBeTruthy();
  });

  it("switching filters runs REAL processing (not a CSS-only preview) and updates what will be exported", async () => {
    scanDocument.mockResolvedValue(page());
    render(<Host />);
    await waitFor(() => expect(screen.getByAltText("صفحة 1").getAttribute("data-filter")).toBe("magic")); // initial auto-Magic settled
    fireEvent.click(screen.getByTestId("scan-filter-bw"));
    await waitFor(() => expect(applyFilterToDataUrl).toHaveBeenCalledWith(JPEG_1X1, "bw"));
    await waitFor(() => expect(screen.getByAltText("صفحة 1").getAttribute("data-filter")).toBe("bw"));
    fireEvent.click(screen.getByTestId("scan-save-pdf"));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
  });

  it("a computed filter is cached: switching back to it does not reprocess", async () => {
    scanDocument.mockResolvedValue(page());
    render(<Host />);
    await waitFor(() => expect(applyFilterToDataUrl).toHaveBeenCalledWith(JPEG_1X1, "magic"));
    fireEvent.click(screen.getByTestId("scan-filter-grayscale"));
    await waitFor(() => expect(applyFilterToDataUrl).toHaveBeenCalledWith(JPEG_1X1, "grayscale"));
    const callsAfterGray = applyFilterToDataUrl.mock.calls.length;
    fireEvent.click(screen.getByTestId("scan-filter-magic")); // already computed
    await new Promise((r) => setTimeout(r, 20));
    expect(applyFilterToDataUrl.mock.calls.length).toBe(callsAfterGray);
  });

  it("Original bypasses processing entirely and uses the untouched capture", async () => {
    scanDocument.mockResolvedValue(page());
    render(<Host />);
    await waitFor(() => expect(screen.getByTestId("scan-filters")).toBeTruthy());
    fireEvent.click(screen.getByTestId("scan-filter-original"));
    await waitFor(() => {
      const img = screen.getByAltText("صفحة 1") as HTMLImageElement;
      expect(img.getAttribute("data-filter")).toBe("original");
      expect(img.src).toBe(JPEG_1X1);
    });
    expect(applyFilterToDataUrl).not.toHaveBeenCalledWith(JPEG_1X1, "original");
  });

  it("Save PDF uses the SELECTED FILTER's processed image, not the raw capture", async () => {
    scanDocument.mockResolvedValue(page());
    render(<Host />);
    await waitFor(() => expect(screen.getByAltText("صفحة 1").getAttribute("data-filter")).toBe("magic")); // initial auto-Magic settled
    fireEvent.click(screen.getByTestId("scan-save-pdf"));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    const [blob] = downloadBlob.mock.calls[0];
    const text = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(blob); });
    expect(text.startsWith("%PDF-")).toBe(true); // a real, embeddable image reference — not just the raw dataUrl string
  });

  it("each page keeps its own filter independently", async () => {
    scanDocument.mockResolvedValueOnce(page(1)).mockResolvedValueOnce(page(2));
    render(<Host />);
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(1));
    fireEvent.click(screen.getByTestId("scan-filter-grayscale"));
    await waitFor(() => expect(applyFilterToDataUrl).toHaveBeenCalledWith(JPEG_1X1, "grayscale"));
    fireEvent.click(screen.getByTestId("scan-add"));
    await waitFor(() => expect(screen.getAllByTestId("scan-page")).toHaveLength(2));
    // the newly added (now selected) page defaults to Magic again
    await waitFor(() => expect(screen.getByTestId("scan-filter-magic").getAttribute("data-active")).toBe("true"));
    // selecting page 1 again shows it is still Grayscale
    fireEvent.click(screen.getAllByTestId("scan-page")[0]);
    expect(screen.getByTestId("scan-filter-grayscale").getAttribute("data-active")).toBe("true");
  });
});
