import { describe, expect, it } from "vitest";
import { sanitizeText } from "./sanitize.js";

describe("sanitizeText", () => {
  it("returns trimmed text capped by max length", () => {
    expect(sanitizeText("  hello world  ", 5)).toBe("hello");
  });

  it("returns null for empty or non-string values", () => {
    expect(sanitizeText("   ")).toBeNull();
    expect(sanitizeText(null)).toBeNull();
    expect(sanitizeText(undefined)).toBeNull();
    expect(sanitizeText(123)).toBeNull();
  });

  it("strips null bytes", () => {
    expect(sanitizeText("a\u0000b\u0000c", 10)).toBe("abc");
  });
});
