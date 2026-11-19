import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { problem } from "@/server/http";
import { sendDueReminders } from "@/server/reminders";
import { telegramFromEnv } from "@/server/telegram";

export const runtime = "nodejs";

/** Called by a scheduler (system cron, GitHub Actions…) with Authorization: Bearer $CRON_SECRET. */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`) : null;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  if (!expected || expected.length !== given.length || !timingSafeEqual(expected, given)) return problem(401, "Unauthorised.");
  const telegram = telegramFromEnv();
  if (!telegram) return problem(503, "Telegram is not configured.");
  return NextResponse.json(await sendDueReminders(await getDb(), telegram));
}
