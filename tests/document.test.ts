import { describe, expect, it } from "vitest";
import { buildDocument, groupIntoLines, splitFragment } from "@/core/document";
import { boxesForRange } from "@/core/verify";

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

describe("buildDocument", () => {
  const doc = buildDocument([
    {
      page: 1,
      width: 1000,
      height: 1400,
      lines: [
        { words: [{ text: "Bitte", bbox: box(100, 100, 150, 120) }, { text: "zahlen", bbox: box(160, 100, 220, 120) }] },
        { words: [{ text: "bis", bbox: box(100, 130, 130, 150) }, { text: "07.12.2026", bbox: box(140, 130, 240, 150) }] },
      ],
    },
  ]);

  it("joins words and lines into text with offsets", () => {
    expect(doc.text).toBe("Bitte zahlen\nbis 07.12.2026");
    expect(doc.words[3]).toMatchObject({ text: "07.12.2026", start: 17, end: 27 });
  });

  it("maps a text range back to boxes, one per line", () => {
    const boxes = boxesForRange(doc.words, doc.text.indexOf("zahlen"), doc.text.length);
    expect(boxes).toEqual([
      { page: 1, bbox: box(160, 100, 220, 120) },
      { page: 1, bbox: box(100, 130, 240, 150) },
    ]);
  });
});

describe("PDF helpers", () => {
  it("groups fragments into lines in reading order", () => {
    const lines = groupIntoLines([
      { text: "world", bbox: box(60, 10, 100, 20) },
      { text: "second", bbox: box(0, 30, 50, 40) },
      { text: "hello", bbox: box(0, 11, 50, 21) },
    ]);
    expect(lines.map((l) => l.words.map((w) => w.text).join(" "))).toEqual(["hello world", "second"]);
  });

  it("splits a fragment into word boxes", () => {
    const parts = splitFragment("ab cd", box(0, 0, 50, 10));
    expect(parts.map((p) => [p.text, p.bbox.x0, p.bbox.x1])).toEqual([
      ["ab", 0, 20],
      ["cd", 30, 50],
    ]);
  });
});
