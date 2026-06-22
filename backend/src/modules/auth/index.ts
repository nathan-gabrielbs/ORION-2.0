import { createAuthMiddleware } from "./middleware.js";
import { createOAuthStateService } from "./oauth-state.js";
import { ensureFreshOrbitalToken, registerOrbitalRoutes } from "./orbital-routes.js";
import { registerAuthRoutes } from "./routes.js";
import { createAuthService } from "./service.js";

export function createAuthModule() {
  const auth = createAuthService();
  const oauth = createOAuthStateService();
  const middleware = createAuthMiddleware(auth);

  return {
    ...auth,
    ...oauth,
    ...middleware,
  };
}

export type AuthModule = ReturnType<typeof createAuthModule>;

export { ensureFreshOrbitalToken, registerAuthRoutes, registerOrbitalRoutes };
