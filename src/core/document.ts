import type { BBox, LetterDocument, Word } from "./types";

export interface RawPage {
  page: number;
  width: number;
  height: number;
  lines: { words: { text: string; bbox: BBox }[] }[];
}

/**
 * Turn OCR or PDF output (pages → lines → words with boxes) into one text plus
 * a word index, so a character range in the text can be mapped to boxes on
 * the page image. Lines are joined with "\n", pages with a blank line.
 */
export function buildDocument(pages: RawPage[]): LetterDocument {
  let text = "";
  const words: Word[] = [];
  pages.forEach((p, pi) => {
    if (pi > 0) text += "\n\n";
    p.lines.forEach((line, li) => {
      if (li > 0) text += "\n";
      line.words
        .filter((w) => w.text.trim())
        .forEach((w, wi) => {
          if (wi > 0) text += " ";
          const start = text.length;
          text += w.text.trim();
          words.push({ text: w.text.trim(), page: p.page, bbox: w.bbox, start, end: text.length });
        });
    });
  });
  return { text, words, pages: pages.map(({ page, width, height }) => ({ page, width, height })) };
}

/**
 * Group loose text fragments (as PDFs deliver them) into lines by their
 * vertical position, then sort each line left to right.
 */
export function groupIntoLines(fragments: { text: string; bbox: BBox }[]): RawPage["lines"] {
  const sorted = [...fragments].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const lines: { y: number; h: number; words: { text: string; bbox: BBox }[] }[] = [];
  for (const f of sorted) {
    const h = f.bbox.y1 - f.bbox.y0;
    const mid = (f.bbox.y0 + f.bbox.y1) / 2;
    const line = lines.find((l) => Math.abs(l.y - mid) < Math.max(l.h, h) / 2);
    if (line) line.words.push(f);
    else lines.push({ y: mid, h, words: [f] });
  }
  return lines.map((l) => ({ words: l.words.sort((a, b) => a.bbox.x0 - b.bbox.x0) }));
}

/** Split a PDF text fragment ("Bitte zahlen Sie") into word boxes, estimating widths by character count. */
export function splitFragment(text: string, bbox: BBox): { text: string; bbox: BBox }[] {
  const out: { text: string; bbox: BBox }[] = [];
  const perChar = (bbox.x1 - bbox.x0) / Math.max(text.length, 1);
  for (const m of text.matchAll(/\S+/g)) {
    const x0 = bbox.x0 + m.index! * perChar;
    out.push({ text: m[0], bbox: { x0, y0: bbox.y0, x1: x0 + m[0].length * perChar, y1: bbox.y1 } });
  }
  return out;
}
