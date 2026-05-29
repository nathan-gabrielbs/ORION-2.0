import type Database from "better-sqlite3";
import type { AuthModule } from "../auth/index.js";
import { createAdminService } from "./service.js";
import { registerAdminRoutes } from "./routes.js";

export function createAdminModule(deps: { db: Database.Database; auth: AuthModule }) {
  return createAdminService(deps);
}

export type AdminModule = ReturnType<typeof createAdminModule>;

export { createAdminService, registerAdminRoutes };
export type { AdminService } from "./service.js";
