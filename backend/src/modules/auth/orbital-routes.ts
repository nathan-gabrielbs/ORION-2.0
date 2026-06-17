import type Database from "better-sqlite3";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import {
  buildOrbitalAuthUrl,
  buildOrbitalLogoutUrl,
  handleOrbitalCallback,
  mapOrbitalClaims,
  refreshOrbitalTokens,
} from "../../integrations/orbital/index.js";
import {
  BOOTSTRAP_ADMIN_EMAIL,
  OIDC_REFRESH_LEEWAY_MS,
  ORBITAL_OK,
} from "../../shared/app-config.js";
import { clearSessionCookie, setSessionCookie } from "./cookies.js";
import type { OAuthStateService } from "./oauth-state.js";
import type { AuthService } from "./service.js";

// Orbital token bundle kept in express-session so the refresh middleware can
// rotate the OIDC tokens and so logout can pass an id_token_hint to Orbital.
// Orion's own authorization still runs off the native user_sessions cookie.
interface OrbitalSessionState {
  idToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: number;
  sub: string;
  email: string;
}

declare module "express-session" {
  interface SessionData {
    orbital?: OrbitalSessionState;
  }
}

function reconstructCallbackUrl(req: Request): URL {
  const forwardedProto = (req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const proto = forwardedProto || req.protocol;
  const host = req.get("host") || "localhost";
  return new URL(`${proto}://${host}${req.originalUrl}`);
}

export function registerOrbitalRoutes(
  app: Express,
  deps: {
    auth: AuthService;
    oauth: OAuthStateService;
    db: Database.Database;
  },
) {
  const { auth, oauth, db } = deps;

  const insertOrbitalUser = db.prepare(`
    INSERT INTO users (name, email, role, auth_provider, active)
    VALUES (?, ?, ?, 'ORBITAL', 1)
  `);

  const updateOrbitalUser = db.prepare(`
    UPDATE users
    SET name = ?, role = ?
    WHERE id = ?
  `);

  // Returns { url } for the SPA to redirect to (does not redirect directly).
  app.get("/auth/orbital/login", async (req, res) => {
    if (!ORBITAL_OK) {
      return res.status(503).json({
        error: "SSO corporativo (Orbital) não configurado.",
        details:
          "Defina OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET e OIDC_REDIRECT_URI no .env.",
      });
    }

    try {
      const returnTo = String(req.query.returnUrl || "/");
      const { url, requestState } = await buildOrbitalAuthUrl(returnTo);
      oauth.saveOAuthState(requestState);
      return res.json({ url });
    } catch (error) {
      console.error("[Orbital] Erro ao gerar URL de autenticação:", error);
      return res.status(500).json({ error: "Erro ao iniciar login SSO." });
    }
  });

  // OIDC redirect_uri registered in the Orbital client. Path mirrors Synapse.
  app.get("/auth/callback", async (req, res) => {
    if (!ORBITAL_OK) {
      return res.redirect("/login?error=orbital_not_configured");
    }

    const errorParam = req.query.error as string | undefined;
    if (errorParam) {
      console.error(`[Orbital] Authorization error: ${errorParam}`);
      return res.redirect(`/login?error=${encodeURIComponent(errorParam)}`);
    }

    const state = String(req.query.state || "");
    const pending = oauth.consumeOAuthState(state);
    if (!pending) {
      return res.redirect("/login?error=missing_state");
    }

    try {
      const tokenBundle = await handleOrbitalCallback(reconstructCallbackUrl(req), {
        state: pending.state,
        nonce: pending.nonce,
        codeVerifier: pending.codeVerifier,
      });

      const mapped = mapOrbitalClaims(tokenBundle.claims);
      const email = auth.normalizeEmail(mapped.identity.email);

      if (!email) {
        console.warn("[Orbital] Callback denied: missing email in id_token claims", {
          sub: mapped.identity.sub || "unknown",
        });
        return res.redirect("/login?error=access_denied");
      }

      // Orbital roles dictate the Orion role, but the break-glass principal admin
      // is never demoted (ensurePrincipalAdmin also re-promotes it at boot).
      const role = mapped.isAdmin || email === BOOTSTRAP_ADMIN_EMAIL ? "ADMIN" : "USER";

      let user = auth.getUserByEmail(email);
      if (!user) {
        insertOrbitalUser.run(mapped.identity.displayName || email, email, role);
        user = auth.getUserByEmail(email);
      } else {
        // Respect local deactivation as an extra gate beyond Orbital permissions.
        if (!user.active) {
          return res.redirect("/login?error=inactive");
        }
        updateOrbitalUser.run(mapped.identity.displayName || email, role, user.id);
        user = auth.getUserByEmail(email);
      }

      if (!user) {
        return res.redirect("/login?error=callback_failed");
      }

      // Bridge: mint the native Orion session so the auth guard and Socket.IO
      // (which read the orion_session cookie) keep working unchanged.
      const token = auth.createSession(user.id as number);
      setSessionCookie(res, token);
      auth.touchLastLogin(user.id as number);

      // Keep the Orbital token bundle for refresh + logout (future Orbital API use).
      req.session.orbital = {
        idToken: tokenBundle.idToken,
        refreshToken: tokenBundle.refreshToken,
        accessTokenExpiresAt: tokenBundle.accessTokenExpiresAt,
        sub: mapped.identity.sub,
        email,
      };

      return res.redirect(pending.returnTo || "/");
    } catch (error) {
      console.error("[Orbital] Erro no callback:", error);
      return res.redirect("/login?error=callback_failed");
    }
  });

  // Logout: ends the native Orion session and redirects to the Orbital end-session.
  app.get("/auth/orbital/logout", async (req, res) => {
    const idTokenHint = req.session.orbital?.idToken || null;

    const rawToken = (req as Request & { sessionToken?: string }).sessionToken;
    if (rawToken) auth.revokeSession(rawToken);
    clearSessionCookie(res);

    await new Promise<void>((resolve) => {
      req.session.destroy(() => resolve());
    });

    if (ORBITAL_OK) {
      try {
        return res.redirect(await buildOrbitalLogoutUrl(idTokenHint));
      } catch (error) {
        console.error("[Orbital] Erro ao montar logout URL:", error);
      }
    }
    return res.redirect("/login");
  });

  // Landing for Orbital's post_logout_redirect_uri (OIDC_POST_LOGOUT_REDIRECT_URI).
  app.get("/logout/callback", (_req, res) => {
    res.redirect("/login");
  });
}

/**
 * Keeps the Orbital token bundle in express-session fresh before downstream
 * handlers run. No-ops when there is no Orbital session. Ported from Synapse's
 * refresh-middleware; on failure it drops the bundle but preserves the native
 * Orion session (which is the real source of auth).
 */
export const ensureFreshOrbitalToken: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const orbital = req.session?.orbital;
  if (!orbital || !orbital.refreshToken) {
    return next();
  }

  if (Date.now() < orbital.accessTokenExpiresAt - OIDC_REFRESH_LEEWAY_MS) {
    return next();
  }

  try {
    const refreshed = await refreshOrbitalTokens(orbital.refreshToken);
    req.session.orbital = {
      ...orbital,
      idToken: refreshed.idToken || orbital.idToken,
      refreshToken: refreshed.refreshToken,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
    };
  } catch (error) {
    console.error("[Orbital] Refresh falhou, descartando tokens da sessão:", error);
    req.session.orbital = undefined;
  }
  next();
};
