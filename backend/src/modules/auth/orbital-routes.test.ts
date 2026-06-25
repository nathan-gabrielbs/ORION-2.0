import express from "express";
import session from "express-session";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  createTestDatabase,
  resetTestDatabase,
} from "../../test/helpers/database.js";
import { createAuthService } from "./service.js";
import { createOAuthStateService } from "./oauth-state.js";
import { registerOrbitalRoutes } from "./orbital-routes.js";
import { query } from "../../db/client.js";

async function seedUser(input: { email: string; role: "ADMIN" | "USER" }): Promise<void> {
  await query(
    `
    INSERT INTO users (name, email, role, auth_provider, active)
    VALUES ($1, $2, $3, 'ORBITAL', TRUE)
  `,
    [input.email, input.email, input.role],
  );
}

function mockOrbitalCallback(input: { sub: string; email: string; displayName: string }): void {
  orbitalMocks.handleOrbitalCallback.mockResolvedValue({
    idToken: "id-token",
    refreshToken: "refresh-token",
    accessTokenExpiresAt: Date.now() + 60_000,
    claims: { sub: input.sub, email: input.email },
  });
  orbitalMocks.mapOrbitalClaims.mockReturnValue({
    identity: {
      sub: input.sub,
      email: input.email,
      displayName: input.displayName,
      photoUrl: null,
    },
    isAdmin: false,
    canLogin: true,
    permissions: [],
  });
}

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

function createTestApp() {
  const auth = createAuthService();
  const oauth = createOAuthStateService();
  const app = express();
  app.use(
    session({
      secret: "test-session-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );
  registerOrbitalRoutes(app, { auth, oauth });
  return { app, auth, oauth };
}

describe("registerOrbitalRoutes", () => {
  beforeEach(async () => {
    await createTestDatabase();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await resetTestDatabase();
    await closeDatabase();
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

    const { app, oauth } = createTestApp();

    const res = await request(app).get("/auth/orbital/login").expect(200);

    expect(res.body).toEqual({ url: "https://orbital.example/authorize?state=abc" });
    expect(await oauth.consumeOAuthState("state-abc")).toMatchObject({
      nonce: "nonce-1",
      codeVerifier: "verifier-1",
    });
  });

  it("GET /auth/callback redirects to access_denied when email is missing", async () => {
    const { app, oauth } = createTestApp();
    await oauth.saveOAuthState({
      state: "state-denied",
      nonce: "nonce-d",
      codeVerifier: "verifier-d",
      returnTo: "/",
    });

    orbitalMocks.handleOrbitalCallback.mockResolvedValue({
      idToken: "id-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: Date.now() + 60_000,
      claims: { sub: "sub-1" },
    });
    orbitalMocks.mapOrbitalClaims.mockReturnValue({
      identity: {
        sub: "sub-1",
        email: "",
        displayName: "User",
        photoUrl: null,
      },
      isAdmin: false,
      canLogin: false,
      permissions: [],
    });

    const res = await request(app)
      .get("/auth/callback")
      .query({ state: "state-denied", code: "auth-code" })
      .expect(302);

    expect(res.headers.location).toBe("/login?error=access_denied");
  });

  it("GET /auth/callback allows common users without orbital_permissions", async () => {
    const { app, auth, oauth } = createTestApp();
    await oauth.saveOAuthState({
      state: "state-common",
      nonce: "nonce-c",
      codeVerifier: "verifier-c",
      returnTo: "/",
    });

    orbitalMocks.handleOrbitalCallback.mockResolvedValue({
      idToken: "id-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: Date.now() + 60_000,
      claims: { sub: "sub-common", email: "common@grpotencial.com.br" },
    });
    orbitalMocks.mapOrbitalClaims.mockReturnValue({
      identity: {
        sub: "sub-common",
        email: "common@grpotencial.com.br",
        displayName: "Common User",
        photoUrl: null,
      },
      isAdmin: false,
      canLogin: true,
      permissions: [],
    });

    const res = await request(app)
      .get("/auth/callback")
      .query({ state: "state-common", code: "auth-code" })
      .expect(302);

    expect(res.headers.location).toBe("/");

    const user = await auth.getUserByEmail("common@grpotencial.com.br");
    expect(user).toMatchObject({
      role: "USER",
      auth_provider: "ORBITAL",
      active: true,
    });
  });

  it("GET /auth/callback creates user, session cookie, and redirects on success", async () => {
    const { app, auth, oauth } = createTestApp();
    await oauth.saveOAuthState({
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
      permissions: [],
    });

    const res = await request(app)
      .get("/auth/callback")
      .query({ state: "state-ok", code: "auth-code" })
      .expect(302);

    expect(res.headers.location).toBe("/dashboard");

    const setCookie = res.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie || "");
    expect(cookieHeader).toContain("orion_session=");

    const user = await auth.getUserByEmail("orbital.user@grpotencial.com.br");
    expect(user).toMatchObject({
      name: "Orbital User",
      auth_provider: "ORBITAL",
      role: "USER",
      active: true,
    });
  });

  it("GET /auth/callback keeps the locally-managed role on re-login (does not downgrade)", async () => {
    const { app, auth, oauth } = createTestApp();
    await seedUser({ email: "promoted@grpotencial.com.br", role: "ADMIN" });
    await oauth.saveOAuthState({
      state: "state-keep",
      nonce: "nonce-k",
      codeVerifier: "verifier-k",
      returnTo: "/",
    });

    mockOrbitalCallback({
      sub: "sub-keep",
      email: "promoted@grpotencial.com.br",
      displayName: "Promoted User",
    });

    await request(app)
      .get("/auth/callback")
      .query({ state: "state-keep", code: "auth-code" })
      .expect(302);

    const user = await auth.getUserByEmail("promoted@grpotencial.com.br");
    expect(user).toMatchObject({ role: "ADMIN", name: "Promoted User" });
  });

  it("GET /auth/callback re-promotes the principal admin (break-glass)", async () => {
    const { app, auth, oauth } = createTestApp();
    await seedUser({ email: "admin@local.dev", role: "USER" });
    await oauth.saveOAuthState({
      state: "state-principal",
      nonce: "nonce-p",
      codeVerifier: "verifier-p",
      returnTo: "/",
    });

    mockOrbitalCallback({
      sub: "sub-principal",
      email: "admin@local.dev",
      displayName: "Principal",
    });

    await request(app)
      .get("/auth/callback")
      .query({ state: "state-principal", code: "auth-code" })
      .expect(302);

    const user = await auth.getUserByEmail("admin@local.dev");
    expect(user).toMatchObject({ role: "ADMIN" });
  });

  it("GET /auth/callback redirects to missing_state when PKCE state is unknown", async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .get("/auth/callback")
      .query({ state: "unknown", code: "auth-code" })
      .expect(302);

    expect(res.headers.location).toBe("/login?error=missing_state");
  });

  it("GET /logout/callback redirects to /login", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/logout/callback").expect(302);
    expect(res.headers.location).toBe("/login");
  });
});
