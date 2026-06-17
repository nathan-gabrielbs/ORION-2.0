// Orbital OIDC integration using openid-client v6.
//
// Responsibilities:
//   - Lazy OIDC discovery + Configuration cache.
//   - Authorization URL construction with PKCE S256 + state + nonce.
//   - Callback handling (authorization_code grant, id_token validation).
//   - Refresh token rotation.
//   - End-session (logout) URL construction.
//   - Translation of Orbital claims -> Orion identity + role contract.
//
// Mirrors the Synapse module (backend/src/auth/orbital.ts) but maps claims onto
// Orion's role-based authorization model (ADMIN/USER) instead of Synapse's
// granular permission catalog.

import * as client from "openid-client";
import {
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_ISSUER,
  OIDC_POST_LOGOUT_REDIRECT_URI,
  OIDC_REDIRECT_URI,
  OIDC_SCOPES,
  ORBITAL_ADMIN_ROLE_KEY,
  ORBITAL_OK,
} from "../../shared/app-config.js";

// ---------- Discovery (lazy, memoized) ----------

let configPromise: Promise<client.Configuration> | null = null;

export function resetOrbitalConfig(): void {
  configPromise = null;
}

export async function getOrbitalConfig(): Promise<client.Configuration> {
  if (!ORBITAL_OK) {
    throw new Error(
      "Orbital OIDC não configurado: defina OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET e OIDC_REDIRECT_URI no .env",
    );
  }
  if (!configPromise) {
    configPromise = client
      .discovery(
        new URL(OIDC_ISSUER),
        OIDC_CLIENT_ID,
        undefined,
        client.ClientSecretPost(OIDC_CLIENT_SECRET),
      )
      .catch((err) => {
        // Allow retry on next call instead of caching the failure.
        configPromise = null;
        throw err;
      });
  }
  return configPromise;
}

// ---------- Auth URL ----------

export interface OrbitalAuthRequestState {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

export async function buildOrbitalAuthUrl(returnTo: string): Promise<{
  url: string;
  requestState: OrbitalAuthRequestState;
}> {
  const config = await getOrbitalConfig();

  const state = client.randomState();
  const nonce = client.randomNonce();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: OIDC_REDIRECT_URI,
    scope: OIDC_SCOPES,
    response_type: "code",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    url: url.toString(),
    requestState: { state, nonce, codeVerifier, returnTo },
  };
}

// ---------- Callback ----------

export interface OrbitalTokenBundle {
  idToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: number;
  claims: Record<string, unknown>;
}

export async function handleOrbitalCallback(
  currentUrl: URL,
  expected: Pick<OrbitalAuthRequestState, "state" | "nonce" | "codeVerifier">,
): Promise<OrbitalTokenBundle> {
  const config = await getOrbitalConfig();

  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    expectedState: expected.state,
    expectedNonce: expected.nonce,
    pkceCodeVerifier: expected.codeVerifier,
    idTokenExpected: true,
  });

  const claims = tokens.claims();
  if (!claims) {
    throw new Error("Orbital: id_token sem claims após validação");
  }

  return {
    idToken: tokens.id_token ?? "",
    refreshToken: tokens.refresh_token ?? null,
    accessTokenExpiresAt: computeExpiresAt(tokens.expires_in),
    claims: claims as Record<string, unknown>,
  };
}

// ---------- Refresh ----------

export async function refreshOrbitalTokens(refreshToken: string): Promise<OrbitalTokenBundle> {
  const config = await getOrbitalConfig();
  const tokens = await client.refreshTokenGrant(config, refreshToken);

  const claims = tokens.claims();
  return {
    idToken: tokens.id_token ?? "",
    refreshToken: tokens.refresh_token ?? refreshToken,
    accessTokenExpiresAt: computeExpiresAt(tokens.expires_in),
    claims: (claims ?? {}) as Record<string, unknown>,
  };
}

function computeExpiresAt(expiresIn: number | undefined): number {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) {
    // Fallback: assume the Orbital default of 15 minutes when missing.
    return Date.now() + 15 * 60 * 1000;
  }
  return Date.now() + expiresIn * 1000;
}

// ---------- Logout ----------

export async function buildOrbitalLogoutUrl(idTokenHint: string | null): Promise<string> {
  const config = await getOrbitalConfig();
  const params: Record<string, string> = {
    client_id: OIDC_CLIENT_ID,
  };
  if (OIDC_POST_LOGOUT_REDIRECT_URI) {
    params.post_logout_redirect_uri = OIDC_POST_LOGOUT_REDIRECT_URI;
  }
  if (idTokenHint) {
    params.id_token_hint = idTokenHint;
  }
  const url = client.buildEndSessionUrl(config, params);
  return url.toString();
}

// ---------- Claims -> Orion identity mapping ----------

export interface MappedOrbitalIdentity {
  sub: string;
  email: string;
  displayName: string;
  photoUrl: string | null;
}

export interface MappedOrbitalClaims {
  identity: MappedOrbitalIdentity;
  // Whether Orbital reports the global admin role -> maps to Orion role ADMIN.
  isAdmin: boolean;
  // Whether the user is allowed to sign in to Orion (valid email from OIDC).
  // orbital_permissions may be used for feature-level auth in the future.
  canLogin: boolean;
  // Parsed Orbital permission keys (reserved for future feature-level authorization).
  permissions: string[];
}

export function mapOrbitalClaims(claims: Record<string, unknown>): MappedOrbitalClaims {
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const email =
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.preferred_username === "string" ? claims.preferred_username : "");
  const displayName =
    (typeof claims.name === "string" && claims.name) ||
    (typeof claims.preferred_username === "string" ? claims.preferred_username : "") ||
    email;
  const photoUrl = typeof claims.picture === "string" ? claims.picture : null;

  const orbitalRoles = Array.isArray(claims.orbital_roles)
    ? (claims.orbital_roles as unknown[]).map((r) => String(r || "").trim())
    : [];
  const isAdmin = orbitalRoles.includes(ORBITAL_ADMIN_ROLE_KEY);

  const rawPerms = (claims.orbital_permissions as Record<string, unknown> | undefined) || {};
  const permissionKeys = Array.isArray(rawPerms.permissions)
    ? (rawPerms.permissions as unknown[]).map((entry) => extractPermissionKey(entry))
    : [];
  const normalizedEmail = email.toLowerCase();

  return {
    identity: { sub, email: normalizedEmail, displayName, photoUrl },
    isAdmin,
    // SSO login gate: valid OIDC email is enough. Do NOT use permissions here.
    canLogin: Boolean(normalizedEmail),
    // Parsed for future feature-level authorization (routes/middleware), not login.
    permissions: permissionKeys,
  };
}

/**
 * Normalizes one entry from orbital_permissions.permissions.
 *
 * Orbital may emit different shapes over time; supported today:
 *   - string: "login"
 *   - { permissionKey: "login" } / { chave: "login" } (legacy/tests)
 *   - { key: "login", crud: 15 } (current Orbital payload — crud is ignored here)
 *
 * Before gating any feature on mapped.permissions:
 *   1. Validate against a real id_token/userinfo from the linked Orbital system.
 *   2. Extend this parser (and tests) if new fields appear.
 *   3. Prefer Orion-local RBAC or a dedicated middleware over reusing the SSO login gate.
 *   4. Optional: env flag to require orbital "login" permission again once the OIDC
 *      client has linked_system_id configured in Orbital.
 */
function extractPermissionKey(entry: unknown): string {
  if (typeof entry === "string") return entry.trim().toLowerCase();
  if (entry && typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    const key =
      (typeof obj.key === "string" && obj.key) ||
      (typeof obj.permissionKey === "string" && obj.permissionKey) ||
      (typeof obj.chave === "string" && obj.chave) ||
      "";
    return String(key).trim().toLowerCase();
  }
  return "";
}
