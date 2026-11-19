import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/client";
import { users } from "@/db/schema";
import { createUser } from "@/server/letters";
import { createLinkToken, TelegramApi } from "@/server/telegram";
import { startTelegramLoops } from "@/server/worker";

describe("startTelegramLoops (polling)", () => {
  it("links a chat from a polled /start message", async () => {
    const db = await createTestDb();
    const userId = await createUser(db);
    const { token } = await createLinkToken(db, userId);
    const sent: string[] = [];
    let polled = 0;

    const fakeFetch = (async (url: string, init?: RequestInit) => {
      const method = url.split("/").pop()!;
      const body = JSON.parse(String(init?.body ?? "{}"));
      const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }));
      if (method === "getMe") return ok({ username: "klarpost_test_bot" });
      if (method === "sendMessage") {
        sent.push(body.text);
        return ok({});
      }
      if (method === "getUpdates") {
        polled++;
        if (polled === 1) return ok([{ update_id: 7, message: { chat: { id: 555 }, from: { username: "anna" }, text: `/start ${token}` } }]);
        await new Promise((r) => setTimeout(r, 20));
        return ok([]);
      }
      return ok(true);
    }) as typeof fetch;

    const stop = startTelegramLoops(db, new TelegramApi("TEST", fakeFetch), { polling: true, log: () => {} });
    for (let i = 0; i < 100 && sent.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    stop();

    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u!.telegramChatId).toBe(555);
    expect(u!.telegramUsername).toBe("anna");
    expect(sent[0]).toMatch(/Connected/);
  });
});
