import { createServer } from "http";
import type { Express } from "express";
import { Server } from "socket.io";
import { isAllowedOrigin } from "../cors.js";

export function createHttpServer(app: Express) {
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error("Origin não permitida"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
    },
  });

  return { httpServer, io };
}
