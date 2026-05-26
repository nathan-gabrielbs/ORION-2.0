import type { Express } from "express";
import type { RasterClient } from "./client.js";
import { handleRasterTripRequest } from "./trip-handler.js";

export function registerRasterRoutes(
  app: Express,
  deps: {
    rasterClient: RasterClient;
    rasterLogin: string;
    rasterPassword: string;
  },
) {
  const { rasterClient, rasterLogin, rasterPassword } = deps;

  app.get("/api/vehicles/:plate/raster-trip", async (req, res) => {
    const { status, body } = await handleRasterTripRequest(
      { rasterClient, rasterLogin, rasterPassword },
      req.params.plate,
    );
    return res.status(status).json(body);
  });
}
