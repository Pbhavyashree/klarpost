/**
 * Standalone reminder worker for production (docker compose runs it next to
 * the web app, both using PostgreSQL). Sends due Telegram reminders every
 * 15 minutes. Telegram messages arrive through the webhook (scripts/set-webhook.ts);
 * set TELEGRAM_POLLING=1 only if you have no webhook.
 *
 * Local development doesn't need this script: put TELEGRAM_POLLING=1 in .env
 * and `npm run dev` runs the same loops inside the web server.
 */
import { getDb } from "@/db/client";
import { telegramFromEnv } from "@/server/telegram";
import { startTelegramLoops } from "@/server/worker";

const telegram = telegramFromEnv();
if (!telegram) {
  console.error("Set TELEGRAM_BOT_TOKEN to run the reminder worker.");
  process.exit(1);
}
if (!process.env.DATABASE_URL?.startsWith("postgres")) {
  console.error(
    "The standalone worker needs PostgreSQL (DATABASE_URL). For local development with the built-in database, " +
      "set TELEGRAM_POLLING=1 in .env and just run `npm run dev` instead.",
  );
  process.exit(1);
}

const stop = startTelegramLoops(await getDb(), telegram, { polling: process.env.TELEGRAM_POLLING === "1" });
console.log("Reminder worker running.");
process.on("SIGTERM", () => {
  stop();
  setTimeout(() => process.exit(0), 1500);
});
process.on("SIGINT", () => {
  stop();
  setTimeout(() => process.exit(0), 1500);
});
