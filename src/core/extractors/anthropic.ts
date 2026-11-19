import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ExtractionSchema } from "../schema";
import type { Extraction, Extractor } from "../types";

const SYSTEM_PROMPT = `You help people living in Germany understand official letters (Finanzamt, Krankenkasse, Jobcenter, Ausländerbehörde, landlords, utilities, debt collectors).

You receive the text of one letter. Personal data has been replaced with placeholders such as [NAME_1], [IBAN_1] or [ADDRESS_1]. Keep placeholders exactly as they are; never guess what they hide.

Rules:
- Every item MUST include a "quote" copied character for character from the letter. Do not translate, fix typos or shorten words inside the quote. A program checks each quote against the letter, and items with invalid quotes are shown to the user as unverified.
- Deadlines: if the letter gives a date, use "date". If it gives a period ("innerhalb eines Monats nach Bekanntgabe", "binnen 14 Tagen"), use "relative" and do NOT calculate a date yourself.
- Amounts: give "amountCents" as an integer number of cents. Only include amounts the reader must pay or will receive.
- References: case numbers, customer numbers and similar identifiers the reader should quote in a reply.
- Actions: the concrete steps the reader must take, as plain-English "text".
- The summary explains the letter in plain English for someone with basic German. Explain, don't advise: you are not a lawyer or tax adviser.
- If something is unclear, leave it out rather than guess.`;

const TOOL_NAME = "record_letter_analysis";

/** JSON Schema for the tool input, without the "$schema" key the API doesn't need. */
export function toolInputSchema(): Anthropic.Tool.InputSchema {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(ExtractionSchema) as Record<string, unknown>;
  return schema as Anthropic.Tool.InputSchema;
}

type MessagesClient = Pick<Anthropic, "messages">;

export class AnthropicExtractor implements Extractor {
  readonly name: string;
  private client: MessagesClient;

  constructor(
    private model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
    client?: MessagesClient,
  ) {
    this.name = `anthropic:${model}`;
    this.client = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async extract(redactedText: string): Promise<Extraction> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: "Record the structured analysis of the letter.",
          input_schema: toolInputSchema(),
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: `<letter>\n${redactedText}\n</letter>` }],
    });

    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("The model did not return a structured analysis.");
    // Never trust model output blindly: validate it against the schema.
    return ExtractionSchema.parse(block.input) as Extraction;
  }
}
