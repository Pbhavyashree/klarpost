import { NextResponse } from "next/server";
import { z } from "zod";
import type { GermanState } from "@/core/dates";
import { analyseLetter, documentFromText } from "@/core/pipeline";
import type { LetterDocument } from "@/core/types";
import { getDb } from "@/db/client";
import { IsoDate, LetterDocumentSchema, problem, rateLimit } from "@/server/http";
import { getUser, listLetters, saveLetter } from "@/server/letters";
import { requireUserId } from "@/server/session";

export const runtime = "nodejs";

const MAX_PAGE_BYTES = 3 * 1024 * 1024;

export async function GET() {
  const userId = await requireUserId();
  const letters = await listLetters(await getDb(), userId);
  return NextResponse.json(letters.map(({ document: _d, sentToModel: _s, redactions: _r, ...rest }) => rest));
}

/**
 * Analyse a letter. multipart/form-data with either:
 *   document: JSON LetterDocument (from in-browser OCR / PDF reading) + page-1..page-n JPEGs
 *   text:     pasted plain text
 * and optionally receivedOn (YYYY-MM-DD).
 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!rateLimit(`analyse:${userId}`, 20, 60 * 60 * 1000)) return problem(429, "You've analysed 20 letters in the last hour. Try again later.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return problem(400, "Send the letter as multipart form data.");
  }

  const receivedOnRaw = form.get("receivedOn");
  const receivedOn = typeof receivedOnRaw === "string" && receivedOnRaw ? IsoDate.safeParse(receivedOnRaw) : null;
  if (receivedOn && !receivedOn.success) return problem(400, "The received date must look like 2026-11-03.");

  let document: LetterDocument;
  let source: "image" | "pdf" | "text";
  const pages: { page: number; mime: string; data: Buffer }[] = [];

  const pasted = form.get("text");
  if (typeof pasted === "string" && pasted.trim()) {
    const parsed = z.string().min(20).max(50_000).safeParse(pasted.trim());
    if (!parsed.success) return problem(400, "Paste the full letter text (at least a few lines).");
    document = documentFromText(parsed.data);
    source = "text";
  } else {
    const rawDoc = form.get("document");
    if (typeof rawDoc !== "string") return problem(400, "Upload a letter or paste its text.");
    let json: unknown;
    try {
      json = JSON.parse(rawDoc);
    } catch {
      return problem(400, "The letter data could not be read.");
    }
    const parsed = LetterDocumentSchema.safeParse(json);
    if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "The letter data is invalid.");
    document = parsed.data;
    source = form.get("source") === "pdf" ? "pdf" : "image";

    for (const p of document.pages) {
      const file = form.get(`page-${p.page}`);
      if (!(file instanceof Blob)) continue;
      if (file.size > MAX_PAGE_BYTES) return problem(413, `Page ${p.page} is larger than 3 MB.`);
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return problem(415, "Page images must be JPEG, PNG or WebP.");
      pages.push({ page: p.page, mime: file.type, data: Buffer.from(await file.arrayBuffer()) });
    }
  }

  const db = await getDb();
  const user = await getUser(db, userId);
  try {
    const result = await analyseLetter(document, {
      state: (user?.state ?? "BE") as GermanState,
      receivedOn: receivedOn?.success ? receivedOn.data : null,
    });
    const id = await saveLetter(db, userId, {
      document,
      result,
      source,
      receivedOn: receivedOn?.success ? receivedOn.data : null,
      pages,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    console.error("analyse failed", e);
    return problem(502, "The letter couldn't be analysed right now. Please try again in a minute.");
  }
}
