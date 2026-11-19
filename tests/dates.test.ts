import { describe, expect, it } from "vitest";
import {
  addMonths,
  computeRelativeDeadline,
  easterSunday,
  findDates,
  isWorkingDay,
  parseGermanDate,
  parseRelativePeriod,
  rollToWorkingDay,
} from "@/core/dates";

describe("parseGermanDate", () => {
  it.each([
    ["12.11.2026", "2026-11-12"],
    ["1.2.26", "2026-02-01"],
    ["12. November 2026", "2026-11-12"],
    ["3. Dez. 2026", "2026-12-03"],
    ["5. März 2027", "2027-03-05"],
  ])("%s -> %s", (input, iso) => expect(parseGermanDate(input)).toBe(iso));

  it("rejects impossible dates", () => {
    expect(parseGermanDate("31.02.2026")).toBeNull();
  });

  it("finds all dates in a text", () => {
    expect(findDates("vom 30.10.2026, zahlbar bis 15. November 2026").map((d) => d.iso)).toEqual(["2026-10-30", "2026-11-15"]);
  });
});

describe("holidays and working days", () => {
  it("computes Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });

  it("knows state-specific holidays", () => {
    expect(isWorkingDay("2027-03-08", "BE")).toBe(false); // Frauentag in Berlin
    expect(isWorkingDay("2027-03-08", "BY")).toBe(true);
  });

  it("rolls over Christmas and the weekend", () => {
    expect(rollToWorkingDay("2026-12-25", "BE").date).toBe("2026-12-28");
  });
});

describe("addMonths", () => {
  it("clamps to the end of shorter months", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
  });
});

describe("parseRelativePeriod", () => {
  it("reads typical phrasing", () => {
    expect(parseRelativePeriod("innerhalb eines Monats nach Bekanntgabe")).toEqual({ amount: 1, unit: "months", from: "receipt" });
    expect(parseRelativePeriod("binnen 14 Tagen")).toEqual({ amount: 14, unit: "days", from: "receipt" });
    expect(parseRelativePeriod("innerhalb von zwei Wochen ab dem Datum dieses Schreibens")).toEqual({
      amount: 2,
      unit: "weeks",
      from: "letter_date",
    });
  });
});

describe("computeRelativeDeadline", () => {
  it("applies the 4-day delivery rule for a one-month objection period", () => {
    const r = computeRelativeDeadline({ letterDate: "2026-10-30", amount: 1, unit: "months", from: "receipt", state: "BE" })!;
    // Deemed received Tue 03.11.2026, + 1 month = Thu 03.12.2026
    expect(r.date).toBe("2026-12-03");
    expect(r.explanation.length).toBeGreaterThanOrEqual(2);
  });

  it("moves deemed receipt off a Sunday", () => {
    // 2026-11-04 (Wed) + 4 = Sun 08.11 -> Mon 09.11, + 14 days = Mon 23.11
    const r = computeRelativeDeadline({ letterDate: "2026-11-04", amount: 14, unit: "days", from: "receipt", state: "BE" })!;
    expect(r.date).toBe("2026-11-23");
  });

  it("uses the actual receipt date when the user provides it", () => {
    const r = computeRelativeDeadline({
      letterDate: "2026-10-30",
      receivedOn: "2027-01-31",
      amount: 1,
      unit: "months",
      from: "receipt",
      state: "BE",
    })!;
    // 28.02.2027 is a Sunday -> Monday 01.03.2027
    expect(r.date).toBe("2027-03-01");
  });

  it("returns null when it cannot know the start", () => {
    expect(computeRelativeDeadline({ letterDate: null, amount: 1, unit: "months", from: "receipt", state: "BE" })).toBeNull();
  });
});
