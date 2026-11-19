import { describe, expect, it } from "vitest";
import { documentFromText } from "@/core/pipeline";
import { redact } from "@/core/redact";
import type { Extraction } from "@/core/types";
import { locateQuote, verifyExtraction } from "@/core/verify";

const TEXT = `Stadtwerke Musterstadt
Herrn Max Muster
Musterweg 3
12345 Musterstadt
Musterstadt, 30.10.2026

Kundennummer: KD-448812
Sehr geehrter Herr Muster,
der offene Betrag von 187,40 EUR ist bis zum 20.11.2026 zu zahlen.
Gegen diesen Bescheid können Sie innerhalb eines Monats nach Bekanntgabe Widerspruch einlegen.
Die Unterlagen reichen Sie bitte spätestens am 01.12.2026 ein.`;

const doc = documentFromText(TEXT);
const red = redact(TEXT);

function run(items: Extraction["items"], letterDate: string | null = "2026-10-30") {
  return verifyExtraction(doc, red, { sender: "Stadtwerke", letterType: null, letterDate, summary: "s", urgency: "medium", items }, { state: "BE" });
}

describe("locateQuote", () => {
  it("tolerates whitespace, case and typographic quotes", () => {
    expect(locateQuote("Er sagte „Hallo   Welt“ heute", 'er sagte "hallo welt"')).not.toBeNull();
  });
});

describe("verifyExtraction", () => {
  it("verifies a correct, grounded deadline and gives it page coordinates", () => {
    const r = run([{ kind: "deadline", label: "Payment due", quote: "ist bis zum 20.11.2026 zu zahlen", date: "2026-11-20" }]);
    const item = r.items[0]!;
    expect(item.status).toBe("verified");
    expect(item.source!.boxes.length).toBe(1);
    expect(TEXT.slice(item.source!.start, item.source!.end)).toBe("ist bis zum 20.11.2026 zu zahlen");
  });

  it("flags a quote the model made up", () => {
    const r = run([{ kind: "deadline", label: "x", quote: "zahlbar bis 21.11.2026", date: "2026-11-21" }]);
    expect(r.items[0]!.status).toBe("needs_review");
    expect(r.items[0]!.issues[0]).toMatch(/could not be found/);
  });

  it("flags a real quote paired with a wrong value", () => {
    const r = run([{ kind: "amount", label: "Amount", quote: "der offene Betrag von 187,40 EUR", amountCents: 18740 + 100 }]);
    expect(r.items[0]!.status).toBe("needs_review");
    expect(r.items[0]!.issues).toContain("The amount does not appear in the quoted text.");
  });

  it("computes relative deadlines with an explanation", () => {
    const r = run([
      {
        kind: "deadline",
        label: "Objection period",
        quote: "innerhalb eines Monats nach Bekanntgabe Widerspruch einlegen",
        relative: { amount: 1, unit: "months", from: "receipt" },
      },
    ]);
    expect(r.items[0]!.status).toBe("verified");
    expect(r.items[0]!.dueDate).toBe("2026-12-03");
  });

  it("verifies a reference even though it was redacted-adjacent", () => {
    const r = run([{ kind: "reference", label: "Customer number", quote: "Kundennummer: KD-448812", text: "KD-448812" }]);
    expect(r.items[0]!.status).toBe("verified");
  });

  it("rejects a letter date that isn't in the letter", () => {
    const r = run([], "2026-10-29");
    expect(r.letterDate).toBeNull();
    expect(r.letterDateVerified).toBe(false);
  });

  it("catches deadlines the model forgot", () => {
    const r = run([{ kind: "deadline", label: "Payment due", quote: "ist bis zum 20.11.2026 zu zahlen", date: "2026-11-20" }]);
    const missed = r.items.filter((i) => i.label === "Possible deadline");
    expect(missed.map((m) => m.dueDate)).toEqual(["2026-12-01"]);
    expect(missed[0]!.status).toBe("needs_review");
  });

  it("shows real names back in quotes for the user", () => {
    const placeholder = red.spans.find((s) => s.value === "Muster")!.placeholder;
    expect(red.redactedText).toContain(`Sehr geehrter Herr ${placeholder}`);
    const r = run([{ kind: "action", label: "x", quote: `Sehr geehrter Herr ${placeholder}`, text: "Read it" }]);
    expect(r.items[0]!.quote).toBe("Sehr geehrter Herr Muster");
  });
});
