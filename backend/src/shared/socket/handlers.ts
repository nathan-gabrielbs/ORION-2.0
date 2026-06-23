import type { Server, Socket } from "socket.io";
import { parseCookies } from "../../modules/auth/cookies.js";
import type { AuthModule } from "../../modules/auth/index.js";
import type { VehicleModule } from "../../modules/vehicles/index.js";
import type { VehicleService } from "../../modules/vehicles/service.js";
import type { SighraSyncService } from "../../integrations/sighra/sync.service.js";
import { SESSION_COOKIE } from "../app-config.js";
import type { AuthUser } from "../types/auth.js";

type SocketData = {
  authUser?: AuthUser;
};

export function registerSocketHandlers(
  io: Server,
  deps: {
    auth: AuthModule;
    vehicleService: VehicleService;
    vehicleRepo: VehicleModule;
    sighraSync: SighraSyncService;
  },
): void {
  const { auth, vehicleService, vehicleRepo, sighraSync } = deps;

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.request.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      const user = await auth.getAuthUserFromToken(token);
      if (!user) {
        return next(new Error("Unauthorized"));
      }
      (socket.data as SocketData).authUser = user;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  io.on("connection", (socket: Socket) => {
    console.log("Client connected", (socket.data as SocketData).authUser?.email || "unknown");

    void (async () => {
      await vehicleService.clearStaleMaintenanceFinishedAt();
      socket.emit("init:vehicles", await vehicleRepo.getAllVehicles());
      socket.emit("sync:status", sighraSync.getSyncStatus());
      socket.emit("macros:status", sighraSync.getMacrosStatus());
    })();
  });
}
