import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { computeRelativeDeadline, type GermanState } from "@/core/dates";
import type { AnalysisResult } from "@/core/pipeline";
import type { LetterDocument } from "@/core/types";
import type { Db } from "@/db/client";
import { items, letterPages, letters, users } from "@/db/schema";

export type ItemRow = typeof items.$inferSelect;
export type LetterRow = typeof letters.$inferSelect;

export async function createUser(db: Db): Promise<string> {
  const [row] = await db.insert(users).values({}).returning({ id: users.id });
  return row!.id;
}

export async function getUser(db: Db, userId: string) {
  return (await db.select().from(users).where(eq(users.id, userId)))[0] ?? null;
}

export async function saveLetter(
  db: Db,
  userId: string,
  input: {
    document: LetterDocument;
    result: AnalysisResult;
    source: "image" | "pdf" | "text";
    receivedOn: string | null;
    pages: { page: number; mime: string; data: Buffer }[];
  },
): Promise<string> {
  const { result } = input;
  return db.transaction(async (tx) => {
    const [letter] = await tx
      .insert(letters)
      .values({
        userId,
        sender: result.sender,
        letterType: result.letterType,
        letterDate: result.letterDate,
        receivedOn: input.receivedOn,
        summary: result.summary,
        urgency: result.urgency,
        extractor: result.extractor,
        source: input.source,
        document: input.document,
        sentToModel: result.sentToModel,
        redactions: result.redactions,
      })
      .returning({ id: letters.id });
    const letterId = letter!.id;

    if (result.items.length) {
      await tx.insert(items).values(
        result.items.map((i, position) => ({
          letterId,
          position,
          kind: i.kind,
          label: i.label,
          quote: i.quote,
          date: i.date ?? null,
          relative: i.relative ?? null,
          dueDate: i.dueDate ?? null,
          dueDateExplanation: i.dueDateExplanation ?? null,
          amountCents: i.amountCents ?? null,
          currency: i.currency ?? null,
          text: i.text ?? null,
          status: i.status,
          issues: i.issues,
          sourceSpan: i.source ?? null,
        })),
      );
    }
    if (input.pages.length) await tx.insert(letterPages).values(input.pages.map((p) => ({ letterId, ...p })));
    return letterId;
  });
}

export async function listLetters(db: Db, userId: string) {
  const rows = await db.select().from(letters).where(eq(letters.userId, userId)).orderBy(desc(letters.createdAt));
  if (!rows.length) return [];
  const allItems = await db
    .select()
    .from(items)
    .where(inArray(items.letterId, rows.map((r) => r.id)))
    .orderBy(asc(items.position));
  return rows.map((l) => ({ ...l, items: allItems.filter((i) => i.letterId === l.id) }));
}

export async function getLetter(db: Db, userId: string, letterId: string) {
  const [letter] = await db
    .select()
    .from(letters)
    .where(and(eq(letters.id, letterId), eq(letters.userId, userId)));
  if (!letter) return null;
  const letterItems = await db.select().from(items).where(eq(items.letterId, letterId)).orderBy(asc(items.position));
  const pages = await db
    .select({ page: letterPages.page, mime: letterPages.mime })
    .from(letterPages)
    .where(eq(letterPages.letterId, letterId))
    .orderBy(asc(letterPages.page));
  return { ...letter, items: letterItems, pages };
}

export async function getPage(db: Db, userId: string, letterId: string, page: number) {
  const [row] = await db
    .select({ mime: letterPages.mime, data: letterPages.data })
    .from(letterPages)
    .innerJoin(letters, eq(letters.id, letterPages.letterId))
    .where(and(eq(letterPages.letterId, letterId), eq(letterPages.page, page), eq(letters.userId, userId)));
  return row ?? null;
}

export async function deleteLetter(db: Db, userId: string, letterId: string): Promise<boolean> {
  const r = await db
    .delete(letters)
    .where(and(eq(letters.id, letterId), eq(letters.userId, userId)))
    .returning({ id: letters.id });
  return r.length > 0;
}

/** The user tells us when the letter really arrived: recalculate every period-based deadline. */
export async function setReceivedOn(db: Db, userId: string, letterId: string, receivedOn: string | null, state: GermanState) {
  const letter = await getLetter(db, userId, letterId);
  if (!letter) return null;
  await db.transaction(async (tx) => {
    await tx.update(letters).set({ receivedOn }).where(eq(letters.id, letterId));
    for (const item of letter.items) {
      if (item.kind !== "deadline" || !item.relative) continue;
      const r = computeRelativeDeadline({ letterDate: letter.letterDate, receivedOn, ...item.relative, state });
      await tx
        .update(items)
        .set({ dueDate: r?.date ?? null, dueDateExplanation: r?.explanation ?? null })
        .where(eq(items.id, item.id));
    }
  });
  return getLetter(db, userId, letterId);
}

/** Confirm or dismiss an item, or mark a deadline done. */
export async function updateItem(
  db: Db,
  userId: string,
  itemId: string,
  patch: { userConfirmed?: boolean | null; done?: boolean },
): Promise<ItemRow | null> {
  const [owned] = await db
    .select({ id: items.id })
    .from(items)
    .innerJoin(letters, eq(letters.id, items.letterId))
    .where(and(eq(items.id, itemId), eq(letters.userId, userId)));
  if (!owned) return null;
  const set: Partial<typeof items.$inferInsert> = {};
  if (patch.userConfirmed !== undefined) set.userConfirmed = patch.userConfirmed;
  if (patch.done !== undefined) set.doneAt = patch.done ? new Date() : null;
  const [row] = await db.update(items).set(set).where(eq(items.id, itemId)).returning();
  return row ?? null;
}

/** Deadlines the user should act on: verified or confirmed, not dismissed, not done. */
export function isActionableDeadline(i: Pick<ItemRow, "kind" | "dueDate" | "status" | "userConfirmed" | "doneAt">) {
  if (i.kind !== "deadline" || !i.dueDate || i.doneAt) return false;
  if (i.userConfirmed === false) return false;
  return i.status === "verified" || i.userConfirmed === true;
}

export async function updateSettings(db: Db, userId: string, patch: { state?: GermanState; reminderDays?: number[] }) {
  await db.update(users).set(patch).where(eq(users.id, userId));
}

export async function openDeadlines(db: Db, userId: string) {
  const rows = await db
    .select({ item: items, letter: { id: letters.id, sender: letters.sender, letterType: letters.letterType } })
    .from(items)
    .innerJoin(letters, eq(letters.id, items.letterId))
    .where(and(eq(letters.userId, userId), eq(items.kind, "deadline"), isNull(items.doneAt)))
    .orderBy(asc(items.dueDate));
  return rows.filter((r) => isActionableDeadline(r.item));
}
