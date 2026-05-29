import dotenv from "dotenv";
import path from "path";
import { REPO_ROOT } from "./paths.js";

// Load env from repo root so `.env` stays at the monorepo root (same path as
// `.env.example`), regardless of whether the process cwd is `backend/`.
dotenv.config({ path: path.resolve(REPO_ROOT, ".env") });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return String(value).trim();
}

export function optionalEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}
