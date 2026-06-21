import { describe, it, expect } from "vitest";
import {
  encodeConditions,
  decodeConditions,
  validateConditionValue,
  mergeConditions,
} from "./conditions";

describe("conditions", () => {
  it("encodes and decodes in a round-trip", () => {
    const vals = { sleep: 7.5, stress: 3, notes: "heavy pull day" };
    expect(decodeConditions(encodeConditions(vals))).toEqual(vals);
  });

  it("decodeConditions returns {} for null", () => {
    expect(decodeConditions(null)).toEqual({});
  });

  it("decodeConditions returns {} for empty string", () => {
    expect(decodeConditions("")).toEqual({});
  });

  it("decodeConditions returns {} for invalid JSON", () => {
    expect(decodeConditions("bad json{{")).toEqual({});
  });

  it("decodeConditions returns {} for JSON array (not an object)", () => {
    expect(decodeConditions("[1,2,3]")).toEqual({});
  });

  describe("validateConditionValue", () => {
    it("number: passes numeric values", () => {
      expect(validateConditionValue("number", 7.5)).toBe(7.5);
      expect(validateConditionValue("number", "42")).toBe(42);
    });

    it("number: returns null for non-numeric", () => {
      expect(validateConditionValue("number", "abc")).toBeNull();
    });

    it("number: returns null for null/undefined", () => {
      expect(validateConditionValue("number", null)).toBeNull();
      expect(validateConditionValue("number", undefined)).toBeNull();
    });

    it("scale: accepts integers 1-10", () => {
      expect(validateConditionValue("scale", 1)).toBe(1);
      expect(validateConditionValue("scale", 10)).toBe(10);
      expect(validateConditionValue("scale", 7)).toBe(7);
    });

    it("scale: rounds to nearest integer", () => {
      expect(validateConditionValue("scale", 7.6)).toBe(8);
      expect(validateConditionValue("scale", 3.2)).toBe(3);
    });

    it("scale: rejects out-of-range values", () => {
      expect(validateConditionValue("scale", 0)).toBeNull();
      expect(validateConditionValue("scale", 11)).toBeNull();
    });

    it("text: returns strings and coerces non-strings", () => {
      expect(validateConditionValue("text", "hello")).toBe("hello");
      expect(validateConditionValue("text", 42)).toBe("42");
    });

    it("checkbox: converts to boolean", () => {
      expect(validateConditionValue("checkbox", true)).toBe(true);
      expect(validateConditionValue("checkbox", 1)).toBe(true);
      expect(validateConditionValue("checkbox", false)).toBe(false);
      expect(validateConditionValue("checkbox", 0)).toBe(false);
    });
  });

  it("mergeConditions: patch overrides existing keys and adds new ones", () => {
    const base = { sleep: 7, stress: 3 };
    const patch = { stress: 5, notes: "felt good" };
    expect(mergeConditions(base, patch)).toEqual({ sleep: 7, stress: 5, notes: "felt good" });
  });

  it("mergeConditions: does not mutate the original map", () => {
    const base = { sleep: 7 };
    mergeConditions(base, { sleep: 8 });
    expect(base.sleep).toBe(7);
  });
});
