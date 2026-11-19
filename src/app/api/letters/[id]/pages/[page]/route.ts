import { getDb } from "@/db/client";
import { problem, Uuid } from "@/server/http";
import { getPage } from "@/server/letters";
import { currentUserId } from "@/server/session";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; page: string }> }) {
  const { id, page } = await params;
  const userId = await currentUserId();
  const n = Number(page);
  if (!userId || !Uuid.safeParse(id).success || !Number.isInteger(n)) return problem(404, "Page not found.");
  const row = await getPage(await getDb(), userId, id, n);
  if (!row) return problem(404, "Page not found.");
  return new Response(new Uint8Array(row.data), {
    headers: { "content-type": row.mime, "cache-control": "private, max-age=86400" },
  });
}
