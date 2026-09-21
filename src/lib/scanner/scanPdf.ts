import jsPDF from "jspdf";
import type { ScannedPage } from "./nativeScanner";

/** One A4 PDF page per scanned page, each centred and scaled to fit without distortion. */
export async function buildScanPdf(pages: Pick<ScannedPage, "dataUrl" | "width" | "height">[]): Promise<Blob> {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage();
    const ratio = Math.min(pageW / page.width, pageH / page.height);
    const w = page.width * ratio;
    const h = page.height * ratio;
    pdf.addImage(page.dataUrl, "JPEG", (pageW - w) / 2, (pageH - h) / 2, w, h);
  });
  return pdf.output("blob");
}
