import { afterEach, vi } from "vitest";

// Default test env. Individual tests may override these via vi.stubEnv before
// they import code that reads them.
process.env.NODE_ENV = "test";
process.env.DATABASE_FILE = process.env.DATABASE_FILE ?? ":memory:";

afterEach(() => {
  vi.clearAllMocks();
});
