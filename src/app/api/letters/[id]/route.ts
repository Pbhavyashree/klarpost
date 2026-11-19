import { NextResponse } from "next/server";
import { z } from "zod";
import type { GermanState } from "@/core/dates";
import { getDb } from "@/db/client";
import { IsoDate, problem, Uuid } from "@/server/http";
import { deleteLetter, getLetter, getUser, setReceivedOn } from "@/server/letters";
import { requireUserId } from "@/server/session";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!Uuid.safeParse(id).success) return problem(404, "Letter not found.");
  const letter = await getLetter(await getDb(), await requireUserId(), id);
  return letter ? NextResponse.json(letter) : problem(404, "Letter not found.");
}

const Patch = z.object({ receivedOn: IsoDate.nullable() });

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!Uuid.safeParse(id).success) return problem(404, "Letter not found.");
  const body = Patch.safeParse(await req.json().catch(() => null));
  if (!body.success) return problem(400, "Send { receivedOn: 'YYYY-MM-DD' } or null.");
  const userId = await requireUserId();
  const db = await getDb();
  const user = await getUser(db, userId);
  const letter = await setReceivedOn(db, userId, id, body.data.receivedOn, (user?.state ?? "BE") as GermanState);
  return letter ? NextResponse.json(letter) : problem(404, "Letter not found.");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!Uuid.safeParse(id).success) return problem(404, "Letter not found.");
  const ok = await deleteLetter(await getDb(), await requireUserId(), id);
  return ok ? new NextResponse(null, { status: 204 }) : problem(404, "Letter not found.");
}
