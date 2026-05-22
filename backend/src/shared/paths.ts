import path from "path";
import { fileURLToPath } from "url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Resolved from this file's location:
//   - dev (tsx):       backend/src/shared/paths.ts → ../../../
//   - prod (compiled): backend/dist/shared/paths.js → ../../../
export const REPO_ROOT = path.resolve(currentDir, "..", "..", "..");

export function resolveDatabaseFile(): string {
  const configured = process.env.DATABASE_FILE;
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(REPO_ROOT, configured);
  }
  return path.resolve(REPO_ROOT, "backend", "data", "bwt_fleet.db");
}

export function resolveFrontendDistPath(): string {
  return path.resolve(REPO_ROOT, "frontend", "dist");
}

export function resolveLoginHtmlPath(isProduction: boolean): string {
  return isProduction
    ? path.resolve(REPO_ROOT, "frontend", "dist", "login.html")
    : path.resolve(REPO_ROOT, "frontend", "login.html");
}
