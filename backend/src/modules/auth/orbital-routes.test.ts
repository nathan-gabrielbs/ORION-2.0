import express from "express";
import session from "express-session";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../../test/helpers/database.js";
import { createAuthService } from "./service.js";
import { createOAuthStateService } from "./oauth-state.js";
import { registerOrbitalRoutes } from "./orbital-routes.js";

const orbitalMocks = vi.hoisted(() => ({
  buildOrbitalAuthUrl: vi.fn(),
  handleOrbitalCallback: vi.fn(),
  mapOrbitalClaims: vi.fn(),
  buildOrbitalLogoutUrl: vi.fn(),
  refreshOrbitalTokens: vi.fn(),
}));

vi.mock("../../integrations/orbital/index.js", () => orbitalMocks);

vi.mock("../../shared/app-config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/app-config.js")>();
  return {
    ...actual,
    ORBITAL_OK: true,
    BOOTSTRAP_ADMIN_EMAIL: "admin@local.dev",
  };
});

function createTestApp(db: Database.Database) {
  const auth = createAuthService(db);
  const oauth = createOAuthStateService(db);
  const app = express();
  app.use(
    session({
      secret: "test-session-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );
  registerOrbitalRoutes(app, { auth, oauth, db });
  return { app, auth };
}

describe("registerOrbitalRoutes", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
    vi.clearAllMocks();
  });

  afterEach(() => {
    db?.close();
  });

  it("GET /auth/orbital/login returns authorize URL and stores PKCE state", async () => {
    orbitalMocks.buildOrbitalAuthUrl.mockResolvedValue({
      url: "https://orbital.example/authorize?state=abc",
      requestState: {
        state: "state-abc",
        nonce: "nonce-1",
        codeVerifier: "verifier-1",
        returnTo: "/",
      },
    });

    const { app, auth: _auth } = createTestApp(db);
    const oauth = createOAuthStateService(db);

    const res = await request(app).get("/auth/orbital/login").expect(200);

    expect(res.body).toEqual({ url: "https://orbital.example/authorize?state=abc" });
    expect(oauth.consumeOAuthState("state-abc")).toMatchObject({
      nonce: "nonce-1",
      codeVerifier: "verifier-1",
    });
  });

  it("GET /auth/callback redirects to access_denied when login permission is missing", async () => {
    const oauth = createOAuthStateService(db);
    oauth.saveOAuthState({
      state: "state-denied",
      nonce: "nonce-d",
      codeVerifier: "verifier-d",
      returnTo: "/",
    });

    orbitalMocks.handleOrbitalCallback.mockResolvedValue({
      idToken: "id-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: Date.now() + 60_000,
      claims: { sub: "sub-1", email: "user@grpotencial.com.br" },
    });
    orbitalMocks.mapOrbitalClaims.mockReturnValue({
      identity: {
        sub: "sub-1",
        email: "user@grpotencial.com.br",
        displayName: "User",
        photoUrl: null,
      },
      isAdmin: false,
      canLogin: false,
    });

    const { app } = createTestApp(db);
    const res = await request(app)
      .get("/auth/callback")
      .query({ state: "state-denied", code: "auth-code" })
      .expect(302);

    expect(res.headers.location).toBe("/login?error=access_denied");
  });

  it("GET /auth/callback creates user, session cookie, and redirects on success", async () => {
    const oauth = createOAuthStateService(db);
    oauth.saveOAuthState({
      state: "state-ok",
      nonce: "nonce-ok",
      codeVerifier: "verifier-ok",
      returnTo: "/dashboard",
    });

    orbitalMocks.handleOrbitalCallback.mockResolvedValue({
      idToken: "id-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: Date.now() + 60_000,
      claims: { sub: "sub-2", email: "orbital.user@grpotencial.com.br" },
    });
    orbitalMocks.mapOrbitalClaims.mockReturnValue({
      identity: {
        sub: "sub-2",
        email: "orbital.user@grpotencial.com.br",
        displayName: "Orbital User",
        photoUrl: null,
      },
      isAdmin: false,
      canLogin: true,
    });

    const { app, auth } = createTestApp(db);
    const res = await request(app)
      .get("/auth/callback")
      .query({ state: "state-ok", code: "auth-code" })
      .expect(302);

    expect(res.headers.location).toBe("/dashboard");

    const setCookie = res.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie || "");
    expect(cookieHeader).toContain("orion_session=");

    const user = auth.getUserByEmail("orbital.user@grpotencial.com.br");
    expect(user).toMatchObject({
      name: "Orbital User",
      auth_provider: "ORBITAL",
      role: "USER",
      active: 1,
    });
  });

  it("GET /auth/callback redirects to missing_state when PKCE state is unknown", async () => {
    const { app } = createTestApp(db);
    const res = await request(app)
      .get("/auth/callback")
      .query({ state: "unknown", code: "auth-code" })
      .expect(302);

    expect(res.headers.location).toBe("/login?error=missing_state");
  });

  it("GET /logout/callback redirects to /login", async () => {
    const { app } = createTestApp(db);
    const res = await request(app).get("/logout/callback").expect(302);
    expect(res.headers.location).toBe("/login");
  });
});
