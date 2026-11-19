/**
 * Runs once when the Next.js server starts. In local development, with
 * TELEGRAM_POLLING=1 in .env, it starts the Telegram loops inside the web
 * server, so one `npm run dev` is all you need. In production, leave
 * TELEGRAM_POLLING unset and run the separate worker with a webhook instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.TELEGRAM_POLLING !== "1") return;

  // Hot reloads in development can call register() again: start only once.
  const g = globalThis as unknown as { klarpostTelegramStarted?: boolean };
  if (g.klarpostTelegramStarted) return;
  g.klarpostTelegramStarted = true;

  const { telegramFromEnv } = await import("./server/telegram");
  const telegram = telegramFromEnv();
  if (!telegram) {
    console.warn("[telegram] TELEGRAM_POLLING=1 but TELEGRAM_BOT_TOKEN is empty: reminders are off.");
    return;
  }
  const { getDb } = await import("./db/client");
  const { startTelegramLoops } = await import("./server/worker");
  startTelegramLoops(await getDb(), telegram, { polling: true });
}
