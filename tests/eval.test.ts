import { describe, expect, it } from "vitest";
import { RulesExtractor } from "@/core/extractors/rules";
import { LETTERS } from "../eval/letters";
import { runEval, wrapLetter } from "../eval/run";

/** CI gate: these numbers may only go up. */
describe("evaluation suite (offline rules engine)", () => {
  it("never sends personal data to the AI and keeps accuracy above the baseline", async () => {
    const r = await runEval(new RulesExtractor());
    expect(r.piiLeakCount).toBe(0);
    expect(r.deadlinePrecision).toBe(1);
    expect(r.amountPrecision).toBe(1);
    expect(r.deadlineRecall).toBeGreaterThanOrEqual(0.8);
    expect(r.letterDateAccuracy).toBeGreaterThanOrEqual(0.9);
  });

  it("copes with lines wrapped mid-sentence, as in scans and PDFs", async () => {
    const r = await runEval(new RulesExtractor(), LETTERS.map((l) => wrapLetter(l, 60)));
    expect(r.piiLeakCount).toBe(0);
    expect(r.deadlinePrecision).toBe(1);
    expect(r.amountRecall).toBeGreaterThanOrEqual(0.9);
    expect(r.deadlineRecall).toBeGreaterThanOrEqual(0.8);
  });
});
