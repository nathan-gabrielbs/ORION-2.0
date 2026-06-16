import { describe, expect, it } from "vitest";
import { mapOrbitalClaims } from "./client.js";

describe("mapOrbitalClaims", () => {
  it("maps the admin role to isAdmin and grants login", () => {
    const result = mapOrbitalClaims({
      sub: "user-1",
      email: "Admin@GrPotencial.com.br",
      name: "Admin User",
      orbital_roles: ["admin"],
    });

    expect(result.isAdmin).toBe(true);
    expect(result.canLogin).toBe(true);
    expect(result.identity).toMatchObject({
      sub: "user-1",
      email: "admin@grpotencial.com.br",
      displayName: "Admin User",
    });
  });

  it("grants login from a string permission list", () => {
    const result = mapOrbitalClaims({
      sub: "user-2",
      email: "user@grpotencial.com.br",
      orbital_permissions: { permissions: ["login", "dashboard"] },
    });

    expect(result.isAdmin).toBe(false);
    expect(result.canLogin).toBe(true);
  });

  it("grants login from an object permission list (permissionKey)", () => {
    const result = mapOrbitalClaims({
      sub: "user-3",
      email: "user3@grpotencial.com.br",
      orbital_permissions: {
        permissions: [{ permissionKey: "LOGIN" }, { permissionKey: "mapa" }],
      },
    });

    expect(result.canLogin).toBe(true);
  });

  it("denies login when neither admin nor login permission is present", () => {
    const result = mapOrbitalClaims({
      sub: "user-4",
      email: "user4@grpotencial.com.br",
      orbital_permissions: { permissions: ["dashboard"] },
    });

    expect(result.isAdmin).toBe(false);
    expect(result.canLogin).toBe(false);
  });

  it("falls back to preferred_username and picture for identity", () => {
    const result = mapOrbitalClaims({
      sub: "user-5",
      preferred_username: "Fallback@grpotencial.com.br",
      picture: "https://cdn/photo.png",
      orbital_roles: ["admin"],
    });

    expect(result.identity.email).toBe("fallback@grpotencial.com.br");
    expect(result.identity.displayName).toBe("Fallback@grpotencial.com.br");
    expect(result.identity.photoUrl).toBe("https://cdn/photo.png");
  });
});
