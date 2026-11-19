import { findAmounts } from "../amounts";
import { DEADLINE_CUE, daysBetween, findDates, parseRelativePeriod } from "../dates";
import type { Extraction, ExtractedItem, Extractor } from "../types";

/**
 * A deterministic, offline extractor built from regular expressions.
 * It runs without an API key (local development, CI, demos) and acts as the
 * baseline the AI extractor is measured against in the evaluation suite.
 */

const REFERENCE_LABEL =
  /(Aktenzeichen|Az\.|Kassenzeichen|Beitragsnummer|Kundennummer|Vorgangsnummer|Geschäftszeichen|Mitgliedsnummer|Versichertennummer|Rechnungsnummer|Bußgeldnummer|Steuernummer|Buchungszeichen)\s*:?\s*([A-Z0-9\[][A-Za-z0-9 ./\-\[\]_]{2,30}[A-Za-z0-9\]])/g;
const AMOUNT_LABELS: [RegExp, string][] = [
  [/nachzahl|zu zahlen|offen(?:er|e)? (?:betrag|forderung)|gesamtbetrag|zahlbetrag|bitte (?:zahlen|überweisen)/i, "Amount to pay"],
  [/erstatt|gutschrift/i, "Refund"],
  [/mahngebühr|säumniszuschlag/i, "Late fee"],
  [/verwarnungsgeld|bußgeld|rückständig|in höhe von/i, "Amount to pay"],
  [/beitr[aä]g/i, "Contribution"],
];

function deadlineLabel(context: string): string {
  if (/termin/i.test(context)) return "Appointment";
  if (/einspruch|widerspruch|klage/i.test(context)) return "Objection period";
  if (/zahl|überweis|entricht/i.test(context)) return "Payment due";
  if (/einreich|unterlagen|vordruck|zurück/i.test(context)) return "Send documents";
  return "Deadline";
}

function templateSummary(sender: string | null, items: ExtractedItem[]): string {
  const from = sender ? `This letter from ${sender}` : "This letter";
  const deadlines = items.filter((i) => i.kind === "deadline");
  const pay = items.find((i) => i.kind === "amount" && i.label === "Amount to pay");
  const parts = [`${from} was read with the offline rules engine, which finds dates, amounts and reference numbers but can't explain the content.`];
  if (pay?.amountCents) parts.push(`It mentions an amount to pay of ${(pay.amountCents / 100).toFixed(2).replace(".", ",")} €.`);
  if (deadlines.length) parts.push(`It contains ${deadlines.length === 1 ? "one deadline" : `${deadlines.length} deadlines`}, listed below.`);
  else parts.push("No deadline was found; check the letter yourself to be sure.");
  return parts.join(" ");
}

function lineAround(text: string, start: number, end: number) {
  const s = text.lastIndexOf("\n", start - 1) + 1;
  const e = text.indexOf("\n", end);
  return text.slice(s, e === -1 ? text.length : e).trim();
}

/**
 * The sentence around a match. Real letters wrap lines mid-sentence, so a
 * single line break doesn't end a sentence; a full stop or a blank line does.
 */
function sentenceAround(text: string, start: number, end: number) {
  const before = text.slice(0, start);
  const s = Math.max(before.lastIndexOf(". "), before.lastIndexOf(".\n"), before.lastIndexOf("\n\n"), before.lastIndexOf(":\n")) + 1;
  const rest = text.slice(end);
  const stop = rest.search(/[.!?](?=\s|$)|\n\s*\n/);
  const e = stop === -1 ? text.length : end + stop + (/[.!?]/.test(rest[stop] ?? "") ? 1 : 0);
  return text.slice(s, e).trim();
}

function guessLetterDate(text: string): string | null {
  const labelled = /(?:^|\n)\s*(?:Datum|Bescheiddatum|Schreiben vom)\s*:?\s*([^\n]+)/i.exec(text);
  if (labelled) {
    const d = findDates(labelled[1]!)[0];
    if (d) return d.iso;
  }
  const cityLine = /(?:^|\n)[^\n]{2,40},\s*(?:den\s+)?(\d{1,2}\.[^\n]{3,15}\d{2,4})\s*(?:\n|$)/.exec(text);
  if (cityLine) {
    const d = findDates(cityLine[1]!)[0];
    if (d) return d.iso;
  }
  const head = text.slice(0, Math.ceil(text.length * 0.35));
  const dates = findDates(head).filter((d) => !DEADLINE_CUE.test(head.slice(Math.max(0, d.start - 40), d.start)));
  return dates[0]?.iso ?? null;
}

export class RulesExtractor implements Extractor {
  readonly name = "rules";

  async extract(text: string): Promise<Extraction> {
    const items: ExtractedItem[] = [];
    const letterDate = guessLetterDate(text);

    for (const d of findDates(text)) {
      const before = text.slice(Math.max(0, d.start - 40), d.start);
      if (!DEADLINE_CUE.test(before)) continue;
      const line = lineAround(text, d.start, d.end);
      items.push({ kind: "deadline", label: deadlineLabel(line), quote: line, date: d.iso });
    }

    for (const m of text.matchAll(/(?:innerhalb|binnen)\s+(?:von\s+)?\S+\s+(?:Tag|Woche|Monat)\w*[^.\n]*/gi)) {
      const period = parseRelativePeriod(m[0]);
      if (!period || m.index === undefined) continue;
      const sentence = sentenceAround(text, m.index, m.index + m[0].length);
      items.push({ kind: "deadline", label: deadlineLabel(sentence), quote: sentence, relative: period });
    }

    const seenAmounts = new Set<number>();
    for (const a of findAmounts(text)) {
      if (seenAmounts.has(a.cents) || a.cents === 0) continue;
      const line = lineAround(text, a.start, a.end);
      // Label from the sentence the amount is in, so a line mentioning several amounts doesn't mislabel them.
      const sentence = sentenceAround(text, a.start, a.end);
      const label = AMOUNT_LABELS.find(([re]) => re.test(sentence))?.[1];
      if (!label) continue;
      seenAmounts.add(a.cents);
      items.push({ kind: "amount", label, quote: sentence.length <= line.length ? sentence : line, amountCents: a.cents, currency: "EUR" });
    }

    for (const m of text.matchAll(REFERENCE_LABEL)) {
      if (m.index === undefined) continue;
      items.push({ kind: "reference", label: m[1]!.replace(/\.$/, ""), quote: m[0].trim(), text: m[2]!.trim() });
    }

    const sender = text.split("\n").map((l) => l.trim()).find((l) => l.length > 3) ?? null;
    const firstDue = items
      .map((i) => i.date)
      .filter((d): d is string => !!d)
      .sort()[0];
    const urgency = firstDue && letterDate && daysBetween(letterDate, firstDue) <= 14 ? "high" : items.some((i) => i.kind === "deadline") ? "medium" : "low";

    return {
      sender,
      letterType: null,
      letterDate,
      summary: templateSummary(sender, items),
      urgency,
      items,
    };
  }
}
