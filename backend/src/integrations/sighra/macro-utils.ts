export function normalizeMacroName(macroName: string): string {
  return String(macroName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

export function isMaintenanceStatus(status?: string | null): boolean {
  const normalized = normalizeMacroName(String(status || "")).replace(/\s+/g, " ");
  return normalized === "EM MANUTENCAO";
}

export function mapTrackerLocation(location?: string | null): string {
  const rawLocation = String(location || "").trim();
  if (!rawLocation) return "";

  const normalizedLocation = normalizeMacroName(rawLocation).replace(/\s+/g, " ");

  const isContourMatch =
    normalizedLocation.includes("CONTORNO SAO PAULO") &&
    normalizedLocation.includes("CURITIBA") &&
    normalizedLocation.includes("FLORIANOPOLIS");
  const isUndefinedLocation =
    normalizedLocation.includes("NAO FOI POSSIVEL DEFINIR") ||
    normalizedLocation.includes("NAO FOI POSSIVEL LOCALIZAR");
  const isSaoSebastiaoBorderMatch = normalizedLocation.includes("BORDA DO CAMPO DE SAO SEBASTIAO");

  if (isSaoSebastiaoBorderMatch || (isContourMatch && isUndefinedLocation)) {
    return "DAF Barigüi Caminhões - Rod. Contorno Leste - São José dos Pinhais/PR";
  }

  return rawLocation;
}

export function buildLocationFromPosition(data: Record<string, unknown>): string {
  const parts: string[] = [];

  if (data?.logradouro && data.logradouro !== "SEM NOME") parts.push(String(data.logradouro));
  if (data?.cidade) parts.push(String(data.cidade));
  if (data?.estado) parts.push(String(data.estado));

  let location = parts.join(", ");

  if (data?.pontoReferencia && data.pontoReferencia !== "Nao foi possivel localizar ponto.") {
    location += location ? ` (${data.pontoReferencia})` : String(data.pontoReferencia);
  }

  return mapTrackerLocation(location || "Localização não informada");
}

export function isOperationalMacro(macroName: string): boolean {
  const name = normalizeMacroName(macroName);

  return [
    "IN. VIAGEM VAZIO",
    "REIN. VIAGEM VAZIO",
    "IN. VIAGEM CARREGADO",
    "REIN. VIAGEM CARREGADO",
    "REIN. VIAGEM CARREGA",
    "AGUARD. CARREGA",
    "EFET. CARREGA",
    "AGUARD. DESCARREGA",
    "EFET. DESCARREGA",
    "FIM DESC./REINICIO",
    "FIM DESCARG /REINICI",
    "FIM DESCARGA /REINICI",
  ].some((k) => name.includes(k));
}

export function mapMacroToKanbanStatus(macroName: string): string | null {
  const name = normalizeMacroName(macroName);

  if (name.includes("AGUARD. CARREGA")) return "AGUARDANDO CARREGAMENTO";
  if (name.includes("EFET. CARREGA")) return "EFETUANDO CARREGAMENTO";
  if (name.includes("AGUARD. DESCARREGA")) return "AGUARDANDO DESCARREGAMENTO";
  if (name.includes("EFET. DESCARREGA")) return "EFETUANDO DESCARREGAMENTO";

  if (
    name.includes("IN. VIAGEM CARREGADO") ||
    name.includes("REIN. VIAGEM CARREGADO") ||
    name.includes("REIN. VIAGEM CARREGA")
  ) {
    return "EM TRÂNSITO";
  }

  if (
    name.includes("IN. VIAGEM VAZIO") ||
    name.includes("REIN. VIAGEM VAZIO") ||
    name.includes("FIM DESC./REINICIO") ||
    name.includes("FIM DESCARG /REINICI") ||
    name.includes("FIM DESCARGA /REINICI")
  ) {
    return "VEÍCULO VAZIO";
  }

  return null;
}

export function hasActiveRasterTrip(vehicle: Record<string, unknown> | null | undefined): boolean {
  if (!vehicle) return false;

  return Boolean(
    String(vehicle.route_origin || "").trim() ||
    String(vehicle.route_destination || "").trim() ||
    String(vehicle.route_timeline_link || "").trim() ||
    vehicle.route_progress_percent != null,
  );
}

export function resolveVehicleStatusWithoutOperationalMacro(
  vehicle: Record<string, unknown> | null | undefined,
): string {
  const operationalStatus = vehicle?.last_operational_macro
    ? mapMacroToKanbanStatus(String(vehicle.last_operational_macro))
    : null;

  if (operationalStatus) {
    return operationalStatus;
  }

  if (hasActiveRasterTrip(vehicle)) {
    return "EM TRÂNSITO";
  }

  return "VEÍCULO VAZIO";
}

export function normalizeDriverName(value: unknown): string {
  return String(value || "")
    .replace(/\s*-\s*\d+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function resolveDriverValue(incoming: unknown, currentDriver?: string | null): string {
  const parsed = normalizeDriverName(incoming);
  if (parsed) return parsed;

  const current = normalizeDriverName(currentDriver);
  if (current) return current;

  return "SEM MOTORISTA";
}
