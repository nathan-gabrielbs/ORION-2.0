import crypto from "crypto";
import type { Request, Response } from "express";
import type Database from "better-sqlite3";
import type { Server } from "socket.io";
import { IS_PRODUCTION, SIGHRA_WEBHOOK_TOKEN } from "../../shared/app-config.js";
import type { VehicleModule } from "../../modules/vehicles/index.js";
import { normalizePlate } from "../../shared/utils/plate.js";

export type SighraWebhookDeps = {
  db: Database.Database;
  io: Server;
  vehicleRepo: VehicleModule;
};

export function createSighraWebhookHandler(deps: SighraWebhookDeps) {
  const { db, io, vehicleRepo } = deps;

  return (req: Request, res: Response) => {
    // In production SIGHRA_WEBHOOK_TOKEN is required at boot (see env loading
    // above). In dev it is optional, but if it's set we still enforce it.
    if (SIGHRA_WEBHOOK_TOKEN) {
      const token = String(req.headers["x-webhook-token"] || "");
      // timingSafeEqual avoids leaking token length via response time.
      const expected = Buffer.from(SIGHRA_WEBHOOK_TOKEN);
      const received = Buffer.from(token);
      const tokenMatches =
        expected.length === received.length && crypto.timingSafeEqual(expected, received);
      if (!tokenMatches) {
        return res.status(401).json({ error: "Unauthorized webhook" });
      }
    } else if (IS_PRODUCTION) {
      // Defense-in-depth: if env loading was bypassed somehow, never allow
      // an unauthenticated webhook to mutate fleet state in production.
      return res.status(401).json({ error: "Unauthorized webhook" });
    }

    const data = req.body;
    const normalizedPlate = normalizePlate(data?.plate);

    if (normalizedPlate) {
      db.prepare(
        `
      UPDATE vehicles
      SET lat = ?,
          lng = ?,
          speed = ?,
          last_update = CURRENT_TIMESTAMP
      WHERE plate = ?
    `,
      ).run(data.lat, data.lng, data.speed, normalizedPlate);

      const updated = vehicleRepo.getVehicleByPlate(normalizedPlate);
      if (updated) {
        io.emit("vehicle:updated", updated);
      }
    }

    res.status(200).send("OK");
  };
}
