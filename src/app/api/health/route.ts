import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await (await getDb()).execute(sql`select 1`);
    return NextResponse.json({ ok: true, ai: !!process.env.ANTHROPIC_API_KEY, telegram: !!process.env.TELEGRAM_BOT_TOKEN });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
