import type { Db } from "@/db/client";
import { sendDueReminders } from "./reminders";
import { handleUpdate, type TelegramApi, type TelegramUpdate } from "./telegram";

const REMINDER_INTERVAL_MS = 15 * 60 * 1000;

/**
 * The background loops behind Telegram reminders:
 *   - every 15 minutes, send the reminders that are due;
 *   - with polling on, fetch the bot's messages from Telegram (local development,
 *     where Telegram can't reach a webhook on your laptop).
 *
 * They run either in the standalone worker (scripts/reminder-worker.ts) or,
 * in local development, inside the Next.js server itself (src/instrumentation.ts).
 * The second option matters because PGlite, the local database, can only be
 * opened by one process at a time.
 */
export function startTelegramLoops(db: Db, telegram: TelegramApi, opts: { polling: boolean; log?: (msg: string) => void }) {
  const log = opts.log ?? ((m) => console.log(`[telegram] ${m}`));
  let stopping = false;

  async function reminderLoop() {
    while (!stopping) {
      try {
        const r = await sendDueReminders(db, telegram);
        if (r.sent || r.failed) log(`reminders sent=${r.sent} failed=${r.failed} ${r.errors.join("; ")}`);
      } catch (e) {
        log(`reminder run failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(REMINDER_INTERVAL_MS, () => stopping);
    }
  }

  async function pollingLoop() {
    try {
      await telegram.call("deleteWebhook", {});
      const me = await telegram.call<{ username: string }>("getMe", {});
      log(`polling for messages to @${me.username}`);
    } catch (e) {
      log(`could not reach Telegram, check TELEGRAM_BOT_TOKEN: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    let offset = 0;
    while (!stopping) {
      try {
        const updates = await telegram.call<TelegramUpdate[]>("getUpdates", {
          offset,
          timeout: 30,
          allowed_updates: ["message", "callback_query"],
        });
        for (const u of updates) {
          offset = u.update_id + 1;
          await handleUpdate(db, telegram, u);
        }
      } catch (e) {
        log(`polling failed: ${e instanceof Error ? e.message : String(e)}`);
        await sleep(5000, () => stopping);
      }
    }
  }

  void reminderLoop();
  if (opts.polling) void pollingLoop();
  return () => {
    stopping = true;
  };
}

/** Sleep, but wake early (checking once a second) if asked to stop. */
async function sleep(ms: number, shouldStop: () => boolean) {
  const end = Date.now() + ms;
  while (Date.now() < end && !shouldStop()) await new Promise((r) => setTimeout(r, Math.min(1000, end - Date.now())));
}
