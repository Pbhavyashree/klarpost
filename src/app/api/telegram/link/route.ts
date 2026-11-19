import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { problem } from "@/server/http";
import { createLinkToken, unlinkTelegram } from "@/server/telegram";
import { requireUserId } from "@/server/session";

export const runtime = "nodejs";

/** Create a one-time t.me deep link that connects this account to a Telegram chat. */
export async function POST() {
  if (!process.env.TELEGRAM_BOT_USERNAME) return problem(503, "Telegram reminders aren't set up on this server.");
  const link = await createLinkToken(await getDb(), await requireUserId());
  return NextResponse.json({ url: link.url, expiresAt: link.expiresAt });
}

export async function DELETE() {
  await unlinkTelegram(await getDb(), await requireUserId());
  return new NextResponse(null, { status: 204 });
}

/** Whether this account has a linked Telegram chat (polled while the user connects). */
export async function GET() {
  const { getUser } = await import("@/server/letters");
  const user = await getUser(await getDb(), await requireUserId());
  return NextResponse.json({ linked: !!user?.telegramChatId, username: user?.telegramUsername ?? null });
}
