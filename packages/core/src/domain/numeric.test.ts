import { describe, expect, it } from "vitest";
import { numericInputMode, sanitizeNumeric } from "./numeric";

describe("sanitizeNumeric", () => {
  it("keeps digits only for integer fields", () => {
    expect(sanitizeNumeric("12")).toBe("12");
    expect(sanitizeNumeric("1a2b")).toBe("12");
    expect(sanitizeNumeric("-5")).toBe("5");
    expect(sanitizeNumeric("8.5")).toBe("85");
    expect(sanitizeNumeric("1 2e3")).toBe("123");
    expect(sanitizeNumeric("")).toBe("");
  });

  it("drops letters, signs and spaces from a pasted string", () => {
    expect(sanitizeNumeric(" 80 kg ", { decimal: true })).toBe("80");
    expect(sanitizeNumeric("+1e5", { decimal: true })).toBe("15");
    expect(sanitizeNumeric("abc")).toBe("");
  });

  it("allows a single decimal point when decimals are on", () => {
    expect(sanitizeNumeric("82.5", { decimal: true })).toBe("82.5");
    expect(sanitizeNumeric("1.2.3", { decimal: true })).toBe("1.23");
    expect(sanitizeNumeric("..5", { decimal: true })).toBe(".5");
    expect(sanitizeNumeric("7.", { decimal: true })).toBe("7.");
  });

  it("treats a comma as the decimal point when no point exists", () => {
    expect(sanitizeNumeric("82,5", { decimal: true })).toBe("82.5");
    expect(sanitizeNumeric("82.5,1", { decimal: true })).toBe("82.51");
  });

  it("caps decimal places", () => {
    expect(sanitizeNumeric("1.2345", { decimal: true })).toBe("1.23");
    expect(sanitizeNumeric("1.2345", { decimal: true, maxDecimals: 1 })).toBe(
      "1.2",
    );
  });

  it("picks the keyboard", () => {
    expect(numericInputMode(true)).toBe("decimal");
    expect(numericInputMode(false)).toBe("numeric");
  });
});
