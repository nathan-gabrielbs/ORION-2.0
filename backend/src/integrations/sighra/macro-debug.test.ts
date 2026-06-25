import { describe, expect, it } from "vitest";
import { createEmptyMacroBatchStats, summarizeMacroKeys } from "./macro-debug.js";

describe("macro-debug", () => {
  it("creates empty batch stats with received count", () => {
    const stats = createEmptyMacroBatchStats(5);
    expect(stats.received).toBe(5);
    expect(stats.kanbanUpdated).toBe(0);
  });

  it("summarizes macro object keys", () => {
    const keys = summarizeMacroKeys({ placa: "ABC1D23", macro: "EM TRANSITO", id: 1 });
    expect(keys).toContain("placa");
    expect(keys).toContain("macro");
  });
});
