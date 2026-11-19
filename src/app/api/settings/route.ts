import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { GermanStateSchema, problem } from "@/server/http";
import { updateSettings } from "@/server/letters";
import { requireUserId } from "@/server/session";

export const runtime = "nodejs";

const Patch = z.object({
  state: GermanStateSchema.optional(),
  reminderDays: z.array(z.number().int().min(1).max(30)).max(5).optional(),
});

export async function PATCH(req: Request) {
  const body = Patch.safeParse(await req.json().catch(() => null));
  if (!body.success) return problem(400, body.error.issues[0]?.message ?? "Invalid settings.");
  const patch = { ...body.data, reminderDays: body.data.reminderDays ? [...new Set(body.data.reminderDays)].sort((a, b) => b - a) : undefined };
  await updateSettings(await getDb(), await requireUserId(), patch);
  return NextResponse.json({ ok: true });
}
