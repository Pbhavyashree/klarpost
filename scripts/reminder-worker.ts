/**
 * Background worker: sends due Telegram reminders every 15 minutes.
 *
 * In local development there is no public URL for Telegram's webhook, so set
 * TELEGRAM_POLLING=1 and this worker also fetches bot messages itself
 * (long polling). In production, use the webhook instead (scripts/set-webhook.ts).
 */
import { getDb } from "@/db/client";
import { sendDueReminders } from "@/server/reminders";
import { handleUpdate, telegramFromEnv, type TelegramUpdate } from "@/server/telegram";

const INTERVAL_MS = 15 * 60 * 1000;
const telegram = telegramFromEnv();
if (!telegram) {
  console.error("Set TELEGRAM_BOT_TOKEN to run the reminder worker.");
  process.exit(1);
}
const db = await getDb();
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function reminderLoop() {
  while (!stopping) {
    try {
      const r = await sendDueReminders(db, telegram!);
      if (r.sent || r.failed) console.log(new Date().toISOString(), `reminders sent=${r.sent} failed=${r.failed}`, r.errors);
    } catch (e) {
      console.error("reminder run failed", e);
    }
    await new Promise((res) => setTimeout(res, INTERVAL_MS));
  }
}

async function pollingLoop() {
  await telegram!.call("deleteWebhook", {});
  let offset = 0;
  console.log("Polling Telegram for messages…");
  while (!stopping) {
    try {
      const updates = await telegram!.call<TelegramUpdate[]>("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] });
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(db, telegram!, u);
      }
    } catch (e) {
      console.error("polling failed", e);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}

await Promise.all([reminderLoop(), process.env.TELEGRAM_POLLING === "1" ? pollingLoop() : Promise.resolve()]);
