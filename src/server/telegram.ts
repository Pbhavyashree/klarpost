import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { formatDe } from "@/core/dates";
import type { Db } from "@/db/client";
import { items, letters, telegramLinkTokens, users } from "@/db/schema";
import { isActionableDeadline } from "./letters";

export interface Button {
  text: string;
  callbackData?: string;
  url?: string;
}

/** The small slice of the Telegram Bot API we use. Faked in tests. */
export interface Messenger {
  sendMessage(chatId: number, html: string, buttons?: Button[]): Promise<void>;
  answerCallback(callbackQueryId: string, text: string): Promise<void>;
}

export class TelegramApi implements Messenger {
  constructor(
    private token: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
    return json.result as T;
  }

  async sendMessage(chatId: number, html: string, buttons?: Button[]) {
    await this.call("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(buttons?.length
        ? {
            reply_markup: {
              inline_keyboard: [buttons.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.callbackData }))],
            },
          }
        : {}),
    });
  }

  async answerCallback(callbackQueryId: string, text: string) {
    await this.call("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  }
}

export function telegramFromEnv(): TelegramApi | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? new TelegramApi(token) : null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const LINK_TTL_MS = 15 * 60 * 1000;

/** A one-time token for the t.me deep link. Telegram allows [A-Za-z0-9_-], max 64 chars. */
export async function createLinkToken(db: Db, userId: string, now = new Date()) {
  const token = randomBytes(24).toString("base64url");
  await db.insert(telegramLinkTokens).values({ token, userId, expiresAt: new Date(now.getTime() + LINK_TTL_MS) });
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  return { token, url: bot ? `https://t.me/${bot}?start=${token}` : null, expiresAt: new Date(now.getTime() + LINK_TTL_MS) };
}

export async function unlinkTelegram(db: Db, userId: string) {
  await db.update(users).set({ telegramChatId: null, telegramUsername: null, telegramLinkedAt: null }).where(eq(users.id, userId));
}

/** Minimal shape of a Telegram Update that we handle. */
export interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; from?: { username?: string }; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
}

export async function handleUpdate(db: Db, messenger: Messenger, update: TelegramUpdate, now = new Date()): Promise<void> {
  if (update.callback_query) return handleCallback(db, messenger, update.callback_query, now);
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const [command, arg] = msg.text.trim().split(/\s+/, 2);

  if (command === "/start" && arg) {
    const [row] = await db
      .select()
      .from(telegramLinkTokens)
      .where(and(eq(telegramLinkTokens.token, arg), isNull(telegramLinkTokens.usedAt), gt(telegramLinkTokens.expiresAt, now)));
    if (!row) {
      await messenger.sendMessage(chatId, "This link has expired or was already used. Open Klarpost and press <b>Connect Telegram</b> again.");
      return;
    }
    await db.transaction(async (tx) => {
      await tx.update(telegramLinkTokens).set({ usedAt: now }).where(eq(telegramLinkTokens.token, arg));
      await tx
        .update(users)
        .set({ telegramChatId: chatId, telegramUsername: msg.from?.username ?? null, telegramLinkedAt: now })
        .where(eq(users.id, row.userId));
    });
    await messenger.sendMessage(
      chatId,
      "Connected. I'll remind you here before each deadline in your letters.\n\nSend /deadlines to see what's coming up, or /stop to disconnect.",
    );
    return;
  }

  if (command === "/stop") {
    await db.update(users).set({ telegramChatId: null, telegramUsername: null, telegramLinkedAt: null }).where(eq(users.telegramChatId, chatId));
    await messenger.sendMessage(chatId, "Disconnected. You won't get reminders here any more.");
    return;
  }

  if (command === "/deadlines") {
    const rows = await db
      .select({ item: items, sender: letters.sender })
      .from(items)
      .innerJoin(letters, eq(letters.id, items.letterId))
      .innerJoin(users, eq(users.id, letters.userId))
      .where(and(eq(users.telegramChatId, chatId), eq(items.kind, "deadline"), isNull(items.doneAt)))
      .orderBy(asc(items.dueDate));
    const open = rows.filter((r) => isActionableDeadline(r.item)).slice(0, 10);
    const text = open.length
      ? open.map((r) => `• <b>${formatDe(r.item.dueDate!)}</b>: ${escapeHtml(r.item.label)} (${escapeHtml(r.sender ?? "letter")})`).join("\n")
      : "No open deadlines.";
    await messenger.sendMessage(chatId, text);
    return;
  }

  await messenger.sendMessage(chatId, "To connect, open Klarpost and press <b>Connect Telegram</b>. Commands: /deadlines, /stop");
}

async function handleCallback(db: Db, messenger: Messenger, cq: NonNullable<TelegramUpdate["callback_query"]>, now: Date) {
  const chatId = cq.message?.chat.id;
  const match = /^done:([0-9a-f-]{36})$/.exec(cq.data ?? "");
  if (!chatId || !match) {
    await messenger.answerCallback(cq.id, "Unknown action.");
    return;
  }
  // Only the owner's chat may mark the item done.
  const [owned] = await db
    .select({ id: items.id })
    .from(items)
    .innerJoin(letters, eq(letters.id, items.letterId))
    .innerJoin(users, eq(users.id, letters.userId))
    .where(and(eq(items.id, match[1]!), eq(users.telegramChatId, chatId)));
  if (!owned) {
    await messenger.answerCallback(cq.id, "That deadline isn't linked to this chat.");
    return;
  }
  await db.update(items).set({ doneAt: now }).where(eq(items.id, owned.id));
  await messenger.answerCallback(cq.id, "Marked as done. No more reminders for this one.");
}
