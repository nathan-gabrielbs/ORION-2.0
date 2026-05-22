import crypto from "crypto";

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function makePasswordHash(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(
  password: string,
  encoded: string,
): { valid: boolean; needsUpgrade: boolean } {
  if (!encoded) return { valid: false, needsUpgrade: false };

  if (encoded.startsWith("scrypt$")) {
    const [, salt, storedHash] = encoded.split("$");
    if (!salt || !storedHash) return { valid: false, needsUpgrade: false };

    try {
      const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
      return {
        valid: crypto.timingSafeEqual(
          Buffer.from(candidate, "hex"),
          Buffer.from(storedHash, "hex"),
        ),
        needsUpgrade: false,
      };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  // Temporary compatibility for users created manually without hash.
  // On successful validation, password is migrated to scrypt on login.
  return { valid: encoded === password, needsUpgrade: true };
}
