import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import axios from "axios";
import path from "path";
import { createDatabase } from "./db/client.js";
import { createRasterClient } from "./integrations/raster/client.js";
import { createRasterSyncService } from "./integrations/raster/sync.service.js";
import { handleRasterTripRequest } from "./integrations/raster/trip-handler.js";
import { createSighraClient } from "./integrations/sighra/client.js";
import { cleanupOldMacrosHistory } from "./integrations/sighra/macro-history.js";
import { mapTrackerLocation, normalizeDriverName } from "./integrations/sighra/macro-utils.js";
import { createSighraSyncService } from "./integrations/sighra/sync.service.js";
import { createSighraWebhookHandler } from "./integrations/sighra/webhook.js";
import { createAuthModule } from "./modules/auth/index.js";
import {
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "./modules/auth/dto.js";
import { clearSessionCookie, parseCookies, setSessionCookie } from "./modules/auth/cookies.js";
import { makePasswordHash, verifyPassword } from "./modules/auth/password.js";
import {
  createVehicleModule,
  createVehicleService,
  registerVehicleRoutes,
} from "./modules/vehicles/index.js";
import {
  APP_PORT,
  BOOTSTRAP_ADMIN_EMAIL,
  IS_PRODUCTION,
  MICROSOFT_ALLOWED_DOMAIN,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  MICROSOFT_TENANT_ID,
  PUBLIC_BASE_URL,
  SESSION_COOKIE,
} from "./shared/app-config.js";
import { isAllowedOrigin, requireTrustedOrigin } from "./shared/cors.js";
import { optionalEnv, requireEnv } from "./shared/env.js";
import { resolveFrontendDistPath, resolveLoginHtmlPath } from "./shared/paths.js";
import type { AuthProvider, AuthUser, UserRole } from "./shared/types/auth.js";
import { sanitizeText } from "./shared/utils/sanitize.js";
import { normalizePlate } from "./shared/utils/plate.js";

const db = createDatabase();
const auth = createAuthModule(db);
auth.ensurePrincipalAdmin();
const vehicleRepo = createVehicleModule(db);

const plateRegistrySchema = z.object({
  plate: z.string().trim().min(7).max(10),
  model: z.string().trim().min(2).max(120),
  year: z.number().int().min(1980).max(2100),
  operation_name: z.string().trim().min(2).max(120),
  operation_logo_url: z.string().trim().url().max(500).nullable().optional(),
});

const updatePlateRegistrySchema = z.object({
  model: z
    .preprocess((val) => (typeof val === "string" ? val.trim() : val), z.string().min(2).max(120))
    .optional()
    .nullable(),
  year: z.preprocess((val) => {
    if (val === "" || val === null || typeof val === "undefined") return undefined;
    if (typeof val === "number") return val;
    if (typeof val === "string") return Number(val);
    return val;
  }, z.number().int().min(1980).max(2100).optional()),

  operation_name: z
    .preprocess((val) => {
      if (val === null || typeof val === "undefined") return null;
      if (typeof val !== "string") return val;
      const trimmed = val.trim();
      return trimmed === "" ? null : trimmed;
    }, z.string().max(120).nullable())
    .optional()
    .nullable(),

  operation_logo_url: z
    .preprocess((val) => {
      if (val === null || typeof val === "undefined") return null;
      if (typeof val !== "string") return val;
      const trimmed = val.trim();
      return trimmed === "" ? null : trimmed;
    }, z.string().max(500).nullable())
    .optional()
    .nullable(),
});

function normalizeStatus(status?: string | null): string {
  return String(status || "")
    .trim()
    .toUpperCase();
}

function isOperationalStatus(status?: string | null): boolean {
  const normalized = normalizeStatus(status);
  return (
    normalized === "EM TRÂNSITO" ||
    normalized === "AGUARDANDO CARREGAMENTO" ||
    normalized === "EFETUANDO CARREGAMENTO" ||
    normalized === "AGUARDANDO DESCARREGAMENTO" ||
    normalized === "EFETUANDO DESCARREGAMENTO"
  );
}

function calculateFleetEfficiency() {
  const vehicles = db.prepare("SELECT status FROM vehicles").all() as Array<{
    status?: string | null;
  }>;
  const totalVehicles = vehicles.length;
  const operationalVehicles = vehicles.filter((vehicle) =>
    isOperationalStatus(vehicle.status),
  ).length;
  const efficiency = totalVehicles
    ? Number(((operationalVehicles / totalVehicles) * 100).toFixed(1))
    : 0;

  return {
    timestamp: new Date().toISOString(),
    efficiency,
    totalVehicles,
    operationalVehicles,
  };
}

function saveFleetEfficiencySnapshot() {
  const snapshot = calculateFleetEfficiency();

  db.prepare(
    `
    INSERT INTO fleet_efficiency_history (timestamp, efficiency, total_vehicles, operational_vehicles)
    VALUES (?, ?, ?, ?)
  `,
  ).run(
    snapshot.timestamp,
    snapshot.efficiency,
    snapshot.totalVehicles,
    snapshot.operationalVehicles,
  );

  return snapshot;
}

function cleanupFinishedMaintenanceByForecast() {
  db.prepare(
    `
    UPDATE vehicles
    SET maintenance_finished_at = NULL
    WHERE maintenance_finished_at IS NOT NULL
      AND (
        SELECT datetime(mh.forecast_date)
        FROM maintenance_history mh
        WHERE mh.plate = vehicles.plate
        ORDER BY datetime(mh.finish_date) DESC, mh.id DESC
        LIMIT 1
      ) <= datetime('now')
  `,
  ).run();
}

async function startServer() {
  const app = express();
  app.disable("x-powered-by");

  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error("Origin não permitida"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
    },
  });

  app.set("trust proxy", 1);

  // CSP is enforced in production. In dev we disable it because Vite injects
  // inline scripts/HMR clients that we don't want to whitelist by hand.
  // The directives below cover what the current shell needs:
  //   - Google Fonts (CSS + font files)
  //   - Material Symbols + Font Awesome CDN
  //   - Leaflet CSS from unpkg + tile providers over HTTPS (any host, since
  //     tiles can come from OSM, CartoDB, Esri, etc. and the user can switch)
  //   - Microsoft OAuth navigation (handled via top-level redirect, not
  //     connect-src, so it doesn't need an explicit entry here)
  //   - Socket.IO same-origin upgrade (ws:/wss:)
  app.use(
    helmet({
      contentSecurityPolicy: IS_PRODUCTION
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              // 'unsafe-inline' is required by login.html (inline <script>
              // and small style overrides) and by the Vite build output that
              // injects a module preload header. Removing it would mean
              // either hashing every inline block or rewriting login.html.
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com",
                "https://unpkg.com",
              ],
              fontSrc: [
                "'self'",
                "data:",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com",
              ],
              imgSrc: ["'self'", "data:", "blob:", "https:"],
              connectSrc: ["'self'", "ws:", "wss:"],
              objectSrc: ["'none'"],
              frameAncestors: ["'self'"],
              formAction: ["'self'"],
              baseUri: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }),
  );

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
  });

  // Auth limiter follows the Orbital pattern: scoped per (ip, email) so a
  // malicious actor can't lock out a real user by hammering their email from
  // another IP, and only failed attempts count (a legit user with a typo
  // doesn't lose their budget once they finally sign in).
  const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = auth.normalizeEmail((req.body as any)?.email);
      // ipKeyGenerator strips IPv6 zone-id / brackets and normalizes to the
      // form express-rate-limit expects. Required for IPv6 safety.
      const ip = ipKeyGenerator(req as any) || "unknown";
      return email ? `${ip}:${email}` : `${ip}:_no_email`;
    },
    message: { error: "Muitas tentativas de login. Tente novamente mais tarde." },
  });

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);

        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Origin não permitida"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(generalLimiter);

  app.use((req, res, next) => {
    if (req.path === "/api/sighra/webhook") return next();

    const method = req.method.toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return requireTrustedOrigin(req, res, next);
    }
    next();
  });

  app.use(auth.attachAuthUser);

  const { requireAuth, requireAdmin } = auth;

  // Login page is a standalone HTML file produced by the frontend build.
  // In dev it lives in frontend/login.html; in prod it's emitted to
  // frontend/dist/login.html (see rollupOptions.input in vite.config.ts).
  const loginHtmlPath = resolveLoginHtmlPath(IS_PRODUCTION);

  app.get("/login", (_req, res) => {
    res.sendFile(loginHtmlPath);
  });

  app.get("/api/auth/me", (req, res) => {
    const authUser = (req as any).authUser as AuthUser | null;
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });
    return res.json({ user: authUser });
  });

  app.post("/api/auth/login", authLimiter, (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Email ou senha inválidos." });
    }

    const email = auth.normalizeEmail(parsed.data.email);
    const password = parsed.data.password;

    const user = auth.getUserByEmail(email);
    if (!user || !user.active) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const authProvider = String(user.auth_provider || "LOCAL").toUpperCase();
    const passwordVerification = verifyPassword(password, String(user.password_hash || ""));

    if (authProvider !== "LOCAL" || !passwordVerification.valid) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    if (passwordVerification.needsUpgrade) {
      auth.upgradePasswordHash(user.id as number, password);
    }

    const token = auth.createSession(user.id as number);
    setSessionCookie(res, token);
    auth.touchLastLogin(user.id as number);

    return res.json({ user: auth.sanitizeUserRow(user) });
  });

  app.post("/api/auth/logout", (req, res) => {
    const rawToken = (req as any).sessionToken as string | undefined;
    if (rawToken) {
      auth.revokeSession(rawToken);
    }
    clearSessionCookie(res);
    return res.json({ success: true });
  });

  app.get("/api/auth/microsoft/start", (_req, res) => {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      return res.status(500).json({ error: "Microsoft SSO não configurado." });
    }

    const state = auth.createOAuthState();

    const redirectUri = `${PUBLIC_BASE_URL}/api/auth/microsoft/callback`;
    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "openid profile email User.Read",
      state,
    });

    return res.redirect(
      `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`,
    );
  });

  app.get("/api/auth/microsoft/callback", async (req, res) => {
    try {
      const state = String(req.query.state || "");
      const code = String(req.query.code || "");

      // Single-use: consumeOAuthState removes the row and only returns true
      // if it existed AND was still within the TTL.
      if (!code || !auth.consumeOAuthState(state)) {
        return res.status(400).send("Falha na autenticação Microsoft.");
      }

      const redirectUri = `${PUBLIC_BASE_URL}/api/auth/microsoft/callback`;
      const tokenResponse = await axios.post(
        `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          scope: "openid profile email User.Read",
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      const accessToken = tokenResponse.data?.access_token;
      if (!accessToken) return res.status(400).send("Token Microsoft inválido.");

      const profileResponse = await axios.get("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const mail = auth.normalizeEmail(
        profileResponse.data?.mail || profileResponse.data?.userPrincipalName,
      );
      const name = String(profileResponse.data?.displayName || mail);
      const domain = mail.split("@")[1] || "";

      if (!mail || domain !== MICROSOFT_ALLOWED_DOMAIN) {
        return res.status(403).send("Conta Microsoft fora do domínio permitido.");
      }

      let user = auth.getUserByEmail(mail);
      if (!user) {
        const role: UserRole = mail === BOOTSTRAP_ADMIN_EMAIL ? "ADMIN" : "USER";

        db.prepare(
          `
    INSERT INTO users (name, email, role, auth_provider, active)
    VALUES (?, ?, ?, 'MICROSOFT', 1)
  `,
        ).run(name, mail, role);

        user = auth.getUserByEmail(mail);
      } else {
        db.prepare(
          `
    UPDATE users
    SET name = ?
    WHERE id = ?
  `,
        ).run(name, user.id);

        user = auth.getUserByEmail(mail);
      }

      if (!user) {
        return res.status(500).send("Erro ao autenticar com Microsoft.");
      }

      if (!user.active) {
        return res.status(403).send("Usuário inativo.");
      }

      const token = auth.createSession(user.id as number);
      setSessionCookie(res, token);
      auth.touchLastLogin(user.id as number);

      return res.redirect("/");
    } catch (error: any) {
      console.error("Erro no login Microsoft:", error?.response?.data || error.message);
      return res.status(500).send("Erro ao autenticar com Microsoft.");
    }
  });

  app.get("/api/users", requireAdmin, (_req, res) => {
    const users = db
      .prepare(
        `
      SELECT id, name, email, role, auth_provider, active, created_at, updated_at, last_login
      FROM users
      ORDER BY datetime(created_at) DESC
    `,
      )
      .all();
    return res.json({ users });
  });

  app.post("/api/users", requireAdmin, (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos." });
    }

    const body = parsed.data;
    const name = body.name;
    const email = auth.normalizeEmail(body.email);
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";
    const active = body.active === false ? 0 : 1;
    const authProvider: AuthProvider = body.auth_provider === "MICROSOFT" ? "MICROSOFT" : "LOCAL";
    const password = body.password || "";

    if (authProvider === "LOCAL" && password.length < 8) {
      return res.status(400).json({ error: "Senha deve ter no mínimo 8 caracteres." });
    }

    try {
      db.prepare(
        `
      INSERT INTO users (name, email, password_hash, role, auth_provider, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      ).run(
        name,
        email,
        authProvider === "LOCAL" ? makePasswordHash(password) : null,
        role,
        authProvider,
        active,
      );

      return res.status(201).json({ success: true });
    } catch {
      return res.status(409).json({ error: "Usuário já existe." });
    }
  });

  app.put("/api/users/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const parsed = updateUserSchema.safeParse(req.body);

    if (!id || !parsed.success) {
      return res.status(400).json({ error: "Dados inválidos." });
    }

    const body = parsed.data;
    const name = body.name;
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";
    const active = body.active === false ? 0 : 1;

    db.prepare(
      `
    UPDATE users
    SET name = ?, role = ?, active = ?
    WHERE id = ?
  `,
    ).run(name, role, active, id);

    return res.json({ success: true });
  });

  app.put("/api/users/:id/reset-password", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const parsed = resetPasswordSchema.safeParse(req.body);

    if (!id || !parsed.success) {
      return res.status(400).json({ error: "Senha mínima de 8 caracteres." });
    }

    db.prepare(
      `
    UPDATE users
    SET password_hash = ?, auth_provider = 'LOCAL'
    WHERE id = ?
  `,
    ).run(makePasswordHash(parsed.data.password), id);

    db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(id);

    return res.json({ success: true });
  });

  function upsertOperation(name: string, logoUrl?: string | null) {
    const operationName = sanitizeText(name, 120);
    if (!operationName) return null;

    const normalizedLogoUrl = sanitizeText(logoUrl ?? null, 500);
    const current = db
      .prepare("SELECT name, logo_url FROM operations WHERE name = ?")
      .get(operationName) as any;

    if (!current) {
      db.prepare(
        `
        INSERT INTO operations (name, logo_url)
        VALUES (?, ?)
      `,
      ).run(operationName, normalizedLogoUrl);
      return operationName;
    }

    if (normalizedLogoUrl) {
      db.prepare(
        `
        UPDATE operations
        SET logo_url = ?
        WHERE name = ?
      `,
      ).run(normalizedLogoUrl, operationName);
    }

    return operationName;
  }

  app.get("/api/admin/operations", requireAdmin, (_req, res) => {
    const operations = db
      .prepare(
        `
      SELECT name, logo_url, created_at, updated_at
      FROM operations
      ORDER BY name ASC
    `,
      )
      .all();
    return res.json({ operations });
  });

  app.get("/api/admin/plates", requireAdmin, (_req, res) => {
    const plates = db
      .prepare(
        `
      SELECT
        pr.plate,
        pr.model,
        pr.year,
        pr.operation_name,
        op.logo_url AS operation_logo_url,
        pr.created_at,
        pr.updated_at
      FROM plate_registry pr
      LEFT JOIN operations op ON op.name = pr.operation_name
      ORDER BY pr.plate ASC
    `,
      )
      .all();

    return res.json({ plates });
  });

  app.post("/api/admin/plates", requireAdmin, (req, res) => {
    const parsed = plateRegistrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos para cadastro da placa." });
    }

    const plate = normalizePlate(parsed.data.plate);
    const model = sanitizeText(parsed.data.model, 120);
    const operationName = sanitizeText(parsed.data.operation_name, 120);
    const year = Number(parsed.data.year);

    if (!plate || !model || !operationName || !Number.isFinite(year)) {
      return res.status(400).json({ error: "Dados inválidos para cadastro da placa." });
    }

    upsertOperation(operationName, parsed.data.operation_logo_url ?? null);

    try {
      db.prepare(
        `
        INSERT INTO plate_registry (plate, model, year, operation_name)
        VALUES (?, ?, ?, ?)
      `,
      ).run(plate, model, year, operationName);
    } catch {
      return res.status(409).json({ error: "Placa já cadastrada." });
    }

    const created = db
      .prepare(
        `
      SELECT pr.plate, pr.model, pr.year, pr.operation_name, op.logo_url AS operation_logo_url
      FROM plate_registry pr
      LEFT JOIN operations op ON op.name = pr.operation_name
      WHERE pr.plate = ?
      LIMIT 1
    `,
      )
      .get(plate);

    return res.status(201).json({ success: true, plate: created });
  });

  app.put("/api/admin/plates/:plate", requireAdmin, (req, res) => {
    const parsed = updatePlateRegistrySchema.safeParse(req.body);
    const plate = normalizePlate(req.params.plate);

    if (!parsed.success || !plate) {
      return res.status(400).json({ error: "Dados inválidos para atualização da placa." });
    }

    const model = sanitizeText(parsed.data.model, 120);
    const operationName = sanitizeText(parsed.data.operation_name, 120);
    const resolvedOperationName = operationName || "SEM OPERACAO";
    const year = Number(parsed.data.year);

    if (!model || !Number.isFinite(year)) {
      return res.status(400).json({ error: "Dados inválidos para atualização da placa." });
    }

    const existing = db
      .prepare("SELECT plate FROM plate_registry WHERE plate = ?")
      .get(plate) as any;
    if (!existing) {
      return res.status(404).json({ error: "Placa não encontrada." });
    }

    upsertOperation(resolvedOperationName, parsed.data.operation_logo_url ?? null);

    db.prepare(
      `
  UPDATE plate_registry
  SET model = ?,
      year = ?,
      operation_name = ?
  WHERE plate = ?
`,
    ).run(model, year, resolvedOperationName, plate);

    const updated = db
      .prepare(
        `
      SELECT pr.plate, pr.model, pr.year, pr.operation_name, op.logo_url AS operation_logo_url
      FROM plate_registry pr
      LEFT JOIN operations op ON op.name = pr.operation_name
      WHERE pr.plate = ?
      LIMIT 1
    `,
      )
      .get(plate);

    return res.json({ success: true, plate: updated });
  });

  app.delete("/api/admin/plates/:plate", requireAdmin, (req, res) => {
    const plate = normalizePlate(req.params.plate);
    if (!plate) {
      return res.status(400).json({ error: "Placa inválida." });
    }

    const existing = db
      .prepare("SELECT plate, operation_name FROM plate_registry WHERE plate = ?")
      .get(plate) as any;
    if (!existing) {
      return res.status(404).json({ error: "Placa não encontrada." });
    }

    db.prepare("DELETE FROM plate_registry WHERE plate = ?").run(plate);

    db.prepare(
      `
      DELETE FROM operations
      WHERE name = ?
        AND NOT EXISTS (
          SELECT 1
          FROM plate_registry
          WHERE operation_name = ?
        )
    `,
    ).run(existing.operation_name, existing.operation_name);

    return res.json({ success: true });
  });

  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth")) return next();
    if (req.path === "/sighra/webhook") return next();
    return requireAuth(req, res, next);
  });

  const sanitizeDriverStmt = db.prepare(`
    UPDATE vehicles
    SET driver = ?
    WHERE plate = ?
  `);
  const existingVehicles = db.prepare(`SELECT plate, driver FROM vehicles`).all() as Array<{
    plate: string;
    driver: string | null;
  }>;
  for (const row of existingVehicles) {
    const normalizedDriver = normalizeDriverName(row.driver);
    if (normalizedDriver && normalizedDriver !== String(row.driver || "").trim()) {
      sanitizeDriverStmt.run(normalizedDriver, row.plate);
    }
  }

  const sanitizeLocationStmt = db.prepare(`
    UPDATE vehicles
    SET location_name = ?,
        last_operational_location = ?
    WHERE plate = ?
  `);
  const existingVehicleLocations = db
    .prepare(
      `
    SELECT plate, location_name, last_operational_location
    FROM vehicles
  `,
    )
    .all() as Array<{
    plate: string;
    location_name: string | null;
    last_operational_location: string | null;
  }>;

  for (const row of existingVehicleLocations) {
    const mappedLocation = mapTrackerLocation(row.location_name);
    const mappedOperationalLocation = mapTrackerLocation(row.last_operational_location);

    if (
      mappedLocation !== (row.location_name || "") ||
      mappedOperationalLocation !== (row.last_operational_location || "")
    ) {
      sanitizeLocationStmt.run(
        mappedLocation || row.location_name,
        mappedOperationalLocation || row.last_operational_location,
        row.plate,
      );
    }
  }

  const soapBaseUrl = requireEnv("SIGHRA_WS_URL").replace(/\?wsdl$/i, "");
  const sighraUser = requireEnv("SIGHRA_USER");
  const sighraPass = requireEnv("SIGHRA_PASS");

  const rasterBaseUrl = requireEnv("RASTER_BASE_URL");
  const rasterMethod = optionalEnv("RASTER_METHOD", "getEventoFimViagem");
  const rasterLogin = requireEnv("RASTER_LOGIN");
  const rasterPassword = requireEnv("RASTER_PASSWORD");

  const sighraClient = createSighraClient({
    soapBaseUrl,
    user: sighraUser,
    pass: sighraPass,
  });

  const rasterClient = createRasterClient({
    baseUrl: rasterBaseUrl,
    method: rasterMethod,
    login: rasterLogin,
    password: rasterPassword,
  });

  const sighraSync = createSighraSyncService({
    db,
    io,
    sighraClient,
    vehicleRepo,
    soapBaseUrl,
  });

  const rasterSync = createRasterSyncService({
    db,
    io,
    rasterClient,
    vehicleRepo,
    rasterLogin,
    rasterPassword,
  });

  const sighraWebhookHandler = createSighraWebhookHandler({ db, io, vehicleRepo });

  app.get("/api/vehicles/:plate/raster-trip", async (req, res) => {
    const { status, body } = await handleRasterTripRequest(
      { rasterClient, rasterLogin, rasterPassword },
      req.params.plate,
    );
    return res.status(status).json(body);
  });

  const vehicleService = createVehicleService({ db, vehicleRepo, io });
  registerVehicleRoutes(app, vehicleService);

  app.get("/api/efficiency/current", (_req, res) => {
    const snapshot = calculateFleetEfficiency();

    res.json({
      timestamp: snapshot.timestamp,
      efficiency: snapshot.efficiency,
      totalVehicles: snapshot.totalVehicles,
      operationalVehicles: snapshot.operationalVehicles,
    });
  });

  app.get("/api/efficiency/start-of-day", (_req, res) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const startIso = startOfDay.toISOString();
    const endIso = endOfDay.toISOString();

    const currentDayRecord = db
      .prepare(
        `
      SELECT id, timestamp, efficiency, total_vehicles, operational_vehicles
      FROM fleet_efficiency_history
      WHERE timestamp >= ? AND timestamp < ?
      ORDER BY ABS(strftime('%s', timestamp) - strftime('%s', ?)) ASC
      LIMIT 1
    `,
      )
      .get(startIso, endIso, startIso) as any;

    const closestRecord =
      currentDayRecord ||
      (db
        .prepare(
          `
      SELECT id, timestamp, efficiency, total_vehicles, operational_vehicles
      FROM fleet_efficiency_history
      ORDER BY ABS(strftime('%s', timestamp) - strftime('%s', ?)) ASC
      LIMIT 1
    `,
        )
        .get(startIso) as any);

    if (!closestRecord) {
      const snapshot = calculateFleetEfficiency();
      return res.json({
        timestamp: snapshot.timestamp,
        efficiency: snapshot.efficiency,
        totalVehicles: snapshot.totalVehicles,
        operationalVehicles: snapshot.operationalVehicles,
        source: "fallback-current",
      });
    }

    res.json({
      id: closestRecord.id,
      timestamp: closestRecord.timestamp,
      efficiency: Number(closestRecord.efficiency),
      totalVehicles: Number(closestRecord.total_vehicles),
      operationalVehicles: Number(closestRecord.operational_vehicles),
      source: currentDayRecord ? "history-current-day" : "history-nearest",
    });
  });

  app.get("/api/sync/status", (_req, res) => {
    res.json(sighraSync.getSyncStatus());
  });

  app.get("/api/macros/status", (_req, res) => {
    res.json(sighraSync.getMacrosStatus());
  });

  app.get("/api/macros/today", (_req, res) => {
    const macros = db
      .prepare(
        `
      SELECT *
      FROM macros_history
      WHERE date(datetime(created_at, '-3 hours')) >= date('now', '-1 day', 'localtime')
      ORDER BY datetime(created_at) DESC
    `,
      )
      .all();

    res.json(macros);
  });

  app.post("/api/sighra/webhook", sighraWebhookHandler);

  app.get("/", (req, res, next) => {
    const authUser = (req as any).authUser as AuthUser | null;
    if (!authUser) {
      return res.redirect("/login");
    }
    next();
  });

  // SPA static hosting in production. In dev the frontend is served by the
  // Vite dev server on a separate port (see frontend/vite.config.ts) which
  // proxies /api, /login and /socket.io back to this backend.
  if (IS_PRODUCTION) {
    const frontendDist = resolveFrontendDistPath();
    app.use(express.static(frontendDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  io.use((socket, next) => {
    const cookies = parseCookies(socket.request.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    const user = auth.getAuthUserFromToken(token);
    if (!user) {
      return next(new Error("Unauthorized"));
    }
    (socket.data as any).authUser = user;
    next();
  });

  io.on("connection", (socket) => {
    console.log("Client connected", (socket.data as any).authUser?.email || "unknown");

    vehicleService.clearStaleMaintenanceFinishedAt();

    socket.emit("init:vehicles", vehicleRepo.getAllVehicles());
    socket.emit("sync:status", sighraSync.getSyncStatus());
    socket.emit("macros:status", sighraSync.getMacrosStatus());
  });

  httpServer.listen(APP_PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://0.0.0.0:${APP_PORT}`);

    cleanupOldMacrosHistory(db);

    await sighraSync.pollMacros(true);
    await sighraSync.pollPositions();
    await rasterSync.pollTrips();

    saveFleetEfficiencySnapshot();

    setInterval(() => {
      saveFleetEfficiencySnapshot();
    }, 300000);

    setInterval(() => {
      sighraSync.pollPositions();
    }, 60000);

    setInterval(() => {
      rasterSync.pollTrips();
    }, 120000);

    setInterval(() => {
      cleanupOldMacrosHistory(db);
      sighraSync.pollMacros(false);
    }, 300000);

    setInterval(() => {
      cleanupFinishedMaintenanceByForecast();
    }, 60000);
  });
}

export { startServer };
