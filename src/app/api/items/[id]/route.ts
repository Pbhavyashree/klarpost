import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { problem, Uuid } from "@/server/http";
import { updateItem } from "@/server/letters";
import { requireUserId } from "@/server/session";

export const runtime = "nodejs";

const Patch = z
  .object({ userConfirmed: z.boolean().nullable().optional(), done: z.boolean().optional() })
  .refine((p) => p.userConfirmed !== undefined || p.done !== undefined, "Nothing to update.");

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Uuid.safeParse(id).success) return problem(404, "Item not found.");
  const body = Patch.safeParse(await req.json().catch(() => null));
  if (!body.success) return problem(400, body.error.issues[0]?.message ?? "Invalid update.");
  const row = await updateItem(await getDb(), await requireUserId(), id, body.data);
  return row ? NextResponse.json(row) : problem(404, "Item not found.");
}
