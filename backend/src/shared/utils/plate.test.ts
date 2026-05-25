import { describe, expect, it } from "vitest";
import { normalizePlate } from "./plate.js";

describe("normalizePlate", () => {
  it("removes non-alphanumeric characters and uppercases", () => {
    expect(normalizePlate("bwt-1234")).toBe("BWT1234");
    expect(normalizePlate(" ABC 1D23 ")).toBe("ABC1D23");
  });

  it("returns empty string for nullish values", () => {
    expect(normalizePlate(null)).toBe("");
    expect(normalizePlate(undefined)).toBe("");
  });
});
