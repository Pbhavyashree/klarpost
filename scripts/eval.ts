/**
 * Usage:
 *   npm run eval                 # offline rules engine only
 *   ANTHROPIC_API_KEY=... npm run eval   # rules engine AND the AI model, side by side
 * Writes eval/REPORT.md and exits non-zero if any personal data would leak.
 */
import { writeFileSync } from "node:fs";
import { AnthropicExtractor } from "../src/core/extractors/anthropic";
import { RulesExtractor } from "../src/core/extractors/rules";
import { LETTERS } from "../eval/letters";
import { runEval, toMarkdown, wrapLetter } from "../eval/run";

const extractors = [new RulesExtractor(), ...(process.env.ANTHROPIC_API_KEY ? [new AnthropicExtractor()] : [])];
const results = [];
for (const e of extractors) {
  console.log(`Evaluating ${e.name}…`);
  results.push(await runEval(e));
  // Same letters with lines wrapped mid-sentence, as OCR and PDFs produce them.
  results.push({ ...(await runEval(e, LETTERS.map((l) => wrapLetter(l, 60)))), extractor: `${e.name} (wrapped)` });
}
const md = toMarkdown(results);
writeFileSync(new URL("../eval/REPORT.md", import.meta.url), md);
console.log(md);

if (results.some((r) => r.piiLeakCount > 0)) {
  console.error("FAIL: personal data would be sent to the AI.");
  process.exit(1);
}
