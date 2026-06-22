import crypto from "crypto";
import type { Request, Response } from "express";
import type { Server } from "socket.io";
import { query } from "../../db/client.js";
import { IS_PRODUCTION, SIGHRA_WEBHOOK_TOKEN } from "../../shared/app-config.js";
import type { VehicleModule } from "../../modules/vehicles/index.js";
import { normalizePlate } from "../../shared/utils/plate.js";

export type SighraWebhookDeps = {
  io: Server;
  vehicleRepo: VehicleModule;
};

export function createSighraWebhookHandler(deps: SighraWebhookDeps) {
  const { io, vehicleRepo } = deps;

  return async (req: Request, res: Response) => {
    if (SIGHRA_WEBHOOK_TOKEN) {
      const token = String(req.headers["x-webhook-token"] || "");
      const expected = Buffer.from(SIGHRA_WEBHOOK_TOKEN);
      const received = Buffer.from(token);
      const tokenMatches =
        expected.length === received.length && crypto.timingSafeEqual(expected, received);
      if (!tokenMatches) {
        return res.status(401).json({ error: "Unauthorized webhook" });
      }
    } else if (IS_PRODUCTION) {
      return res.status(401).json({ error: "Unauthorized webhook" });
    }

    const data = req.body;
    const normalizedPlate = normalizePlate(data?.plate);

    if (normalizedPlate) {
      await query(
        `
        UPDATE vehicles
        SET lat = $1,
            lng = $2,
            speed = $3,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = $4
      `,
        [data.lat, data.lng, data.speed, normalizedPlate],
      );

      const updated = await vehicleRepo.getVehicleByPlate(normalizedPlate);
      if (updated) {
        io.emit("vehicle:updated", updated);
      }
    }

    res.status(200).send("OK");
  };
}
