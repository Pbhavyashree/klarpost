import { relations, sql } from "drizzle-orm";
import { bigint, boolean, customType, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { BBox, LetterDocument } from "../core/types";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Federal state, for public holidays in deadline maths. */
  state: text("state").notNull().default("BE"),
  /** Days before a deadline to send a reminder. */
  reminderDays: integer("reminder_days").array().notNull().default(sql`'{7,3,1}'::integer[]`),
  telegramChatId: bigint("telegram_chat_id", { mode: "number" }),
  telegramUsername: text("telegram_username"),
  telegramLinkedAt: timestamp("telegram_linked_at", { withTimezone: true }),
});

export const letters = pgTable(
  "letters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sender: text("sender"),
    letterType: text("letter_type"),
    letterDate: date("letter_date"),
    receivedOn: date("received_on"),
    summary: text("summary").notNull(),
    urgency: text("urgency").notNull(),
    extractor: text("extractor").notNull(),
    source: text("source").notNull(), // "image" | "pdf" | "text"
    document: jsonb("document").$type<LetterDocument>().notNull(),
    sentToModel: text("sent_to_model").notNull(),
    redactions: jsonb("redactions").$type<{ kind: string; start: number; end: number; placeholder: string }[]>().notNull(),
  },
  (t) => [index("letters_user_idx").on(t.userId, t.createdAt)],
);

export const letterPages = pgTable(
  "letter_pages",
  {
    letterId: uuid("letter_id").notNull().references(() => letters.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    mime: text("mime").notNull(),
    data: bytea("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.letterId, t.page] })],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    letterId: uuid("letter_id").notNull().references(() => letters.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    quote: text("quote").notNull(),
    date: date("date"),
    relative: jsonb("relative").$type<{ amount: number; unit: "days" | "weeks" | "months"; from: "receipt" | "letter_date" }>(),
    dueDate: date("due_date"),
    dueDateExplanation: jsonb("due_date_explanation").$type<string[]>(),
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    text: text("text"),
    status: text("status").notNull(), // verified | needs_review
    issues: jsonb("issues").$type<string[]>().notNull(),
    sourceSpan: jsonb("source_span").$type<{ start: number; end: number; boxes: { page: number; bbox: BBox }[] }>(),
    /** null = not reviewed, true = user confirmed, false = user dismissed. */
    userConfirmed: boolean("user_confirmed"),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [index("items_due_idx").on(t.dueDate)],
);

export const telegramLinkTokens = pgTable("telegram_link_tokens", {
  token: text("token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/** One row per reminder sent. The primary key makes sending idempotent. */
export const remindersSent = pgTable(
  "reminders_sent",
  {
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    daysBefore: integer("days_before").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.daysBefore] })],
);

export const lettersRelations = relations(letters, ({ many, one }) => ({
  items: many(items),
  user: one(users, { fields: [letters.userId], references: [users.id] }),
}));
export const itemsRelations = relations(items, ({ one }) => ({
  letter: one(letters, { fields: [items.letterId], references: [letters.id] }),
}));
