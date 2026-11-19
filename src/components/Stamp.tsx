import { daysBetween } from "@/core/dates";

export function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function deDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function daysLeftText(daysLeft: number) {
  if (daysLeft < 0) return `${-daysLeft} days ago`;
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

/** A rubber-stamp style deadline date. */
export function Stamp({ date, done, small, word = "Frist", today = berlinToday() }: { date: string; done?: boolean; small?: boolean; word?: string; today?: string }) {
  const left = daysBetween(today, date);
  const cls = ["stamp", small ? "small-stamp" : "", done ? "done" : left <= 7 ? "urgent" : ""].filter(Boolean).join(" ");
  return (
    <span className={cls} aria-label={`${done ? "Done. " : ""}Deadline ${deDate(date)}, ${daysLeftText(left)}`}>
      <span className="stamp-word">{done ? "Erledigt" : word}</span>
      <span className="stamp-date">{deDate(date)}</span>
      {!small && !done && <span className="stamp-left">{daysLeftText(left)}</span>}
    </span>
  );
}
