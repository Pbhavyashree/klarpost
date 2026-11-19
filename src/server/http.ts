import { NextResponse } from "next/server";
import { z } from "zod";

export function problem(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD");
export const Uuid = z.uuid();

export const GermanStateSchema = z.enum(["BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"]);

const BBoxSchema = z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });

export const LetterDocumentSchema = z
  .object({
    text: z.string().min(20, "The letter text is too short to analyse.").max(50_000),
    words: z
      .array(z.object({ text: z.string(), page: z.number().int().positive(), bbox: BBoxSchema, start: z.number().int().nonnegative(), end: z.number().int().positive() }))
      .max(20_000),
    pages: z.array(z.object({ page: z.number().int().positive(), width: z.number().positive(), height: z.number().positive() })).max(10),
  })
  .refine((d) => d.words.every((w) => w.end <= d.text.length && w.start < w.end), "Word positions don't match the text.");

/**
 * A small in-memory rate limiter (sliding window per key). Analysing a letter
 * costs money when an AI model is connected, so each account gets a budget.
 * For several server instances, move this to Postgres or Redis.
 */
const windows = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    windows.set(key, recent);
    return false;
  }
  recent.push(now);
  windows.set(key, recent);
  return true;
}
