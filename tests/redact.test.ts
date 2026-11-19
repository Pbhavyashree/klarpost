import { describe, expect, it } from "vitest";
import { isValidIban, redact, rehydrate } from "@/core/redact";

const LETTER = `Finanzamt Musterstadt
Frau Anna Beispiel
Beispielstraße 12a
10115 Berlin

Steuernummer: 13/123/45678
Ihre Steuer-ID: 12 345 678 901
Geburtsdatum: 03.04.1991

Sehr geehrte Frau Beispiel,
bitte überweisen Sie 1.234,56 EUR auf das Konto
IBAN DE89 3704 0044 0532 0130 00, BIC COBADEFFXXX.
Rückfragen: Tel. 030 1234567 oder anna.beispiel@example.org
Mit freundlichen Grüßen
Sehr geehrte Damen und Herren`;

describe("isValidIban", () => {
  it("accepts a valid German IBAN with spaces", () => {
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
  });
  it("rejects a wrong checksum", () => {
    expect(isValidIban("DE88 3704 0044 0532 0130 00")).toBe(false);
  });
});

describe("redact", () => {
  const r = redact(LETTER);

  it("hides every piece of personal data", () => {
    for (const secret of [
      "Anna",
      "Beispiel",
      "Beispielstraße 12a",
      "10115 Berlin",
      "13/123/45678",
      "12 345 678 901",
      "03.04.1991",
      "DE89 3704 0044 0532 0130 00",
      "COBADEFFXXX",
      "030 1234567",
      "anna.beispiel@example.org",
    ]) {
      expect(r.redactedText, `leaked: ${secret}`).not.toContain(secret);
    }
  });

  it("keeps what the AI needs: amounts, the sender and ordinary words", () => {
    expect(r.redactedText).toContain("1.234,56 EUR");
    expect(r.redactedText).toContain("Finanzamt Musterstadt");
    expect(r.redactedText).toContain("Sehr geehrte Damen und Herren");
  });

  it("gives the same value the same placeholder", () => {
    const surname = r.spans.filter((s) => s.value === "Beispiel").map((s) => s.placeholder);
    expect(surname.length).toBeGreaterThanOrEqual(1);
    expect(new Set(surname).size).toBe(1);
  });

  it("maps positions in the redacted text back to the original", () => {
    const at = r.redactedText.indexOf("1.234,56 EUR");
    const back = r.toOriginal(at, at + "1.234,56 EUR".length);
    expect(LETTER.slice(back.start, back.end)).toBe("1.234,56 EUR");

    const iban = r.spans.find((s) => s.kind === "IBAN")!;
    const p = r.redactedText.indexOf(iban.placeholder);
    const ibanBack = r.toOriginal(p, p + iban.placeholder.length);
    expect(LETTER.slice(ibanBack.start, ibanBack.end)).toBe("DE89 3704 0044 0532 0130 00");
  });

  it("puts real values back into model output", () => {
    const iban = r.spans.find((s) => s.kind === "IBAN")!;
    expect(rehydrate(`Pay to ${iban.placeholder}`, r.spans)).toBe("Pay to DE89 3704 0044 0532 0130 00");
  });

  it("does not mistake an amount in euros for a postcode", () => {
    expect(redact("Bitte zahlen Sie 12000 Euro").redactedText).toContain("12000 Euro");
  });
});
