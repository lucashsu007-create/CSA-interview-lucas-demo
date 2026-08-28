import { describe, expect, it } from "vitest";

import { addCents, assertCents, centsFromEuros, centsToEuros, formatEur, isCents } from "./money";

describe("cents", () => {
  it("accepts integers and rejects floats", () => {
    expect(isCents(0)).toBe(true);
    expect(isCents(1500)).toBe(true);
    expect(isCents(-250)).toBe(true);
    expect(isCents(15.5)).toBe(false);
    expect(isCents(Number.NaN)).toBe(false);
    expect(isCents(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isCents("1500")).toBe(false);
  });

  it("throws when a float reaches a money helper", () => {
    expect(() => assertCents(12.5, "priceMemberCents")).toThrow(/priceMemberCents/);
    expect(() => formatEur(12.5)).toThrow(TypeError);
  });

  it("converts a typed euro amount to cents without float drift", () => {
    expect(centsFromEuros(15)).toBe(1500);
    expect(centsFromEuros(15.5)).toBe(1550);
    // 0.1 + 0.2 territory: 19.99 * 100 is 1998.9999999999998 in binary floating point.
    expect(centsFromEuros(19.99)).toBe(1999);
    expect(centsToEuros(1999)).toBe(19.99);
  });

  it("adds without leaving the integer domain", () => {
    expect(addCents(1500, 2500, 0)).toBe(4000);
    expect(addCents()).toBe(0);
    expect(() => addCents(1500, 0.5)).toThrow(TypeError);
  });
});

describe("formatEur", () => {
  it("renders euros in the Dutch style by default", () => {
    expect(formatEur(1500)).toBe("€15,00");
    expect(formatEur(1)).toBe("€0,01");
    expect(formatEur(123456)).toBe("€1.234,56");
    expect(formatEur(100000000)).toBe("€1.000.000,00");
  });

  it("renders zero as a real price unless a label is given", () => {
    expect(formatEur(0)).toBe("€0,00");
    expect(formatEur(0, { zeroLabel: "Free" })).toBe("Free");
    expect(formatEur(1500, { zeroLabel: "Free" })).toBe("€15,00");
  });

  it("supports the English style and a bare number", () => {
    expect(formatEur(123456, { style: "en" })).toBe("€1,234.56");
    expect(formatEur(123456, { symbol: false })).toBe("1.234,56");
  });

  it("puts the sign before the symbol", () => {
    expect(formatEur(-1500)).toBe("-€15,00");
  });

  it("uses no non-breaking space, so assertions and layouts stay predictable", () => {
    expect(formatEur(1500)).not.toContain("\u00a0");
  });
});
