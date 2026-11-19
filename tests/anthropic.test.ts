import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicExtractor, toolInputSchema } from "@/core/extractors/anthropic";

function fakeClient(input: unknown) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = {
    messages: {
      create: async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        calls.push(params);
        return { content: [{ type: "tool_use", id: "t1", name: "record_letter_analysis", input }] };
      },
    },
  } as unknown as Pick<Anthropic, "messages">;
  return { client, calls };
}

const valid = {
  sender: "Finanzamt",
  letterType: "Tax assessment",
  letterDate: "2026-10-30",
  summary: "You owe tax.",
  urgency: "medium",
  items: [{ kind: "amount", label: "Back payment", quote: "Nachzahlung von 1.234,56 EUR", amountCents: 123456 }],
};

describe("AnthropicExtractor", () => {
  it("forces the structured tool and sends only the redacted text", async () => {
    const { client, calls } = fakeClient(valid);
    const result = await new AnthropicExtractor("test-model", client).extract("Frau [NAME_1], bitte zahlen");
    expect(result.items[0]!.amountCents).toBe(123456);
    expect(calls[0]!.tool_choice).toEqual({ type: "tool", name: "record_letter_analysis" });
    expect(JSON.stringify(calls[0]!.messages)).toContain("[NAME_1]");
  });

  it("rejects output that doesn't match the schema", async () => {
    const { client } = fakeClient({ ...valid, items: [{ kind: "amount", label: "x", quote: "q", amountCents: 1.5 }] });
    await expect(new AnthropicExtractor("m", client).extract("text")).rejects.toThrow();
  });

  it("produces a plain object JSON Schema for the tool", () => {
    const schema = toolInputSchema() as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema).not.toHaveProperty("$schema");
  });
});
