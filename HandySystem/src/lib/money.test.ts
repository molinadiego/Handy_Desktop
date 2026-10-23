import { describe, expect, it } from "vitest";
import { decimalToMinorUnits, formatMinorUnits, percentToBasisPoints } from "./money";

describe("workspace currency precision", () => {
  it("converts currencies with two decimal places exactly", () => {
    expect(decimalToMinorUnits("123.45", "USD")).toBe(12345);
    expect(decimalToMinorUnits("0.99", "EUR")).toBe(99);
  });

  it("supports zero-decimal currencies", () => {
    expect(decimalToMinorUnits("1234", "JPY")).toBe(1234);
    expect(decimalToMinorUnits("12.3", "JPY")).toBeNull();
  });

  it("converts manual percent discounts to basis points", () => {
    expect(percentToBasisPoints("12.5")).toBe(1250);
  });

  it("formats minor units using the selected currency", () => {
    expect(formatMinorUnits(12345, "USD", "en-US")).toContain("123.45");
  });
});
