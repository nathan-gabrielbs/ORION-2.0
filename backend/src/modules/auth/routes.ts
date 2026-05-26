import axios from "axios";
import type Database from "better-sqlite3";
import type { Express, RequestHandler } from "express";
import {
  BOOTSTRAP_ADMIN_EMAIL,
  MICROSOFT_ALLOWED_DOMAIN,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  MICROSOFT_TENANT_ID,
  PUBLIC_BASE_URL,
} from "../../shared/app-config.js";
import type { AuthUser, UserRole } from "../../shared/types/auth.js";
import { clearSessionCookie, setSessionCookie } from "./cookies.js";
import { loginSchema } from "./dto.js";
import type { OAuthStateService } from "./oauth-state.js";
import { verifyPassword } from "./password.js";
import type { AuthService } from "./service.js";

type AuthRoutesModule = AuthService & OAuthStateService;

export function registerAuthRoutes(
  app: Express,
  deps: {
    auth: AuthRoutesModule;
    authLimiter: RequestHandler;
    db: Database.Database;
    loginHtmlPath: string;
  },
) {
  const { auth, authLimiter, db, loginHtmlPath } = deps;

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
}
