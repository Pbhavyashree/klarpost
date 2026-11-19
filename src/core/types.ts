/** A rectangle on a page, in the page's own pixel/point coordinates. */
export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One word of the letter, with where it sits in the text and on the page. */
export interface Word {
  text: string;
  page: number;
  bbox: BBox;
  /** Character offsets into LetterDocument.text (end is exclusive). */
  start: number;
  end: number;
}

export interface PageInfo {
  page: number;
  width: number;
  height: number;
}

/** The letter after OCR / PDF text extraction. */
export interface LetterDocument {
  text: string;
  words: Word[];
  pages: PageInfo[];
}

export type PiiKind = "IBAN" | "BIC" | "EMAIL" | "PHONE" | "NAME" | "ADDRESS" | "TAX_ID" | "BIRTH_DATE";

export interface PiiSpan {
  kind: PiiKind;
  start: number;
  end: number;
  value: string;
  placeholder: string;
}

export interface Redaction {
  /** The text that is allowed to leave the server. */
  redactedText: string;
  spans: PiiSpan[];
  /** Map a [start,end) range in redactedText back to the original text. */
  toOriginal(start: number, end: number): { start: number; end: number };
}

export type ItemKind = "deadline" | "amount" | "reference" | "action";

/**
 * What an extractor (LLM or rules) claims. Every claim must carry a quote:
 * text copied verbatim from the (redacted) letter that supports it.
 */
export interface ExtractedItem {
  kind: ItemKind;
  label: string;
  quote: string;
  /** ISO date (YYYY-MM-DD) for absolute deadlines. */
  date?: string;
  /** For relative deadlines like "innerhalb eines Monats nach Bekanntgabe". */
  relative?: { amount: number; unit: "days" | "weeks" | "months"; from: "receipt" | "letter_date" };
  /** Amounts are stored in cents to avoid floating point errors. */
  amountCents?: number;
  currency?: string;
  /** Free text, e.g. a reference number or an action to take. */
  text?: string;
}

export interface Extraction {
  sender: string | null;
  letterType: string | null;
  letterDate: string | null;
  summary: string;
  urgency: "low" | "medium" | "high";
  items: ExtractedItem[];
}

export type VerificationStatus = "verified" | "needs_review";

export interface VerifiedItem extends ExtractedItem {
  status: VerificationStatus;
  /** Why an item needs review, in plain English. */
  issues: string[];
  /** Where the quote was found in the ORIGINAL text, if it was found. */
  source?: { start: number; end: number; boxes: { page: number; bbox: BBox }[] };
  /** For deadlines: the computed due date and how it was derived. */
  dueDate?: string;
  dueDateExplanation?: string[];
}

export interface Extractor {
  readonly name: string;
  extract(redactedText: string): Promise<Extraction>;
}
