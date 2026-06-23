import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Resolved from this file's location:
//   - dev (tsx):       backend/src/shared/paths.ts → ../../../
//   - prod (compiled): backend/dist/shared/paths.js → ../../../
export const REPO_ROOT = path.resolve(currentDir, "..", "..", "..");

export function resolveFrontendDistPath(): string {
  return path.resolve(REPO_ROOT, "frontend", "dist");
}

/** Prefer Vite build output when present (Docker/prod); fall back to source in dev. */
export function resolveLoginHtmlPath(): string {
  const distLogin = path.resolve(REPO_ROOT, "frontend", "dist", "login.html");
  if (fs.existsSync(distLogin)) return distLogin;
  return path.resolve(REPO_ROOT, "frontend", "login.html");
}
