import type { PiiKind, PiiSpan, Redaction } from "./types";

/**
 * Personal data is replaced with placeholders like [IBAN_1] BEFORE any text is
 * sent to an AI model. The same value always gets the same placeholder, so the
 * model can still reason about it ("pay to [IBAN_1]") and we can put the real
 * value back afterwards. Detection is deliberately conservative: it is better
 * to hide a harmless word than to leak an IBAN.
 */

interface Candidate {
  kind: PiiKind;
  start: number;
  end: number;
}

/** Lower number wins when two detections overlap. */
const PRIORITY: Record<PiiKind, number> = {
  IBAN: 0,
  EMAIL: 1,
  TAX_ID: 2,
  BIRTH_DATE: 3,
  PHONE: 4,
  BIC: 5,
  NAME: 6,
  ADDRESS: 7,
};

const UPPER = "A-ZÄÖÜ";
const LOWER = "a-zäöüß";

/** ISO 13616 mod-97 check, so random letter/number strings aren't hidden as IBANs. */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("DE") && iban.length !== 22) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** Push every match of `re`, using capture group `group` (0 = whole match) as the span. */
function collect(text: string, re: RegExp, kind: PiiKind, out: Candidate[], group = 0, accept?: (v: string) => boolean) {
  for (const m of text.matchAll(re)) {
    const value = m[group];
    if (!value || m.index === undefined) continue;
    if (accept && !accept(value)) continue;
    const offset = group === 0 ? 0 : m[0].indexOf(value);
    const start = m.index + offset;
    // Trim trailing whitespace that a pattern may have swallowed.
    const trimmed = value.replace(/\s+$/, "");
    out.push({ kind, start, end: start + trimmed.length });
  }
}

export function detectPii(text: string): Candidate[] {
  const found: Candidate[] = [];

  collect(text, /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g, "IBAN", found, 0, isValidIban);
  collect(text, /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "EMAIL", found);
  // Steuer-ID / Steuernummer only when labelled, so case numbers don't vanish.
  collect(
    text,
    /(?:Steuer-?ID|Steuerliche Identifikationsnummer|Identifikationsnummer|IdNr\.?|Steuernummer|St\.-?Nr\.?)[ \t]*:?[ \t]*(\d[\d /]{8,16}\d)/gi,
    "TAX_ID",
    found,
    1,
  );
  collect(
    text,
    /(?:geb(?:\.|oren)[ \t]+am|Geburtsdatum)[ \t]*:?[ \t]*(\d{1,2}\.\d{1,2}\.\d{2,4})/gi,
    "BIRTH_DATE",
    found,
    1,
  );
  collect(text, /(?:\+49|0049)[ \t]?[1-9][\d \/-]{5,}\d/g, "PHONE", found);
  collect(text, /(?:Tel(?:efon)?\.?|Fax|Mobil|Handy)[ \t]*:?[ \t]*(0[1-9][\d \/-]{4,}\d)/gi, "PHONE", found, 1);
  collect(text, /\bBIC[ \t]*:?[ \t]*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/g, "BIC", found, 1);

  // Names: "Frau Anna Beispiel", "Herrn Dr. Max Muster", "Sehr geehrte Frau Beispiel"
  const nameRe = new RegExp(
    `\\b(?:Frau|Herrn?)\\b[ \\t]+(?:(?:Dr|Prof)\\.[ \\t]+)*((?:[${UPPER}][${LOWER}]+(?:-[${UPPER}][${LOWER}]+)?[ \\t]?){1,3})`,
    "g",
  );
  collect(text, nameRe, "NAME", found, 1);
  collect(text, new RegExp(`^[ \\t]*Name[ \\t]*:[ \\t]*([${UPPER}][^\\n,]{2,40})$`, "gim"), "NAME", found, 1);

  // Street lines ("Beispielstraße 12a") and postcode + city ("10115 Berlin").
  collect(
    text,
    new RegExp(
      `[${UPPER}][${LOWER}${UPPER}.-]*(?:[ \\t][${UPPER}][${LOWER}.-]*)*(?:straße|strasse|str\\.|weg|allee|platz|ring|damm|gasse|chaussee|ufer)[ \\t]+\\d+[a-z]?\\b`,
      "g",
    ),
    "ADDRESS",
    found,
  );
  // Separate-word streets: "Schönhauser Allee 150", "Am Friedrichshain 22", "Unter den Linden 5".
  collect(
    text,
    new RegExp(
      `(?:\\b(?:Am|An der|Im|Auf dem|Unter den|Zum|Zur)[ \\t]+[${UPPER}][${LOWER}-]+|[${UPPER}][${LOWER}-]+[ \\t]+(?:Allee|Damm|Ring|Platz|Weg|Straße|Strasse|Ufer|Chaussee|Gasse|Steig|Markt|Promenade))[ \\t]+\\d{1,4}[a-z]?\\b`,
      "g",
    ),
    "ADDRESS",
    found,
  );
  // Safety net for address blocks: any "<words> <house number>" line directly above a postcode line.
  collect(
    text,
    new RegExp(`^[ \\t]*([${UPPER}][^\\n,\\d]{2,40}[ \\t]+\\d{1,4}[a-z]?)[ \\t]*\\n[ \\t]*\\d{5}[ \\t]`, "gm"),
    "ADDRESS",
    found,
    1,
  );
  collect(
    text,
    new RegExp(`\\b\\d{5}[ \\t]+(?!EUR\\b|Euro\\b)[${UPPER}][${LOWER}-]+(?:[ \\t](?:an der|am|im)[ \\t][${UPPER}][${LOWER}]+)?`, "g"),
    "ADDRESS",
    found,
  );

  // A name found once (in the address block) is also hidden everywhere else,
  // e.g. the surname in "Sehr geehrte Frau Beispiel" or in the body text.
  const nameTokens = new Set<string>();
  for (const c of found) {
    if (c.kind !== "NAME") continue;
    for (const token of text.slice(c.start, c.end).split(/[ \t]+/)) if (token.length > 2) nameTokens.add(token);
  }
  for (const token of nameTokens) {
    collect(text, new RegExp(`\\b${escapeRegExp(token)}\\b`, "g"), "NAME", found);
  }

  return resolveOverlaps(found);
}

function resolveOverlaps(candidates: Candidate[]): Candidate[] {
  const sorted = [...candidates].sort(
    (a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const kept: Candidate[] = [];
  for (const c of sorted) {
    if (c.end <= c.start) continue;
    if (kept.some((k) => c.start < k.end && k.start < c.end)) continue;
    kept.push(c);
  }
  return kept.sort((a, b) => a.start - b.start);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Segment {
  redStart: number;
  redEnd: number;
  origStart: number;
  origEnd: number;
  placeholder: boolean;
}

export function redact(text: string): Redaction {
  const candidates = detectPii(text);
  const counters = new Map<PiiKind, number>();
  const byValue = new Map<string, string>();
  const spans: PiiSpan[] = [];
  const segments: Segment[] = [];

  let out = "";
  let cursor = 0;
  const pushPlain = (origStart: number, origEnd: number) => {
    if (origEnd <= origStart) return;
    segments.push({ redStart: out.length, redEnd: out.length + (origEnd - origStart), origStart, origEnd, placeholder: false });
    out += text.slice(origStart, origEnd);
  };

  for (const c of candidates) {
    pushPlain(cursor, c.start);
    const value = text.slice(c.start, c.end);
    const key = `${c.kind}:${normaliseValue(c.kind, value)}`;
    let placeholder = byValue.get(key);
    if (!placeholder) {
      const n = (counters.get(c.kind) ?? 0) + 1;
      counters.set(c.kind, n);
      placeholder = `[${c.kind}_${n}]`;
      byValue.set(key, placeholder);
    }
    segments.push({ redStart: out.length, redEnd: out.length + placeholder.length, origStart: c.start, origEnd: c.end, placeholder: true });
    spans.push({ kind: c.kind, start: c.start, end: c.end, value, placeholder });
    out += placeholder;
    cursor = c.end;
  }
  pushPlain(cursor, text.length);

  const mapPoint = (pos: number, side: "start" | "end"): number => {
    for (const s of segments) {
      const inside = side === "start" ? pos >= s.redStart && pos < s.redEnd : pos > s.redStart && pos <= s.redEnd;
      if (!inside) continue;
      if (s.placeholder) return side === "start" ? s.origStart : s.origEnd;
      return s.origStart + (pos - s.redStart);
    }
    return side === "start" ? text.length : 0;
  };

  return {
    redactedText: out,
    spans,
    toOriginal: (start, end) => ({ start: mapPoint(start, "start"), end: mapPoint(end, "end") }),
  };
}

function normaliseValue(kind: PiiKind, value: string): string {
  if (kind === "IBAN" || kind === "PHONE" || kind === "TAX_ID") return value.replace(/[\s/-]/g, "");
  return value.trim().toLowerCase();
}

/** Put real values back into text the model wrote, e.g. a reply draft. */
export function rehydrate(text: string, spans: PiiSpan[]): string {
  const map = new Map(spans.map((s) => [s.placeholder, s.value]));
  return text.replace(/\[(?:IBAN|BIC|EMAIL|PHONE|NAME|ADDRESS|TAX_ID|BIRTH_DATE)_\d+\]/g, (p) => map.get(p) ?? p);
}
