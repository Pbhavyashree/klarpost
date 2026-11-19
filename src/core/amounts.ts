/** Find money amounts written the German way: "1.234,56 EUR", "€ 18,36", "18,36 Euro", "25 €". */
export const AMOUNT_PATTERN =
  /(?:(?:EUR|€)\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)(?!\d))|(?:(?<![\d.,])(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)\s?(?:EUR\b|Euro\b|€))/g;

export function parseAmountToCents(raw: string): number {
  const [euros, cents = "0"] = raw.replace(/\./g, "").split(",");
  return Number(euros) * 100 + Number(cents.padEnd(2, "0").slice(0, 2));
}

export function findAmounts(text: string): { cents: number; start: number; end: number; raw: string }[] {
  const out: { cents: number; start: number; end: number; raw: string }[] = [];
  for (const m of text.matchAll(AMOUNT_PATTERN)) {
    const num = m[1] ?? m[2];
    if (!num || m.index === undefined) continue;
    out.push({ cents: parseAmountToCents(num), start: m.index, end: m.index + m[0].length, raw: m[0] });
  }
  return out;
}

export function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}
