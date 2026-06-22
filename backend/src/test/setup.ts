process.env.NODE_ENV = "test";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://orion:orion_dev@localhost:5433/orion_test";
}

import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
});
