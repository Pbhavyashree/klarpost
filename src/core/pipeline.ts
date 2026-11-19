import type { GermanState } from "./dates";
import { AnthropicExtractor } from "./extractors/anthropic";
import { RulesExtractor } from "./extractors/rules";
import { redact } from "./redact";
import type { Extractor, LetterDocument, PiiSpan } from "./types";
import { verifyExtraction, type VerifiedLetter } from "./verify";

export interface AnalysisResult extends VerifiedLetter {
  extractor: string;
  /** Exactly what was sent to the AI model, so the user can audit it. */
  sentToModel: string;
  /** What was hidden, by kind and position (values stay on the server). */
  redactions: Omit<PiiSpan, "value">[];
}

export function defaultExtractor(): Extractor {
  return process.env.ANTHROPIC_API_KEY ? new AnthropicExtractor() : new RulesExtractor();
}

export async function analyseLetter(
  doc: LetterDocument,
  opts: { state: GermanState; receivedOn?: string | null; extractor?: Extractor },
): Promise<AnalysisResult> {
  const extractor = opts.extractor ?? defaultExtractor();
  const redaction = redact(doc.text);
  const extraction = await extractor.extract(redaction.redactedText);
  const verified = verifyExtraction(doc, redaction, extraction, { state: opts.state, receivedOn: opts.receivedOn });
  return {
    ...verified,
    extractor: extractor.name,
    sentToModel: redaction.redactedText,
    redactions: redaction.spans.map(({ value: _value, ...rest }) => rest),
  };
}

/** Build a LetterDocument from plain text (pasted letters, tests). Words get synthetic boxes on one virtual page. */
export function documentFromText(text: string): LetterDocument {
  const words = [];
  let line = 0;
  let lineStart = 0;
  for (const m of text.matchAll(/\S+|\n/g)) {
    if (m[0] === "\n") {
      line++;
      lineStart = m.index! + 1;
      continue;
    }
    const col = m.index! - lineStart;
    words.push({
      text: m[0],
      page: 1,
      start: m.index!,
      end: m.index! + m[0].length,
      bbox: { x0: col * 8, y0: line * 18, x1: (col + m[0].length) * 8, y1: line * 18 + 14 },
    });
  }
  return { text, words, pages: [{ page: 1, width: 800, height: (line + 1) * 18 }] };
}
