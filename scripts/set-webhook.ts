/** Point the Telegram bot at this deployment: APP_URL=https://… TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… npx tsx scripts/set-webhook.ts */
import { telegramFromEnv } from "@/server/telegram";

const telegram = telegramFromEnv();
const appUrl = process.env.APP_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!telegram || !appUrl?.startsWith("https://") || !secret) {
  console.error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and an https APP_URL.");
  process.exit(1);
}
await telegram.call("setWebhook", {
  url: `${appUrl}/api/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
});
await telegram.call("setMyCommands", {
  commands: [
    { command: "deadlines", description: "Show your upcoming deadlines" },
    { command: "stop", description: "Stop reminders and disconnect" },
  ],
});
console.log(`Webhook set to ${appUrl}/api/telegram/webhook`);
