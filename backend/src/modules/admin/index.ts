import { createAdminService } from "./service.js";
import { registerAdminRoutes } from "./routes.js";

export function createAdminModule(deps: Parameters<typeof createAdminService>[0]) {
  return createAdminService(deps);
}

export type AdminModule = ReturnType<typeof createAdminModule>;

export { createAdminService, registerAdminRoutes };
export type { AdminService } from "./service.js";
