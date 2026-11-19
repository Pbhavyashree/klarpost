import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { formatCents } from "@/core/amounts";
import { daysBetween, formatDe } from "@/core/dates";
import type { Db } from "@/db/client";
import { items, letters, remindersSent, users } from "@/db/schema";
import { isActionableDeadline } from "./letters";
import { escapeHtml, type Button, type Messenger } from "./telegram";

/** Today's date in Berlin, whatever time zone the server runs in. */
export function todayIn(now: Date, timeZone = "Europe/Berlin"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Which reminder "tier" applies today: the smallest configured offset that is
 * still >= the days left. Day 0 ("due today") always exists. If the worker was
 * down for a while, the user gets one catch-up message, not a burst.
 */
export function reminderTier(daysLeft: number, reminderDays: number[]): number | null {
  if (daysLeft < 0) return null;
  const tiers = [...new Set([0, ...reminderDays])].sort((a, b) => a - b);
  return tiers.find((t) => t >= daysLeft) ?? null;
}

function whenText(daysLeft: number) {
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "Due tomorrow";
  return `Due in ${daysLeft} days`;
}

export interface ReminderRunResult {
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * Send every reminder that is due. Safe to run as often as you like:
 * a reminder is claimed (inserted) before sending, and the primary key on
 * reminders_sent stops a second worker or a re-run from sending it twice.
 * If sending fails, the claim is released so the next run retries.
 */
export async function sendDueReminders(db: Db, messenger: Messenger, now = new Date(), appUrl = process.env.APP_URL): Promise<ReminderRunResult> {
  const today = todayIn(now);
  const rows = await db
    .select({ item: items, letter: { id: letters.id, sender: letters.sender }, user: { chatId: users.telegramChatId, reminderDays: users.reminderDays } })
    .from(items)
    .innerJoin(letters, eq(letters.id, items.letterId))
    .innerJoin(users, eq(users.id, letters.userId))
    .where(and(eq(items.kind, "deadline"), isNotNull(items.dueDate), isNull(items.doneAt), isNotNull(users.telegramChatId)));

  const result: ReminderRunResult = { sent: 0, failed: 0, errors: [] };
  for (const { item, letter, user } of rows) {
    if (!isActionableDeadline(item)) continue;
    const daysLeft = daysBetween(today, item.dueDate!);
    const tier = reminderTier(daysLeft, user.reminderDays);
    if (tier === null) continue;

    const claimed = await db.insert(remindersSent).values({ itemId: item.id, daysBefore: tier }).onConflictDoNothing().returning();
    if (!claimed.length) continue;

    const lines = [
      `⏰ <b>${whenText(daysLeft)}</b>: ${escapeHtml(item.label)}`,
      `From: ${escapeHtml(letter.sender ?? "a letter")}`,
      `Deadline: <b>${formatDe(item.dueDate!)}</b>`,
    ];
    if (item.amountCents != null) lines.push(`Amount: ${formatCents(item.amountCents, item.currency ?? "EUR")}`);
    lines.push("", `<i>“${escapeHtml(item.quote.slice(0, 200))}”</i>`);

    const buttons: Button[] = [{ text: "✅ Mark as done", callbackData: `done:${item.id}` }];
    // Telegram only accepts public https URLs on buttons.
    if (appUrl?.startsWith("https://")) buttons.push({ text: "Open letter", url: `${appUrl}/letters/${letter.id}` });

    try {
      await messenger.sendMessage(user.chatId!, lines.join("\n"), buttons);
      result.sent++;
    } catch (e) {
      await db.delete(remindersSent).where(and(eq(remindersSent.itemId, item.id), eq(remindersSent.daysBefore, tier)));
      result.failed++;
      result.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return result;
}
