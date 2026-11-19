import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { RulesExtractor } from "@/core/extractors/rules";
import { analyseLetter, documentFromText } from "@/core/pipeline";
import { createTestDb, type Db } from "@/db/client";
import { items, users } from "@/db/schema";
import { createUser, getLetter, openDeadlines, saveLetter, setReceivedOn, updateItem } from "@/server/letters";
import { reminderTier, sendDueReminders, todayIn } from "@/server/reminders";
import { createLinkToken, handleUpdate, type Button, type Messenger } from "@/server/telegram";
import { LETTERS } from "../eval/letters";

class FakeMessenger implements Messenger {
  sent: { chatId: number; html: string; buttons?: Button[] }[] = [];
  answers: string[] = [];
  failNext = false;
  async sendMessage(chatId: number, html: string, buttons?: Button[]) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("network down");
    }
    this.sent.push({ chatId, html, buttons });
  }
  async answerCallback(_id: string, text: string) {
    this.answers.push(text);
  }
}

const CHAT = 424242;
const at = (iso: string) => new Date(`${iso}T08:00:00+01:00`);
let db: Db;
let tg: FakeMessenger;
let userId: string;

async function addLetter(id: string) {
  const fixture = LETTERS.find((l) => l.id === id)!;
  const doc = documentFromText(fixture.text);
  const result = await analyseLetter(doc, { state: "BE", extractor: new RulesExtractor() });
  return saveLetter(db, userId, { document: doc, result, source: "text", receivedOn: null, pages: [] });
}

async function link() {
  const { token } = await createLinkToken(db, userId, at("2026-11-01"));
  await handleUpdate(db, tg, { update_id: 1, message: { chat: { id: CHAT }, text: `/start ${token}` } }, at("2026-11-01"));
}

beforeEach(async () => {
  db = await createTestDb();
  tg = new FakeMessenger();
  userId = await createUser(db);
});

describe("reminderTier", () => {
  it("picks the most urgent configured tier", () => {
    expect(reminderTier(10, [7, 3, 1])).toBeNull();
    expect(reminderTier(7, [7, 3, 1])).toBe(7);
    expect(reminderTier(5, [7, 3, 1])).toBe(7);
    expect(reminderTier(2, [7, 3, 1])).toBe(3);
    expect(reminderTier(0, [7, 3, 1])).toBe(0);
    expect(reminderTier(-1, [7, 3, 1])).toBeNull();
  });

  it("uses Berlin's date, not the server's", () => {
    expect(todayIn(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12-01");
  });
});

describe("Telegram linking", () => {
  it("links a chat with a one-time token", async () => {
    await link();
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u!.telegramChatId).toBe(CHAT);
    expect(tg.sent[0]!.html).toMatch(/Connected/);
  });

  it("rejects a reused or expired token", async () => {
    const { token } = await createLinkToken(db, userId, at("2026-11-01"));
    await handleUpdate(db, tg, { update_id: 1, message: { chat: { id: CHAT }, text: `/start ${token}` } }, at("2026-11-01"));
    await handleUpdate(db, tg, { update_id: 2, message: { chat: { id: 999 }, text: `/start ${token}` } }, at("2026-11-01"));
    expect(tg.sent[1]!.html).toMatch(/expired or was already used/);

    const late = await createLinkToken(db, userId, at("2026-11-01"));
    await handleUpdate(db, tg, { update_id: 3, message: { chat: { id: 999 }, text: `/start ${late.token}` } }, at("2026-11-02"));
    expect(tg.sent[2]!.html).toMatch(/expired/);
  });

  it("unlinks with /stop", async () => {
    await link();
    await handleUpdate(db, tg, { update_id: 2, message: { chat: { id: CHAT }, text: "/stop" } });
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u!.telegramChatId).toBeNull();
  });
});

describe("sendDueReminders", () => {
  it("sends nothing until Telegram is linked", async () => {
    await addLetter("health-insurance-arrears"); // due 16.11.2026
    expect((await sendDueReminders(db, tg, at("2026-11-15"))).sent).toBe(0);
  });

  it("sends one reminder per tier, never twice", async () => {
    await link();
    tg.sent = [];
    await addLetter("health-insurance-arrears"); // due Mon 16.11.2026

    expect((await sendDueReminders(db, tg, at("2026-11-08"))).sent).toBe(0); // 8 days left
    expect((await sendDueReminders(db, tg, at("2026-11-09"))).sent).toBe(1); // 7 days
    expect((await sendDueReminders(db, tg, at("2026-11-09"))).sent).toBe(0); // same day re-run
    expect((await sendDueReminders(db, tg, at("2026-11-11"))).sent).toBe(0); // 5 days, still 7-day tier
    expect((await sendDueReminders(db, tg, at("2026-11-13"))).sent).toBe(1); // 3 days
    expect((await sendDueReminders(db, tg, at("2026-11-15"))).sent).toBe(1); // 1 day
    expect((await sendDueReminders(db, tg, at("2026-11-16"))).sent).toBe(1); // due today
    expect((await sendDueReminders(db, tg, at("2026-11-17"))).sent).toBe(0); // past

    expect(tg.sent.map((m) => m.html.split("\n")[0])).toEqual([
      "⏰ <b>Due in 7 days</b>: Payment due",
      "⏰ <b>Due in 3 days</b>: Payment due",
      "⏰ <b>Due tomorrow</b>: Payment due",
      "⏰ <b>Due today</b>: Payment due",
    ]);
  });

  it("retries after a failed send", async () => {
    await link();
    await addLetter("health-insurance-arrears");
    tg.failNext = true;
    const first = await sendDueReminders(db, tg, at("2026-11-13"));
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    expect((await sendDueReminders(db, tg, at("2026-11-13"))).sent).toBe(1);
  });

  it("stops after the user taps 'Mark as done'", async () => {
    await link();
    await addLetter("health-insurance-arrears");
    await sendDueReminders(db, tg, at("2026-11-09"));
    const doneButton = tg.sent.at(-1)!.buttons!.find((b) => b.callbackData)!;
    await handleUpdate(db, tg, {
      update_id: 9,
      callback_query: { id: "cb1", data: doneButton.callbackData, message: { chat: { id: CHAT } } },
    });
    expect(tg.answers[0]).toMatch(/Marked as done/);
    expect((await sendDueReminders(db, tg, at("2026-11-13"))).sent).toBe(0);
  });

  it("ignores 'Mark as done' from someone else's chat", async () => {
    await link();
    await addLetter("health-insurance-arrears");
    const [item] = await db.select().from(items).where(eq(items.kind, "deadline"));
    await handleUpdate(db, tg, { update_id: 9, callback_query: { id: "cb", data: `done:${item!.id}`, message: { chat: { id: 1 } } } });
    expect(tg.answers[0]).toMatch(/isn't linked/);
  });

  it("does not remind about unverified items unless the user confirms them", async () => {
    await link();
    tg.sent = [];
    const letterId = await addLetter("health-insurance-arrears");
    const letter = (await getLetter(db, userId, letterId))!;
    const deadline = letter.items.find((i) => i.kind === "deadline")!;
    await db.update(items).set({ status: "needs_review" }).where(eq(items.id, deadline.id));
    expect((await sendDueReminders(db, tg, at("2026-11-13"))).sent).toBe(0);

    await updateItem(db, userId, deadline.id, { userConfirmed: true });
    expect((await sendDueReminders(db, tg, at("2026-11-13"))).sent).toBe(1);
  });
});

describe("letters service", () => {
  it("recalculates period deadlines when the real receipt date is entered", async () => {
    const letterId = await addLetter("tax-assessment");
    let letter = (await getLetter(db, userId, letterId))!;
    const objection = () => letter.items.find((i) => i.relative)!;
    expect(objection().dueDate).toBe("2026-12-03");

    letter = (await setReceivedOn(db, userId, letterId, "2026-11-10", "BE"))!;
    expect(objection().dueDate).toBe("2026-12-10");
    expect(objection().dueDateExplanation![0]).toMatch(/received the letter on/);
  });

  it("keeps users' letters separate", async () => {
    const letterId = await addLetter("tax-assessment");
    const other = await createUser(db);
    expect(await getLetter(db, other, letterId)).toBeNull();
    expect(await openDeadlines(db, other)).toEqual([]);
    expect((await openDeadlines(db, userId)).length).toBe(2);
  });
});
