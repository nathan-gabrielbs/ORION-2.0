import type { Express, RequestHandler } from "express";
import type { AuthUser } from "../../shared/types/auth.js";
import { clearSessionCookie, setSessionCookie } from "./cookies.js";
import { loginSchema } from "./dto.js";
import { verifyPassword } from "./password.js";
import type { AuthService } from "./service.js";

export function registerAuthRoutes(
  app: Express,
  deps: {
    auth: AuthService;
    authLimiter: RequestHandler;
    loginHtmlPath: string;
  },
) {
  const { auth, authLimiter, loginHtmlPath } = deps;

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
}
