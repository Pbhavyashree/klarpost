import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { problem } from "@/server/http";
import { handleUpdate, telegramFromEnv, type TelegramUpdate } from "@/server/telegram";

export const runtime = "nodejs";

function sameSecret(a: string | null, b: string | undefined) {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Telegram calls this for every message to the bot. The secret header proves the call came from Telegram. */
export async function POST(req: Request) {
  if (!sameSecret(req.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return problem(401, "Invalid webhook secret.");
  }
  const telegram = telegramFromEnv();
  if (!telegram) return problem(503, "Telegram is not configured.");
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update || typeof update.update_id !== "number") return problem(400, "Not a Telegram update.");
  try {
    await handleUpdate(await getDb(), telegram, update);
  } catch (e) {
    // Answer 200 anyway so Telegram doesn't retry a broken update forever.
    console.error("telegram update failed", e);
  }
  return NextResponse.json({ ok: true });
}
