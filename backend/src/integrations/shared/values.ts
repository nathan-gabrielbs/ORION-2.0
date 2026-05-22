export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function safeFloat(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function safeInt(value: unknown, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCnpj(value: unknown): string {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}

export function formatStatusViagem(status: unknown): string {
  const code = String(status || "")
    .trim()
    .toUpperCase();
  if (code === "L") return "Lançada";
  if (code === "I") return "Iniciada";
  if (code === "F") return "Finalizada";
  if (code === "C") return "Cancelada";
  return code || "-";
}

export function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }

  const text = String(value).trim();
  if (!text) return false;

  const normalized = text.toUpperCase();
  return normalized !== "N" && normalized !== "I" && normalized !== "0";
}
