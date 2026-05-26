import type { Express, RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import cors from "cors";
import express from "express";
import type { AuthModule } from "../../modules/auth/index.js";
import { isAllowedOrigin, requireTrustedOrigin } from "../cors.js";

export function createGeneralLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
  });
}

export function createAuthLimiter(auth: AuthModule): RequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = auth.normalizeEmail((req.body as { email?: string })?.email);
      const ip = ipKeyGenerator(req as any) || "unknown";
      return email ? `${ip}:${email}` : `${ip}:_no_email`;
    },
    message: { error: "Muitas tentativas de login. Tente novamente mais tarde." },
  });
}

export function configureHttpMiddleware(app: Express, generalLimiter: RequestHandler): void {
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (isAllowedOrigin(origin)) return callback(null, true);
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
}
