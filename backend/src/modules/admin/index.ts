import { createAdminService } from "./service.js";
import { registerAdminRoutes } from "./routes.js";

export function createAdminModule() {
  return createAdminService();
}

export type AdminModule = ReturnType<typeof createAdminModule>;

export { createAdminService, registerAdminRoutes };
export type { AdminService } from "./service.js";
