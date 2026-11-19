import { z } from "zod";

/** The shape every extractor must return. Validated at runtime, never trusted blindly. */
export const ExtractedItemSchema = z.object({
  kind: z.enum(["deadline", "amount", "reference", "action"]),
  label: z.string().min(1).describe("Short English label, e.g. 'Payment due' or 'Objection period'"),
  quote: z
    .string()
    .min(3)
    .describe("Text copied EXACTLY, character for character, from the letter that supports this item. Keep it short: one sentence or line."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("For deadlines with an explicit date: YYYY-MM-DD"),
  relative: z
    .object({
      amount: z.number().int().positive(),
      unit: z.enum(["days", "weeks", "months"]),
      from: z.enum(["receipt", "letter_date"]),
    })
    .optional()
    .describe("For deadlines given as a period, e.g. 'innerhalb eines Monats nach Bekanntgabe' -> {amount:1, unit:'months', from:'receipt'}"),
  amountCents: z.number().int().nonnegative().optional().describe("For amounts: value in cents, e.g. 1.234,56 EUR -> 123456"),
  currency: z.string().length(3).optional(),
  text: z.string().optional().describe("For references: the number exactly as written. For actions: what the reader must do, in plain English."),
});

export const ExtractionSchema = z.object({
  sender: z.string().nullable().describe("The authority or company that sent the letter"),
  letterType: z.string().nullable().describe("e.g. 'Tax assessment', 'Payment reminder', 'Appointment invitation'"),
  letterDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe("The date the letter was written, YYYY-MM-DD"),
  summary: z.string().describe("2-4 sentences in plain English: what this letter is and what it means for the reader"),
  urgency: z.enum(["low", "medium", "high"]),
  items: z.array(ExtractedItemSchema),
});
