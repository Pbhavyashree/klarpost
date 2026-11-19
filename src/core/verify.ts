import { findAmounts } from "./amounts";
import { computeRelativeDeadline, DEADLINE_CUE, findDates, parseRelativePeriod, type GermanState } from "./dates";
import { rehydrate } from "./redact";
import type { BBox, Extraction, ExtractedItem, LetterDocument, Redaction, VerifiedItem, Word } from "./types";

/**
 * The trust layer. An AI model's claims are only shown as "verified" if:
 *   1. the quote it gives really exists in the letter, and
 *   2. the value it reports (date, amount, reference) really appears in that quote.
 * Everything else is shown as "needs review" with the reason. A rule-based
 * sweep also flags deadline-like dates the model didn't mention at all.
 */

export interface VerifyOptions {
  state: GermanState;
  /** If the user knows when the letter actually arrived. */
  receivedOn?: string | null;
}

export interface VerifiedLetter {
  sender: string | null;
  letterType: string | null;
  letterDate: string | null;
  letterDateVerified: boolean;
  summary: string;
  urgency: Extraction["urgency"];
  items: VerifiedItem[];
}

/** Collapse whitespace and unify look-alike characters, keeping a map back to raw offsets. */
function normalise(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i]!;
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      ch = " ";
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
      ch = ch.replace(/[„“”"]/g, '"').replace(/[‚‘’]/g, "'").replace(/[‐‑–—]/g, "-");
    }
    norm += ch.toLowerCase();
    map.push(i);
  }
  return { norm, map };
}

/** Find a quote in the text, tolerating differences in whitespace, quotes, dashes and case. */
export function locateQuote(text: string, quote: string): { start: number; end: number } | null {
  const q = quote.trim();
  if (q.length < 3) return null;
  const exact = text.indexOf(q);
  if (exact >= 0) return { start: exact, end: exact + q.length };
  const hay = normalise(text);
  const needle = normalise(q).norm;
  const at = hay.norm.indexOf(needle);
  if (at < 0) return null;
  return { start: hay.map[at]!, end: hay.map[at + needle.length - 1]! + 1 };
}

/** Boxes of all words overlapping a character range, merged into one box per line. */
export function boxesForRange(words: Word[], start: number, end: number): { page: number; bbox: BBox }[] {
  const hits = words.filter((w) => w.start < end && start < w.end);
  const lines: { page: number; bbox: BBox }[] = [];
  for (const w of hits) {
    const h = w.bbox.y1 - w.bbox.y0;
    const line = lines.find(
      (l) => l.page === w.page && Math.abs((l.bbox.y0 + l.bbox.y1) / 2 - (w.bbox.y0 + w.bbox.y1) / 2) < h / 2,
    );
    if (line) {
      line.bbox = {
        x0: Math.min(line.bbox.x0, w.bbox.x0),
        y0: Math.min(line.bbox.y0, w.bbox.y0),
        x1: Math.max(line.bbox.x1, w.bbox.x1),
        y1: Math.max(line.bbox.y1, w.bbox.y1),
      };
    } else {
      lines.push({ page: w.page, bbox: { ...w.bbox } });
    }
  }
  return lines;
}


function verifyItem(item: ExtractedItem, doc: LetterDocument, red: Redaction, letterDate: string | null, opts: VerifyOptions): VerifiedItem {
  const issues: string[] = [];
  const out: VerifiedItem = { ...item, status: "needs_review", issues };

  const loc = locateQuote(red.redactedText, item.quote);
  if (!loc) {
    issues.push("The AI's supporting quote could not be found in the letter.");
  } else {
    const orig = red.toOriginal(loc.start, loc.end);
    out.source = { ...orig, boxes: boxesForRange(doc.words, orig.start, orig.end) };
  }
  const quoteText = loc ? red.redactedText.slice(loc.start, loc.end) : item.quote;

  switch (item.kind) {
    case "amount": {
      if (item.amountCents === undefined) issues.push("No amount was given.");
      else if (loc && !findAmounts(quoteText).some((a) => a.cents === item.amountCents))
        issues.push("The amount does not appear in the quoted text.");
      break;
    }
    case "deadline": {
      if (item.date) {
        if (loc && !findDates(quoteText).some((d) => d.iso === item.date)) issues.push("The date does not appear in the quoted text.");
        out.dueDate = item.date;
        out.dueDateExplanation = ["The letter states this date explicitly."];
      } else if (item.relative) {
        const parsed = parseRelativePeriod(quoteText);
        if (loc && (!parsed || parsed.amount !== item.relative.amount || parsed.unit !== item.relative.unit))
          issues.push("The time period does not match the quoted text.");
        const result = computeRelativeDeadline({ letterDate, receivedOn: opts.receivedOn, ...item.relative, state: opts.state });
        if (result) {
          out.dueDate = result.date;
          out.dueDateExplanation = result.explanation;
        } else {
          issues.push("The letter's date is unknown, so this deadline can't be calculated. Enter the date you received it.");
        }
      } else {
        issues.push("No date or time period was given.");
      }
      if (out.dueDate && letterDate && out.dueDate < letterDate) issues.push("This date is before the letter was written.");
      break;
    }
    case "reference": {
      if (!item.text) issues.push("No reference value was given.");
      else if (loc && !locateQuote(quoteText, item.text)) issues.push("The reference does not appear in the quoted text.");
      break;
    }
    case "action":
      break;
  }

  // Put any hidden personal data back for display (it never left the server).
  out.quote = rehydrate(quoteText, red.spans);
  if (out.text) out.text = rehydrate(out.text, red.spans);

  if (issues.length === 0) out.status = "verified";
  return out;
}

/** Deadline-looking dates that the extractor did not report. */
function findMissedDeadlines(doc: LetterDocument, red: Redaction, reported: VerifiedItem[]): VerifiedItem[] {
  const missed: VerifiedItem[] = [];
  const reportedDates = new Set(reported.filter((i) => i.kind === "deadline").map((i) => i.dueDate ?? i.date));
  for (const d of findDates(red.redactedText)) {
    const before = red.redactedText.slice(Math.max(0, d.start - 40), d.start);
    if (!DEADLINE_CUE.test(before) || reportedDates.has(d.iso)) continue;
    const lineStart = red.redactedText.lastIndexOf("\n", d.start) + 1;
    const lineEndRaw = red.redactedText.indexOf("\n", d.end);
    const lineEnd = lineEndRaw === -1 ? red.redactedText.length : lineEndRaw;
    const orig = red.toOriginal(lineStart, lineEnd);
    reportedDates.add(d.iso);
    missed.push({
      kind: "deadline",
      label: "Possible deadline",
      quote: rehydrate(red.redactedText.slice(lineStart, lineEnd).trim(), red.spans),
      date: d.iso,
      dueDate: d.iso,
      status: "needs_review",
      issues: ["Found by the rule check but not reported by the AI. Please check whether this is a deadline."],
      source: { ...orig, boxes: boxesForRange(doc.words, orig.start, orig.end) },
    });
  }
  return missed;
}

export function verifyExtraction(doc: LetterDocument, red: Redaction, extraction: Extraction, opts: VerifyOptions): VerifiedLetter {
  const letterDateVerified = !!extraction.letterDate && findDates(red.redactedText).some((d) => d.iso === extraction.letterDate);
  const letterDate = letterDateVerified ? extraction.letterDate : null;
  const items = extraction.items.map((i) => verifyItem(i, doc, red, letterDate, opts));
  items.push(...findMissedDeadlines(doc, red, items));
  return {
    sender: extraction.sender,
    letterType: extraction.letterType,
    letterDate,
    letterDateVerified,
    summary: rehydrate(extraction.summary, red.spans),
    urgency: extraction.urgency,
    items,
  };
}
