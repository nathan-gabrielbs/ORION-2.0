import { vi } from "vitest";
import type { Server } from "socket.io";

export function createMockIo() {
  const emit = vi.fn();

  return {
    io: { emit } as unknown as Server,
    emit,
  };
}
