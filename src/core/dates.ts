/**
 * German date parsing and deadline arithmetic. All maths uses UTC date-only
 * values so a server in another time zone can't shift a deadline by a day.
 */

export type GermanState = "BW" | "BY" | "BE" | "BB" | "HB" | "HH" | "HE" | "MV" | "NI" | "NW" | "RP" | "SL" | "SN" | "ST" | "SH" | "TH";

const MONTHS: Record<string, number> = {
  januar: 1, jan: 1, jänner: 1,
  februar: 2, feb: 2,
  märz: 3, maerz: 3, mär: 3, mrz: 3,
  april: 4, apr: 4,
  mai: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11,
  dezember: 12, dez: 12,
};

export function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function isoOf(date: Date): string {
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function isRealDate(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function expandYear(y: number) {
  return y < 100 ? 2000 + y : y;
}

export const DATE_PATTERN = new RegExp(
  String.raw`\b(\d{1,2})\.\s?(?:(\d{1,2})\.\s?(\d{4}|\d{2})\b|(` + Object.keys(MONTHS).join("|") + String.raw`)\.?\s+(\d{4}))`,
  "gi",
);

/** Parse "12.11.2026", "12.11.26", "12. November 2026" or "1. Dez. 2026" into ISO. */
export function parseGermanDate(input: string): string | null {
  const re = new RegExp(DATE_PATTERN.source, "i");
  const m = re.exec(input);
  if (!m) return null;
  const day = Number(m[1]);
  const month = m[2] ? Number(m[2]) : MONTHS[(m[4] ?? "").toLowerCase()];
  const year = expandYear(Number(m[3] ?? m[5]));
  if (!month || !isRealDate(year, month, day)) return null;
  return toIso(year, month, day);
}

/** Every date in a text, with its position. */
export function findDates(text: string): { iso: string; start: number; end: number; raw: string }[] {
  const out: { iso: string; start: number; end: number; raw: string }[] = [];
  for (const m of text.matchAll(DATE_PATTERN)) {
    const iso = parseGermanDate(m[0]);
    if (iso && m.index !== undefined) out.push({ iso, start: m.index, end: m.index + m[0].length, raw: m[0] });
  }
  return out;
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoOf(d);
}

/** Same day number n months later; if that day doesn't exist, the last day of the month (§ 188 Abs. 3 BGB). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = (((targetMonthIndex % 12) + 12) % 12) + 1;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return toIso(ty, tm, Math.min(d, lastDay));
}

export function weekday(iso: string): number {
  return fromIso(iso).getUTCDay();
}

export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  return Math.round((fromIso(toIsoDate).getTime() - fromIso(fromIsoDate).getTime()) / 86_400_000);
}

/** Easter Sunday (Anonymous Gregorian algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso(year, month, day);
}

/** Public holidays that close offices, nationwide plus the given state's own. */
export function publicHolidays(year: number, state: GermanState): Map<string, string> {
  const easter = easterSunday(year);
  const h = new Map<string, string>([
    [toIso(year, 1, 1), "Neujahr"],
    [addDays(easter, -2), "Karfreitag"],
    [addDays(easter, 1), "Ostermontag"],
    [toIso(year, 5, 1), "Tag der Arbeit"],
    [addDays(easter, 39), "Christi Himmelfahrt"],
    [addDays(easter, 50), "Pfingstmontag"],
    [toIso(year, 10, 3), "Tag der Deutschen Einheit"],
    [toIso(year, 12, 25), "1. Weihnachtstag"],
    [toIso(year, 12, 26), "2. Weihnachtstag"],
  ]);
  const add = (states: GermanState[], iso: string, name: string) => {
    if (states.includes(state)) h.set(iso, name);
  };
  add(["BW", "BY", "ST"], toIso(year, 1, 6), "Heilige Drei Könige");
  add(["BE", "MV"], toIso(year, 3, 8), "Internationaler Frauentag");
  add(["BB"], easter, "Ostersonntag");
  add(["BB"], addDays(easter, 49), "Pfingstsonntag");
  add(["BW", "BY", "HE", "NW", "RP", "SL"], addDays(easter, 60), "Fronleichnam");
  add(["SL"], toIso(year, 8, 15), "Mariä Himmelfahrt");
  add(["TH"], toIso(year, 9, 20), "Weltkindertag");
  add(["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"], toIso(year, 10, 31), "Reformationstag");
  add(["BW", "BY", "NW", "RP", "SL"], toIso(year, 11, 1), "Allerheiligen");
  if (state === "SN") {
    // Buß- und Bettag: the Wednesday before 23 November.
    let d = toIso(year, 11, 22);
    while (weekday(d) !== 3) d = addDays(d, -1);
    h.set(d, "Buß- und Bettag");
  }
  return h;
}

export function isWorkingDay(iso: string, state: GermanState): boolean {
  const wd = weekday(iso);
  if (wd === 0 || wd === 6) return false;
  return !publicHolidays(Number(iso.slice(0, 4)), state).has(iso);
}

/** If a deadline ends on a weekend or public holiday, it moves to the next working day (§ 193 BGB, § 108 Abs. 3 AO). */
export function rollToWorkingDay(iso: string, state: GermanState): { date: string; reason: string | null } {
  let d = iso;
  let reason: string | null = null;
  while (!isWorkingDay(d, state)) {
    const wd = weekday(d);
    const holiday = publicHolidays(Number(d.slice(0, 4)), state).get(d);
    reason ??= holiday ? `${formatDe(d)} is a public holiday (${holiday})` : `${formatDe(d)} is a ${wd === 6 ? "Saturday" : "Sunday"}`;
    d = addDays(d, 1);
  }
  return { date: d, reason };
}

/** Human-friendly German-style date for explanations: "Mo, 30.11.2026". */
export function formatDe(iso: string): string {
  const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const [y, m, d] = iso.split("-");
  return `${names[weekday(iso)]}, ${d}.${m}.${y}`;
}

/** Words that, right before a date, mark it as a deadline or appointment. */
export const DEADLINE_CUE =
  /(?:bis\s+(?:zum|spätestens)|spätestens(?:\s+(?:am|bis))?|Frist|fällig(?:\s+am)?|zahlbar\s+bis|Termin(?:\s+am)?|einzureichen\s+bis)\s*:?\s*(?:(?:am\s+)?(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),?\s*(?:den\s+)?)?$/i;

/** Number of days after posting that a letter is legally assumed to arrive (since 1 Jan 2025; previously 3). */
export const DEEMED_DELIVERY_DAYS = 4;

export interface DeadlineResult {
  date: string;
  explanation: string[];
}

/**
 * Work out a relative deadline such as "innerhalb eines Monats nach Bekanntgabe".
 *
 * 1. Without a known receipt date, the letter counts as received on the 4th day
 *    after its date (§ 122 Abs. 2 AO / § 41 Abs. 2 VwVfG, "Bekanntgabefiktion"),
 *    moved to the next working day if that falls on a weekend or holiday.
 * 2. The day of receipt itself is not counted (§ 187 Abs. 1 BGB).
 * 3. A deadline that ends on a weekend or holiday moves to the next working day.
 *
 * This is an estimate to plan around, not legal advice.
 */
export function computeRelativeDeadline(params: {
  letterDate: string | null;
  receivedOn?: string | null;
  amount: number;
  unit: "days" | "weeks" | "months";
  from: "receipt" | "letter_date";
  state: GermanState;
}): DeadlineResult | null {
  const steps: string[] = [];
  let start: string;

  if (params.from === "letter_date") {
    if (!params.letterDate) return null;
    start = params.letterDate;
    steps.push(`The period runs from the letter's date, ${formatDe(start)}.`);
  } else if (params.receivedOn) {
    start = params.receivedOn;
    steps.push(`You told us you received the letter on ${formatDe(start)}.`);
  } else {
    if (!params.letterDate) return null;
    const deemed = addDays(params.letterDate, DEEMED_DELIVERY_DAYS);
    const rolled = rollToWorkingDay(deemed, params.state);
    start = rolled.date;
    steps.push(
      `The letter is dated ${formatDe(params.letterDate)}. A posted letter from an authority legally counts as received ${DEEMED_DELIVERY_DAYS} days later, on ${formatDe(deemed)}. If it reached you later, enter the real date.`,
    );
    if (rolled.reason) steps.push(`${rolled.reason}, so receipt moves to ${formatDe(rolled.date)}.`);
  }

  let end: string;
  if (params.unit === "days") end = addDays(start, params.amount);
  else if (params.unit === "weeks") end = addDays(start, params.amount * 7);
  else end = addMonths(start, params.amount);
  const unitLabel = params.amount === 1 ? params.unit.replace(/s$/, "") : params.unit;
  steps.push(`Counting ${params.amount} ${unitLabel} from then (the start day itself doesn't count) ends on ${formatDe(end)}.`);

  const rolledEnd = rollToWorkingDay(end, params.state);
  if (rolledEnd.reason) steps.push(`${rolledEnd.reason}, so the deadline moves to ${formatDe(rolledEnd.date)}.`);

  return { date: rolledEnd.date, explanation: steps };
}

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, einem: 1, eines: 1, einer: 1, eine: 1,
  zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwölf: 12, vierzehn: 14, zwanzig: 20, dreißig: 30,
};

/** Parse a relative period like "innerhalb eines Monats nach Bekanntgabe" or "binnen 14 Tagen". */
export function parseRelativePeriod(
  text: string,
): { amount: number; unit: "days" | "weeks" | "months"; from: "receipt" | "letter_date" } | null {
  const m = /(?:innerhalb|binnen)\s+(?:von\s+)?(\d{1,3}|[a-zäöüß]+)\s+(Tag(?:e|en)?|Woche(?:n)?|Monat(?:e|en|s)?)/i.exec(text);
  if (!m) return null;
  const amount = /^\d+$/.test(m[1]!) ? Number(m[1]) : NUMBER_WORDS[m[1]!.toLowerCase()];
  if (!amount) return null;
  const unitWord = m[2]!.toLowerCase();
  const unit = unitWord.startsWith("tag") ? "days" : unitWord.startsWith("woche") ? "weeks" : "months";
  const from = /(?:ab|nach)\s+(?:dem\s+)?(?:Datum|Ausstellungsdatum)\s+dieses/i.test(text) ? "letter_date" : "receipt";
  return { amount, unit, from };
}
