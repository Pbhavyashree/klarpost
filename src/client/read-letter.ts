import { buildDocument, groupIntoLines, splitFragment, type RawPage } from "@/core/document";
import type { LetterDocument } from "@/core/types";

/**
 * Reading happens in the browser: OCR (Tesseract, compiled to WebAssembly)
 * for photos and scans, pdf.js for PDFs with a text layer. The server only
 * receives text, word positions and a downscaled page image.
 */

export interface ReadResult {
  document: LetterDocument;
  pages: Blob[];
  source: "image" | "pdf";
}

type Progress = (message: string, fraction?: number) => void;

const MAX_WIDTH = 1600;
const MAX_PAGES = 6;

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the page image."))), "image/jpeg", 0.85),
  );
}

async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function ocrCanvases(canvases: HTMLCanvasElement[], onProgress: Progress): Promise<RawPage[]> {
  const { createWorker } = await import("tesseract.js");
  onProgress("Loading the German text recogniser…", 0.05);
  let current = 0;
  const worker = await createWorker("deu", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(`Reading page ${current + 1} of ${canvases.length}…`, (current + m.progress) / canvases.length);
    },
  });
  try {
    const pages: RawPage[] = [];
    for (const [i, canvas] of canvases.entries()) {
      current = i;
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const lines = (data.blocks ?? []).flatMap((b) =>
        b.paragraphs.flatMap((p) =>
          p.lines.map((l) => ({
            words: l.words.filter((w) => w.confidence > 20).map((w) => ({ text: w.text, bbox: w.bbox })),
          })),
        ),
      );
      pages.push({ page: i + 1, width: canvas.width, height: canvas.height, lines });
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}

async function readPdf(file: File, onProgress: Progress): Promise<ReadResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const count = Math.min(pdf.numPages, MAX_PAGES);
  const raw: RawPage[] = [];
  const canvases: HTMLCanvasElement[] = [];

  for (let n = 1; n <= count; n++) {
    onProgress(`Opening page ${n} of ${count}…`, n / (count + 1));
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, MAX_WIDTH / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    canvases.push(canvas);

    const content = await page.getTextContent();
    const fragments = content.items.flatMap((it) => {
      if (!("str" in it) || !it.str.trim()) return [];
      const t = pdfjs.Util.transform(viewport.transform, it.transform);
      const height = Math.hypot(t[2]!, t[3]!);
      const x = t[4]!;
      const y = t[5]!;
      return splitFragment(it.str, { x0: x, y0: y - height, x1: x + it.width * viewport.scale, y1: y });
    });
    raw.push({ page: n, width: canvas.width, height: canvas.height, lines: groupIntoLines(fragments) });
  }

  const hasText = raw.some((p) => p.lines.length > 0);
  // Scanned PDFs have no text layer: fall back to OCR on the rendered pages.
  const pages = hasText ? raw : await ocrCanvases(canvases, onProgress);
  return { document: buildDocument(pages), pages: await Promise.all(canvases.map(toBlob)), source: "pdf" };
}

export async function readLetterFile(file: File, onProgress: Progress = () => {}): Promise<ReadResult> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return readPdf(file, onProgress);
  if (!file.type.startsWith("image/")) throw new Error("Upload a photo (JPG, PNG, HEIC exported as JPG) or a PDF.");
  const canvas = await imageToCanvas(file);
  const pages = await ocrCanvases([canvas], onProgress);
  return { document: buildDocument(pages), pages: [await toBlob(canvas)], source: "image" };
}
