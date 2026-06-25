import type { Express } from "express";
import type { AuthUser } from "../../shared/types/auth.js";
import { clearSessionCookie } from "./cookies.js";
import type { AuthService } from "./service.js";

export function registerAuthRoutes(
  app: Express,
  deps: {
    auth: AuthService;
    loginHtmlPath: string;
  },
) {
  const { auth, loginHtmlPath } = deps;

  app.get("/login", (_req, res) => {
    res.sendFile(loginHtmlPath);
  });

  app.get("/api/auth/me", (req, res) => {
    const authUser = (req as any).authUser as AuthUser | null;
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });
    return res.json({ user: authUser });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const rawToken = (req as any).sessionToken as string | undefined;
    if (rawToken) {
      await auth.revokeSession(rawToken);
    }
    clearSessionCookie(res);
    return res.json({ success: true });
  });
}
