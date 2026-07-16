import express from "express";
import session from "express-session";
import { initDatabase } from "./db/client.js";
import { createRasterClient } from "./integrations/raster/client.js";
import { registerRasterRoutes } from "./integrations/raster/routes.js";
import { createRasterSyncService } from "./integrations/raster/sync.service.js";
import { createSighraClient } from "./integrations/sighra/client.js";
import { registerSighraRoutes } from "./integrations/sighra/routes.js";
import { createSighraSyncService } from "./integrations/sighra/sync.service.js";
import { createSighraWebhookHandler } from "./integrations/sighra/webhook.js";
import {
  createAuthModule,
  ensureFreshOrbitalToken,
  registerAuthRoutes,
  registerOrbitalRoutes,
} from "./modules/auth/index.js";
import { createAdminModule, registerAdminRoutes } from "./modules/admin/index.js";
import { createEfficiencyModule, registerEfficiencyRoutes } from "./modules/efficiency/index.js";
import {
  createVehicleModule,
  createVehicleService,
  registerVehicleRoutes,
} from "./modules/vehicles/index.js";
import { sanitizeExistingVehicleData } from "./modules/vehicles/startup-sanitize.js";
import { startBackgroundJobs } from "./shared/bootstrap/intervals.js";
import { createHttpServer } from "./shared/http/server.js";
import {
  configureHttpMiddleware,
  createAuthLimiter,
  createGeneralLimiter,
} from "./shared/middleware/http.js";
import { configureHelmet } from "./shared/middleware/security.js";
import { registerSocketHandlers } from "./shared/socket/handlers.js";
import { registerProductionSpa, registerRootRedirect } from "./shared/static/spa.js";
import { APP_PORT, IS_PRODUCTION, SESSION_SECRET, SESSION_TTL_MS } from "./shared/app-config.js";
import { optionalEnv, requireEnv } from "./shared/env.js";
import { resolveLoginHtmlPath } from "./shared/paths.js";

async function startServer() {
  await initDatabase();

  const auth = createAuthModule();
  await auth.ensurePrincipalAdmin();
  const vehicleRepo = await createVehicleModule();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  const { httpServer, io } = createHttpServer(app);

  configureHelmet(app);

  const generalLimiter = createGeneralLimiter();
  const authLimiter = createAuthLimiter(auth);
  configureHttpMiddleware(app, generalLimiter);

  app.use(
    session({
      name: "orion_oidc",
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: "lax",
        maxAge: SESSION_TTL_MS,
      },
    }),
  );

  app.use(auth.attachAuthUser);
  app.use(ensureFreshOrbitalToken);

  const { requireAuth, requireAdmin } = auth;
  const loginHtmlPath = resolveLoginHtmlPath();

  registerAuthRoutes(app, { auth, loginHtmlPath });
  // Rate-limit the only user-triggered auth entrypoint (SSO initiation).
  app.use("/auth/orbital/login", authLimiter);
  registerOrbitalRoutes(app, { auth, oauth: auth });

  const adminService = createAdminModule();
  registerAdminRoutes(app, { adminService, requireAdmin });

  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth")) return next();
    if (req.path === "/sighra/webhook") return next();
    return requireAuth(req, res, next);
  });

  await sanitizeExistingVehicleData();

  const sighraClient = createSighraClient({
    soapBaseUrl: requireEnv("SIGHRA_WS_URL").replace(/\?wsdl$/i, ""),
    user: requireEnv("SIGHRA_USER"),
    pass: requireEnv("SIGHRA_PASS"),
  });

  const rasterClient = createRasterClient({
    baseUrl: requireEnv("RASTER_BASE_URL"),
    method: optionalEnv("RASTER_METHOD", "getEventoFimViagem"),
    login: requireEnv("RASTER_LOGIN"),
    password: requireEnv("RASTER_PASSWORD"),
  });

  const rasterLogin = requireEnv("RASTER_LOGIN");
  const rasterPassword = requireEnv("RASTER_PASSWORD");

  const sighraSync = createSighraSyncService({
    io,
    sighraClient,
    vehicleRepo,
    soapBaseUrl: requireEnv("SIGHRA_WS_URL").replace(/\?wsdl$/i, ""),
  });

  const rasterSync = createRasterSyncService({
    io,
    rasterClient,
    vehicleRepo,
    rasterLogin,
    rasterPassword,
  });

  const sighraWebhookHandler = createSighraWebhookHandler({ io, vehicleRepo });

  registerRasterRoutes(app, { rasterClient, rasterLogin, rasterPassword });
  registerSighraRoutes(app, { sighraSync, webhookHandler: sighraWebhookHandler });

  const vehicleService = createVehicleService({ vehicleRepo, io });
  registerVehicleRoutes(app, vehicleService);

  const efficiencyService = createEfficiencyModule();
  registerEfficiencyRoutes(app, efficiencyService);

  registerRootRedirect(app);
  registerProductionSpa(app);

  registerSocketHandlers(io, { auth, vehicleService, vehicleRepo, sighraSync });

  httpServer.listen(APP_PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://0.0.0.0:${APP_PORT}`);
    await startBackgroundJobs({ sighraSync, rasterSync, efficiencyService });
  });
}

export { startServer };
