import type Database from "better-sqlite3";
import { createAuthMiddleware } from "./middleware.js";
import { createOAuthStateService } from "./oauth-state.js";
import { registerAuthRoutes } from "./routes.js";
import { createAuthService } from "./service.js";

export function createAuthModule(db: Database.Database) {
  const auth = createAuthService(db);
  const oauth = createOAuthStateService(db);
  const middleware = createAuthMiddleware(auth);

  return {
    ...auth,
    ...oauth,
    ...middleware,
  };
}

export type AuthModule = ReturnType<typeof createAuthModule>;

export { registerAuthRoutes };
