import { analyseLetter, documentFromText } from "../src/core/pipeline";
import { redact } from "../src/core/redact";
import type { Extractor } from "../src/core/types";
import { LETTERS, type EvalLetter } from "./letters";

export interface LetterScore {
  id: string;
  piiLeaks: string[];
  letterDateCorrect: boolean;
  deadlines: { expected: number; found: number; falsePositives: number };
  amounts: { expected: number; found: number; falsePositives: number };
  references: { expected: number; found: number };
  items: number;
  verified: number;
  error?: string;
}

export interface EvalSummary {
  extractor: string;
  letters: LetterScore[];
  piiLeakCount: number;
  letterDateAccuracy: number;
  deadlineRecall: number;
  deadlinePrecision: number;
  amountRecall: number;
  amountPrecision: number;
  referenceRecall: number;
  verifiedShare: number;
}

const ratio = (a: number, b: number) => (b === 0 ? 1 : a / b);

async function scoreLetter(letter: EvalLetter, extractor: Extractor): Promise<LetterScore> {
  const sent = redact(letter.text).redactedText;
  const piiLeaks = letter.pii.filter((p) => sent.includes(p));
  const base: LetterScore = {
    id: letter.id,
    piiLeaks,
    letterDateCorrect: false,
    deadlines: { expected: letter.expected.deadlines.length, found: 0, falsePositives: 0 },
    amounts: { expected: letter.expected.amountsCents.length, found: 0, falsePositives: 0 },
    references: { expected: letter.expected.references.length, found: 0 },
    items: 0,
    verified: 0,
  };

  try {
    const r = await analyseLetter(documentFromText(letter.text), { state: letter.state, extractor });
    // Only VERIFIED items count as correct answers: that's what the user would rely on.
    const verified = r.items.filter((i) => i.status === "verified");
    const dueDates = new Set(verified.filter((i) => i.kind === "deadline").map((i) => i.dueDate));
    const amounts = new Set(verified.filter((i) => i.kind === "amount").map((i) => i.amountCents));
    const refs = verified.filter((i) => i.kind === "reference").map((i) => (i.text ?? "").trim());

    base.letterDateCorrect = r.letterDate === letter.expected.letterDate;
    base.deadlines.found = letter.expected.deadlines.filter((d) => dueDates.has(d)).length;
    base.deadlines.falsePositives = [...dueDates].filter((d) => !letter.expected.deadlines.includes(d!)).length;
    base.amounts.found = letter.expected.amountsCents.filter((a) => amounts.has(a)).length;
    base.amounts.falsePositives = [...amounts].filter((a) => !letter.expected.amountsCents.includes(a!)).length;
    base.references.found = letter.expected.references.filter((ref) => refs.includes(ref)).length;
    const fromModel = r.items.filter((i) => i.label !== "Possible deadline");
    base.items = fromModel.length;
    base.verified = fromModel.filter((i) => i.status === "verified").length;
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
  }
  return base;
}

/** Re-wrap a letter's lines at `width` characters, like a scan or PDF would. */
export function wrapLetter(letter: EvalLetter, width: number): EvalLetter {
  const text = letter.text
    .split("\n")
    .map((line) => {
      const out: string[] = [];
      let current = "";
      for (const word of line.split(" ")) {
        if (current && (current + " " + word).length > width) {
          out.push(current);
          current = word;
        } else current = current ? `${current} ${word}` : word;
      }
      out.push(current);
      return out.join("\n");
    })
    .join("\n");
  return { ...letter, id: `${letter.id} (wrapped)`, text };
}

export async function runEval(extractor: Extractor, letters = LETTERS): Promise<EvalSummary> {
  const scores: LetterScore[] = [];
  for (const l of letters) scores.push(await scoreLetter(l, extractor));
  const sum = (f: (s: LetterScore) => number) => scores.reduce((a, s) => a + f(s), 0);

  const dFound = sum((s) => s.deadlines.found);
  const aFound = sum((s) => s.amounts.found);
  return {
    extractor: extractor.name,
    letters: scores,
    piiLeakCount: sum((s) => s.piiLeaks.length),
    letterDateAccuracy: ratio(sum((s) => (s.letterDateCorrect ? 1 : 0)), scores.length),
    deadlineRecall: ratio(dFound, sum((s) => s.deadlines.expected)),
    deadlinePrecision: ratio(dFound, dFound + sum((s) => s.deadlines.falsePositives)),
    amountRecall: ratio(aFound, sum((s) => s.amounts.expected)),
    amountPrecision: ratio(aFound, aFound + sum((s) => s.amounts.falsePositives)),
    referenceRecall: ratio(sum((s) => s.references.found), sum((s) => s.references.expected)),
    verifiedShare: ratio(sum((s) => s.verified), sum((s) => s.items)),
  };
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export function toMarkdown(results: EvalSummary[]): string {
  const rows: [string, (s: EvalSummary) => string][] = [
    ["Personal data leaked to the AI", (s) => String(s.piiLeakCount)],
    ["Letter date correct", (s) => pct(s.letterDateAccuracy)],
    ["Deadlines found (recall)", (s) => pct(s.deadlineRecall)],
    ["Deadlines correct (precision)", (s) => pct(s.deadlinePrecision)],
    ["Amounts found (recall)", (s) => pct(s.amountRecall)],
    ["Amounts correct (precision)", (s) => pct(s.amountPrecision)],
    ["References found", (s) => pct(s.referenceRecall)],
    ["Claims that passed verification", (s) => pct(s.verifiedShare)],
  ];
  let md = `# Extraction accuracy\n\nRun on ${LETTERS.length} fictional sample letters (\`eval/letters.ts\`). Only verified items count as correct.\n\n`;
  md += `| Metric | ${results.map((r) => r.extractor).join(" | ")} |\n|---|${results.map(() => "---:").join("|")}|\n`;
  for (const [label, f] of rows) md += `| ${label} | ${results.map(f).join(" | ")} |\n`;
  for (const r of results) {
    md += `\n## ${r.extractor}: per letter\n\n| Letter | Deadlines | Amounts | References | Verified claims | Notes |\n|---|---|---|---|---|---|\n`;
    for (const s of r.letters) {
      const notes = [s.error, s.piiLeaks.length ? `LEAKED: ${s.piiLeaks.join(", ")}` : "", s.letterDateCorrect ? "" : "letter date wrong"]
        .filter(Boolean)
        .join("; ");
      md += `| ${s.id} | ${s.deadlines.found}/${s.deadlines.expected}${s.deadlines.falsePositives ? ` (+${s.deadlines.falsePositives} wrong)` : ""} | ${s.amounts.found}/${s.amounts.expected}${s.amounts.falsePositives ? ` (+${s.amounts.falsePositives} wrong)` : ""} | ${s.references.found}/${s.references.expected} | ${s.verified}/${s.items} | ${notes} |\n`;
    }
  }
  return md;
}
