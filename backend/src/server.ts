import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import crypto from "crypto";
import path from "path";
import { createDatabase } from "./db/client.js";
import { createAuthModule } from "./modules/auth/index.js";
import { createVehicleModule } from "./modules/vehicles/index.js";
import {
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "./modules/auth/dto.js";
import { clearSessionCookie, parseCookies, setSessionCookie } from "./modules/auth/cookies.js";
import { makePasswordHash, verifyPassword } from "./modules/auth/password.js";
import {
  APP_PORT,
  BOOTSTRAP_ADMIN_EMAIL,
  IS_PRODUCTION,
  MICROSOFT_ALLOWED_DOMAIN,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  MICROSOFT_TENANT_ID,
  PUBLIC_BASE_URL,
  SESSION_COOKIE,
  SIGHRA_WEBHOOK_TOKEN,
} from "./shared/app-config.js";
import { isAllowedOrigin, requireTrustedOrigin } from "./shared/cors.js";
import { optionalEnv, requireEnv } from "./shared/env.js";
import { resolveFrontendDistPath, resolveLoginHtmlPath } from "./shared/paths.js";
import type { AuthProvider, AuthUser, UserRole } from "./shared/types/auth.js";
import { normalizePlate } from "./shared/utils/plate.js";

const db = createDatabase();
const auth = createAuthModule(db);
auth.ensurePrincipalAdmin();
const vehicleRepo = createVehicleModule(db);

function sanitizeText(value: unknown, max = 255): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\u0000/g, "").slice(0, max);
}

const observationSchema = z.object({
  observation: z.string().trim().max(1000).nullable().optional(),
});

const maintenanceSchema = z.object({
  driver: z.string().trim().max(120).nullable().optional(),
  reason: z.string().trim().max(300).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  forecast: z.string().trim().max(80).nullable().optional(),
});

const finishMaintenanceSchema = z.object({
  reason: z.string().trim().max(300).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
});

const plateRegistrySchema = z.object({
  plate: z.string().trim().min(7).max(10),
  model: z.string().trim().min(2).max(120),
  year: z.number().int().min(1980).max(2100),
  operation_name: z.string().trim().min(2).max(120),
  operation_logo_url: z.string().trim().url().max(500).nullable().optional(),
});

const updatePlateRegistrySchema = z.object({
  model: z
    .preprocess((val) => (typeof val === "string" ? val.trim() : val), z.string().min(2).max(120))
    .optional()
    .nullable(),
  year: z.preprocess((val) => {
    if (val === "" || val === null || typeof val === "undefined") return undefined;
    if (typeof val === "number") return val;
    if (typeof val === "string") return Number(val);
    return val;
  }, z.number().int().min(1980).max(2100).optional()),

  operation_name: z
    .preprocess((val) => {
      if (val === null || typeof val === "undefined") return null;
      if (typeof val !== "string") return val;
      const trimmed = val.trim();
      return trimmed === "" ? null : trimmed;
    }, z.string().max(120).nullable())
    .optional()
    .nullable(),

  operation_logo_url: z
    .preprocess((val) => {
      if (val === null || typeof val === "undefined") return null;
      if (typeof val !== "string") return val;
      const trimmed = val.trim();
      return trimmed === "" ? null : trimmed;
    }, z.string().max(500).nullable())
    .optional()
    .nullable(),
});

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

const ibgeCityCache = new Map<number, string>();
const cnpjNameCache = new Map<string, string>();
const RASTER_TRIPS_CACHE_TTL_MS = 2 * 60 * 1000;
let rasterTripsCache: { fetchedAt: number; resultList: any[] } | null = null;
let rasterTripsInflight: Promise<any[]> | null = null;

function normalizeCnpj(value: any): string {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}

function formatStatusViagem(status: any): string {
  const code = String(status || "")
    .trim()
    .toUpperCase();
  if (code === "L") return "Lançada";
  if (code === "I") return "Iniciada";
  if (code === "F") return "Finalizada";
  if (code === "C") return "Cancelada";
  return code || "-";
}

async function resolveCompanyNameByCnpj(cnpjValue: any): Promise<string | null> {
  const cnpj = normalizeCnpj(cnpjValue);
  if (!cnpj || cnpj.length !== 14 || /^0+$/.test(cnpj)) return null;

  const cached = cnpjNameCache.get(cnpj);
  if (cached) return cached;

  try {
    const response = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      timeout: 8000,
      validateStatus: () => true,
    });

    if (response.status >= 200 && response.status < 300) {
      const name = String(
        response?.data?.razao_social || response?.data?.nome_fantasia || "",
      ).trim();
      if (name) {
        cnpjNameCache.set(cnpj, name);
        return name;
      }
    }
  } catch {
    // noop
  }

  return null;
}

function normalizeStatus(status?: string | null): string {
  return String(status || "")
    .trim()
    .toUpperCase();
}

function isOperationalStatus(status?: string | null): boolean {
  const normalized = normalizeStatus(status);
  return (
    normalized === "EM TRÂNSITO" ||
    normalized === "AGUARDANDO CARREGAMENTO" ||
    normalized === "EFETUANDO CARREGAMENTO" ||
    normalized === "AGUARDANDO DESCARREGAMENTO" ||
    normalized === "EFETUANDO DESCARREGAMENTO"
  );
}

function calculateFleetEfficiency() {
  const vehicles = db.prepare("SELECT status FROM vehicles").all() as Array<{
    status?: string | null;
  }>;
  const totalVehicles = vehicles.length;
  const operationalVehicles = vehicles.filter((vehicle) =>
    isOperationalStatus(vehicle.status),
  ).length;
  const efficiency = totalVehicles
    ? Number(((operationalVehicles / totalVehicles) * 100).toFixed(1))
    : 0;

  return {
    timestamp: new Date().toISOString(),
    efficiency,
    totalVehicles,
    operationalVehicles,
  };
}

function saveFleetEfficiencySnapshot() {
  const snapshot = calculateFleetEfficiency();

  db.prepare(
    `
    INSERT INTO fleet_efficiency_history (timestamp, efficiency, total_vehicles, operational_vehicles)
    VALUES (?, ?, ?, ?)
  `,
  ).run(
    snapshot.timestamp,
    snapshot.efficiency,
    snapshot.totalVehicles,
    snapshot.operationalVehicles,
  );

  return snapshot;
}

function normalizeMacroName(macroName: string): string {
  return String(macroName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function isMaintenanceStatus(status?: string | null): boolean {
  const normalized = normalizeMacroName(String(status || "")).replace(/\s+/g, " ");
  return normalized === "EM MANUTENCAO";
}

function mapTrackerLocation(location?: string | null): string {
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

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function safeFloat(value: any, fallback = 0): number {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeInt(value: any, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getSoapBody(json: any): any {
  return json?.Envelope?.Body || json?.Body || json?.["S:Envelope"]?.["S:Body"] || null;
}

function buildLocationFromPosition(data: any): string {
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

function tripContainsPlate(trip: any, normalizedPlate: string): boolean {
  if (!normalizedPlate) return false;

  const tripPlates = [
    trip?.PlacaVeiculo,
    trip?.PlacaCarreta1,
    trip?.PlacaCarreta01,
    trip?.PlacaCarreta02,
    trip?.PlacaCarreta2,
    trip?.PlacaCarreta3,
  ]
    .map((value) => normalizePlate(value))
    .filter(Boolean);

  if (tripPlates.includes(normalizedPlate)) {
    return true;
  }

  const stopPlates = asArray(trip?.ColetasEntregas)
    .map((stop: any) => normalizePlate(stop?.PlacaVeiculo))
    .filter(Boolean);

  return stopPlates.includes(normalizedPlate);
}

function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

function getRecentRangeLocal(minutes = 15) {
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60 * 1000);

  return {
    dataIni: formatDateLocal(start),
    dataFim: formatDateLocal(end),
  };
}

function getTodayStartLocal() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function clampProgressPercent(value: any): number | null {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return 0;
  if (parsed >= 100) return 100;
  return Number(parsed.toFixed(1));
}

function hasMeaningfulValue(value: any): boolean {
  if (value == null) return false;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }

  const text = String(value).trim();
  if (!text) return false;

  const normalized = text.toUpperCase();
  return normalized !== "N" && normalized !== "I" && normalized !== "0";
}

function scoreStopCompleteness(stop: any): number {
  if (!stop) return 0;

  const weightedFields: Array<[any, number]> = [
    [stop?.PercentualPercorrido, 6],
    [stop?.KmPercorridoEntrega, 5],
    [stop?.KmRestanteEntrega, 5],
    [stop?.DataHoraCalculadaChegada, 4],
    [stop?.DiferencaTempo, 4],
    [stop?.DataHoraRealChegada, 3],
    [stop?.DataHoraRealSaida, 3],
    [stop?.DataHoraUltimaPosicao, 3],
    [stop?.ReferenciaUltimaPosicao, 2],
    [stop?.DistanciaRota, 1],
  ];

  return weightedFields.reduce(
    (acc, [value, weight]) => acc + (hasMeaningfulValue(value) ? weight : 0),
    0,
  );
}

function parseDateMs(value: any): number {
  const text = String(value || "").trim();
  if (!text) return 0;

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scoreStopPrecision(stop: any): number {
  if (!stop) return 0;

  const percentualPercorrido = clampProgressPercent(stop?.PercentualPercorrido) ?? 0;
  const kmPercorrido = Math.max(safeFloat(stop?.KmPercorridoEntrega, 0), 0);
  const kmRestante = Math.max(safeFloat(stop?.KmRestanteEntrega, 0), 0);
  const estimativaChegada = parseDateMs(stop?.DataHoraCalculadaChegada);

  return (
    percentualPercorrido * 1000 +
    kmPercorrido * 10 -
    kmRestante * 10 +
    estimativaChegada / 1_000_000
  );
}

function scoreStopLifecycle(stop: any): number {
  if (!stop) return 0;

  const percentualPercorrido = clampProgressPercent(stop?.PercentualPercorrido) ?? 0;
  const chegouNaEntrega =
    String(stop?.ChegouNaEntrega || "")
      .trim()
      .toUpperCase() === "S";
  const hasRealArrival = hasMeaningfulValue(stop?.DataHoraRealChegada);
  const hasRealDeparture = hasMeaningfulValue(stop?.DataHoraRealSaida);

  if (chegouNaEntrega || hasRealArrival || percentualPercorrido >= 100) {
    return 3;
  }

  if (hasRealDeparture || percentualPercorrido > 0) {
    return 2;
  }

  if (
    hasMeaningfulValue(stop?.DataHoraCalculadaChegada) ||
    hasMeaningfulValue(stop?.DataHoraUltimaPosicao)
  ) {
    return 1;
  }

  return 0;
}

function isStopBetterCandidate(candidate: any, current: any): boolean {
  const candidateLifecycle = scoreStopLifecycle(candidate);
  const currentLifecycle = scoreStopLifecycle(current);

  if (candidateLifecycle !== currentLifecycle) {
    return candidateLifecycle > currentLifecycle;
  }

  const candidateCompleteness = scoreStopCompleteness(candidate);
  const currentCompleteness = scoreStopCompleteness(current);

  if (candidateCompleteness !== currentCompleteness) {
    return candidateCompleteness > currentCompleteness;
  }

  const candidatePrecision = scoreStopPrecision(candidate);
  const currentPrecision = scoreStopPrecision(current);
  if (candidatePrecision !== currentPrecision) {
    return candidatePrecision > currentPrecision;
  }

  return (
    parseDateMs(candidate?.DataHoraUltimaPosicao) >= parseDateMs(current?.DataHoraUltimaPosicao)
  );
}

function mergeStopsByCompleteness(stops: any[]): any[] {
  const grouped = new Map<string, any>();

  for (const stop of asArray(stops)) {
    const order = safeInt(stop?.Ordem, 0);
    const type = String(stop?.Tipo || "")
      .trim()
      .toUpperCase();
    const cityCode = safeIBGECode(stop?.CodIBGECidade) || 0;
    const cnpj = normalizeCnpj(stop?.CNPJCliente) || "";
    const key = `${order}|${type}|${cityCode}|${cnpj}`;

    const current = grouped.get(key);
    if (!current || isStopBetterCandidate(stop, current)) {
      grouped.set(key, stop);
    }
  }

  return [...grouped.values()].sort((a, b) => safeInt(a?.Ordem, 0) - safeInt(b?.Ordem, 0));
}

function scoreTripCompleteness(trip: any): number {
  if (!trip) return 0;

  const weightedTripFields: Array<[any, number]> = [
    [trip?.TempoTotalViagem, 3],
    [trip?.PercentualMovimentando, 3],
    [trip?.DataHoraRealIni, 2],
    [trip?.LinkTimeLine, 2],
    [trip?.DentroPrazo, 1],
  ];

  const tripScore = weightedTripFields.reduce(
    (acc, [value, weight]) => acc + (hasMeaningfulValue(value) ? weight : 0),
    0,
  );
  const stopScore = asArray(trip?.ColetasEntregas).reduce(
    (acc, stop) => acc + scoreStopCompleteness(stop),
    0,
  );

  return tripScore + stopScore;
}

function isConsideredRasterTrip(trip: any): boolean {
  const statusViagem = String(trip?.StatusViagem || "")
    .trim()
    .toUpperCase();
  const hasRealEnd = hasMeaningfulValue(trip?.DataHoraRealFim);
  const hasIdentifiedEnd = hasMeaningfulValue(trip?.DataHoraIdentificouFimViagem);

  if (
    statusViagem === "F" ||
    statusViagem === "C" ||
    statusViagem === "FINALIZADA" ||
    statusViagem === "CANCELADA"
  ) {
    return false;
  }

  return !hasRealEnd && !hasIdentifiedEnd;
}

function extractTripPlates(trip: any): string[] {
  return [
    trip?.PlacaVeiculo,
    trip?.PlacaCarreta1,
    trip?.PlacaCarreta01,
    trip?.PlacaCarreta02,
    trip?.PlacaCarreta2,
    trip?.PlacaCarreta3,
    ...asArray(trip?.ColetasEntregas).map((stop: any) => stop?.PlacaVeiculo),
  ]
    .map((value) => normalizePlate(value))
    .filter(Boolean);
}

function selectBestTripForPlate(trips: any[], normalizedPlate: string): any | null {
  if (!normalizedPlate) return null;

  const candidates = asArray(trips).filter(
    (trip: any) => isConsideredRasterTrip(trip) && tripContainsPlate(trip, normalizedPlate),
  );
  if (!candidates.length) return null;

  return candidates.reduce((best: any, current: any) => {
    if (!best) return current;
    return scoreTripCompleteness(current) >= scoreTripCompleteness(best) ? current : best;
  }, null);
}

function safeIBGECode(value: any): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractUfFromIbgeResponse(data: any): string {
  return String(
    data?.microrregiao?.mesorregiao?.UF?.sigla ||
      data?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ||
      data?.UF?.sigla ||
      "",
  ).trim();
}

async function resolveIbgeCityLabels(codes: number[]): Promise<Map<number, string>> {
  const labels = new Map<number, string>();

  const uniqueCodes = [...new Set(codes)].filter((code) => Number.isFinite(code) && code > 0);
  const unresolvedCodes = uniqueCodes.filter((code) => !ibgeCityCache.has(code));

  await Promise.all(
    unresolvedCodes.map(async (code) => {
      try {
        const response = await axios.get(
          `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${code}`,
          {
            timeout: 8000,
          },
        );

        const cityName = String(response?.data?.nome || "").trim();
        const uf = extractUfFromIbgeResponse(response?.data);
        const label = cityName ? `${cityName}${uf ? `/${uf}` : ""}` : String(code);

        ibgeCityCache.set(code, label);
      } catch {
        ibgeCityCache.set(code, String(code));
      }
    }),
  );

  uniqueCodes.forEach((code) => {
    const label = ibgeCityCache.get(code);
    if (label) labels.set(code, label);
  });

  return labels;
}

function getStopDisplayLocation(stop: any, ibgeLabels?: Map<number, string>): string {
  const code = safeIBGECode(stop?.CodIBGECidade);
  const ibgeLabel = code ? ibgeLabels?.get(code) : null;
  if (ibgeLabel) return ibgeLabel;

  const reference = String(stop?.ReferenciaUltimaPosicao || "").trim();
  if (reference) return reference;

  if (Number.isFinite(stop?.Latitude) && Number.isFinite(stop?.Longitude)) {
    return `${stop.Latitude}, ${stop.Longitude}`;
  }

  return "Local não informado";
}

function selectOriginAndDestination(stops: any[], ibgeLabels?: Map<number, string>) {
  const typedStops = mergeStopsByCompleteness(stops);

  const originStop =
    typedStops.find((stop: any) => String(stop?.Tipo || "").toUpperCase() === "C") ||
    typedStops[0] ||
    null;
  const destinationStop =
    typedStops.find((stop: any) => String(stop?.Tipo || "").toUpperCase() === "E") ||
    typedStops[typedStops.length - 1] ||
    null;

  const origin = originStop
    ? getStopDisplayLocation(originStop, ibgeLabels)
    : "Origem não informada";
  const destination = destinationStop
    ? getStopDisplayLocation(destinationStop, ibgeLabels)
    : "Destino não informado";

  const destinationPercent = clampProgressPercent(destinationStop?.PercentualPercorrido);
  const maxPercent = typedStops
    .map((stop: any) => clampProgressPercent(stop?.PercentualPercorrido))
    .filter((value: number | null) => value != null)
    .reduce((acc: number, value: number | null) => Math.max(acc, value || 0), 0);

  return {
    origin,
    destination,
    progressPercent: destinationPercent ?? maxPercent ?? null,
  };
}

function buildTimeWindows(start: Date, end: Date, windowMinutes = 30) {
  const windows: Array<{ dataIni: string; dataFim: string }> = [];
  let cursor = new Date(start);

  while (cursor < end) {
    const next = addMinutes(cursor, windowMinutes);
    const finalDate = next < end ? next : end;

    windows.push({
      dataIni: formatDateLocal(cursor),
      dataFim: formatDateLocal(finalDate),
    });

    cursor = next;
  }

  return windows;
}

function parseSighraDate(value: any): number {
  return parseDateMs(value);
}

function isOperationalMacro(macroName: string): boolean {
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

function mapMacroToKanbanStatus(macroName: string): string | null {
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

function hasActiveRasterTrip(vehicle: any): boolean {
  if (!vehicle) return false;

  return Boolean(
    String(vehicle.route_origin || "").trim() ||
    String(vehicle.route_destination || "").trim() ||
    String(vehicle.route_timeline_link || "").trim() ||
    vehicle.route_progress_percent != null,
  );
}

function resolveVehicleStatusWithoutOperationalMacro(vehicle: any): string {
  const operationalStatus = vehicle?.last_operational_macro
    ? mapMacroToKanbanStatus(vehicle.last_operational_macro)
    : null;

  if (operationalStatus) {
    return operationalStatus;
  }

  if (hasActiveRasterTrip(vehicle)) {
    return "EM TRÂNSITO";
  }

  return "VEÍCULO VAZIO";
}

function cleanupFinishedMaintenanceByForecast() {
  db.prepare(
    `
    UPDATE vehicles
    SET maintenance_finished_at = NULL
    WHERE maintenance_finished_at IS NOT NULL
      AND (
        SELECT datetime(mh.forecast_date)
        FROM maintenance_history mh
        WHERE mh.plate = vehicles.plate
        ORDER BY datetime(mh.finish_date) DESC, mh.id DESC
        LIMIT 1
      ) <= datetime('now')
  `,
  ).run();
}

function cleanupOldMacrosHistory() {
  db.prepare(
    `
    DELETE FROM macros_history
    WHERE date(datetime(created_at, '-3 hours')) < date('now', '-1 day', 'localtime')
  `,
  ).run();
}

function getLastOperationalMacroFromHistory(plate: string) {
  return db
    .prepare(
      `
    SELECT macro_description, created_at
    FROM macros_history
    WHERE plate = ?
      AND date(datetime(created_at, '-3 hours')) >= date('now', '-1 day', 'localtime')
      AND (
        UPPER(macro_description) LIKE '%IN. VIAGEM VAZIO%' OR
        UPPER(macro_description) LIKE '%REIN. VIAGEM VAZIO%' OR
        UPPER(macro_description) LIKE '%IN. VIAGEM CARREGADO%' OR
        UPPER(macro_description) LIKE '%REIN. VIAGEM CARREGADO%' OR
        UPPER(macro_description) LIKE '%REIN. VIAGEM CARREGA%' OR
        UPPER(macro_description) LIKE '%AGUARD. CARREGA%' OR
        UPPER(macro_description) LIKE '%EFET. CARREGA%' OR
        UPPER(macro_description) LIKE '%AGUARD. DESCARREGA%' OR
        UPPER(macro_description) LIKE '%EFET. DESCARREGA%' OR
        UPPER(macro_description) LIKE '%FIM DESC./REINICIO%' OR
        UPPER(macro_description) LIKE '%FIM DESCARG /REINICI%' OR
        UPPER(macro_description) LIKE '%FIM DESCARGA /REINICI%'
      )
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `,
    )
    .get(plate) as { macro_description: string; created_at: string } | undefined;
}

function normalizeDriverName(value: any): string {
  return String(value || "")
    .replace(/\s*-\s*\d+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function resolveDriverValue(incoming: any, currentDriver?: string | null): string {
  const parsed = normalizeDriverName(incoming);
  if (parsed) return parsed;

  const current = normalizeDriverName(currentDriver);
  if (current) return current;

  return "SEM MOTORISTA";
}

async function startServer() {
  const app = express();
  app.disable("x-powered-by");

  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error("Origin não permitida"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
    },
  });

  app.set("trust proxy", 1);

  // CSP is enforced in production. In dev we disable it because Vite injects
  // inline scripts/HMR clients that we don't want to whitelist by hand.
  // The directives below cover what the current shell needs:
  //   - Google Fonts (CSS + font files)
  //   - Material Symbols + Font Awesome CDN
  //   - Leaflet CSS from unpkg + tile providers over HTTPS (any host, since
  //     tiles can come from OSM, CartoDB, Esri, etc. and the user can switch)
  //   - Microsoft OAuth navigation (handled via top-level redirect, not
  //     connect-src, so it doesn't need an explicit entry here)
  //   - Socket.IO same-origin upgrade (ws:/wss:)
  app.use(
    helmet({
      contentSecurityPolicy: IS_PRODUCTION
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              // 'unsafe-inline' is required by login.html (inline <script>
              // and small style overrides) and by the Vite build output that
              // injects a module preload header. Removing it would mean
              // either hashing every inline block or rewriting login.html.
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com",
                "https://unpkg.com",
              ],
              fontSrc: [
                "'self'",
                "data:",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com",
              ],
              imgSrc: ["'self'", "data:", "blob:", "https:"],
              connectSrc: ["'self'", "ws:", "wss:"],
              objectSrc: ["'none'"],
              frameAncestors: ["'self'"],
              formAction: ["'self'"],
              baseUri: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }),
  );

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
  });

  // Auth limiter follows the Orbital pattern: scoped per (ip, email) so a
  // malicious actor can't lock out a real user by hammering their email from
  // another IP, and only failed attempts count (a legit user with a typo
  // doesn't lose their budget once they finally sign in).
  const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = auth.normalizeEmail((req.body as any)?.email);
      // ipKeyGenerator strips IPv6 zone-id / brackets and normalizes to the
      // form express-rate-limit expects. Required for IPv6 safety.
      const ip = ipKeyGenerator(req as any) || "unknown";
      return email ? `${ip}:${email}` : `${ip}:_no_email`;
    },
    message: { error: "Muitas tentativas de login. Tente novamente mais tarde." },
  });

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);

        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Origin não permitida"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(generalLimiter);

  app.use((req, res, next) => {
    if (req.path === "/api/sighra/webhook") return next();

    const method = req.method.toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return requireTrustedOrigin(req, res, next);
    }
    next();
  });

  app.use(auth.attachAuthUser);

  const { requireAuth, requireAdmin } = auth;

  // Login page is a standalone HTML file produced by the frontend build.
  // In dev it lives in frontend/login.html; in prod it's emitted to
  // frontend/dist/login.html (see rollupOptions.input in vite.config.ts).
  const loginHtmlPath = resolveLoginHtmlPath(IS_PRODUCTION);

  app.get("/login", (_req, res) => {
    res.sendFile(loginHtmlPath);
  });

  app.get("/api/auth/me", (req, res) => {
    const authUser = (req as any).authUser as AuthUser | null;
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });
    return res.json({ user: authUser });
  });

  app.post("/api/auth/login", authLimiter, (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Email ou senha inválidos." });
    }

    const email = auth.normalizeEmail(parsed.data.email);
    const password = parsed.data.password;

    const user = auth.getUserByEmail(email);
    if (!user || !user.active) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const authProvider = String(user.auth_provider || "LOCAL").toUpperCase();
    const passwordVerification = verifyPassword(password, String(user.password_hash || ""));

    if (authProvider !== "LOCAL" || !passwordVerification.valid) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    if (passwordVerification.needsUpgrade) {
      auth.upgradePasswordHash(user.id as number, password);
    }

    const token = auth.createSession(user.id as number);
    setSessionCookie(res, token);
    auth.touchLastLogin(user.id as number);

    return res.json({ user: auth.sanitizeUserRow(user) });
  });

  app.post("/api/auth/logout", (req, res) => {
    const rawToken = (req as any).sessionToken as string | undefined;
    if (rawToken) {
      auth.revokeSession(rawToken);
    }
    clearSessionCookie(res);
    return res.json({ success: true });
  });

  app.get("/api/auth/microsoft/start", (_req, res) => {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      return res.status(500).json({ error: "Microsoft SSO não configurado." });
    }

    const state = auth.createOAuthState();

    const redirectUri = `${PUBLIC_BASE_URL}/api/auth/microsoft/callback`;
    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "openid profile email User.Read",
      state,
    });

    return res.redirect(
      `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`,
    );
  });

  app.get("/api/auth/microsoft/callback", async (req, res) => {
    try {
      const state = String(req.query.state || "");
      const code = String(req.query.code || "");

      // Single-use: consumeOAuthState removes the row and only returns true
      // if it existed AND was still within the TTL.
      if (!code || !auth.consumeOAuthState(state)) {
        return res.status(400).send("Falha na autenticação Microsoft.");
      }

      const redirectUri = `${PUBLIC_BASE_URL}/api/auth/microsoft/callback`;
      const tokenResponse = await axios.post(
        `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          scope: "openid profile email User.Read",
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      const accessToken = tokenResponse.data?.access_token;
      if (!accessToken) return res.status(400).send("Token Microsoft inválido.");

      const profileResponse = await axios.get("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const mail = auth.normalizeEmail(
        profileResponse.data?.mail || profileResponse.data?.userPrincipalName,
      );
      const name = String(profileResponse.data?.displayName || mail);
      const domain = mail.split("@")[1] || "";

      if (!mail || domain !== MICROSOFT_ALLOWED_DOMAIN) {
        return res.status(403).send("Conta Microsoft fora do domínio permitido.");
      }

      let user = auth.getUserByEmail(mail);
      if (!user) {
        const role: UserRole = mail === BOOTSTRAP_ADMIN_EMAIL ? "ADMIN" : "USER";

        db.prepare(
          `
    INSERT INTO users (name, email, role, auth_provider, active)
    VALUES (?, ?, ?, 'MICROSOFT', 1)
  `,
        ).run(name, mail, role);

        user = auth.getUserByEmail(mail);
      } else {
        db.prepare(
          `
    UPDATE users
    SET name = ?
    WHERE id = ?
  `,
        ).run(name, user.id);

        user = auth.getUserByEmail(mail);
      }

      if (!user) {
        return res.status(500).send("Erro ao autenticar com Microsoft.");
      }

      if (!user.active) {
        return res.status(403).send("Usuário inativo.");
      }

      const token = auth.createSession(user.id as number);
      setSessionCookie(res, token);
      auth.touchLastLogin(user.id as number);

      return res.redirect("/");
    } catch (error: any) {
      console.error("Erro no login Microsoft:", error?.response?.data || error.message);
      return res.status(500).send("Erro ao autenticar com Microsoft.");
    }
  });

  app.get("/api/users", requireAdmin, (_req, res) => {
    const users = db
      .prepare(
        `
      SELECT id, name, email, role, auth_provider, active, created_at, updated_at, last_login
      FROM users
      ORDER BY datetime(created_at) DESC
    `,
      )
      .all();
    return res.json({ users });
  });

  app.post("/api/users", requireAdmin, (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos." });
    }

    const body = parsed.data;
    const name = body.name;
    const email = auth.normalizeEmail(body.email);
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";
    const active = body.active === false ? 0 : 1;
    const authProvider: AuthProvider = body.auth_provider === "MICROSOFT" ? "MICROSOFT" : "LOCAL";
    const password = body.password || "";

    if (authProvider === "LOCAL" && password.length < 8) {
      return res.status(400).json({ error: "Senha deve ter no mínimo 8 caracteres." });
    }

    try {
      db.prepare(
        `
      INSERT INTO users (name, email, password_hash, role, auth_provider, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      ).run(
        name,
        email,
        authProvider === "LOCAL" ? makePasswordHash(password) : null,
        role,
        authProvider,
        active,
      );

      return res.status(201).json({ success: true });
    } catch {
      return res.status(409).json({ error: "Usuário já existe." });
    }
  });

  app.put("/api/users/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const parsed = updateUserSchema.safeParse(req.body);

    if (!id || !parsed.success) {
      return res.status(400).json({ error: "Dados inválidos." });
    }

    const body = parsed.data;
    const name = body.name;
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";
    const active = body.active === false ? 0 : 1;

    db.prepare(
      `
    UPDATE users
    SET name = ?, role = ?, active = ?
    WHERE id = ?
  `,
    ).run(name, role, active, id);

    return res.json({ success: true });
  });

  app.put("/api/users/:id/reset-password", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const parsed = resetPasswordSchema.safeParse(req.body);

    if (!id || !parsed.success) {
      return res.status(400).json({ error: "Senha mínima de 8 caracteres." });
    }

    db.prepare(
      `
    UPDATE users
    SET password_hash = ?, auth_provider = 'LOCAL'
    WHERE id = ?
  `,
    ).run(makePasswordHash(parsed.data.password), id);

    db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(id);

    return res.json({ success: true });
  });

  function upsertOperation(name: string, logoUrl?: string | null) {
    const operationName = sanitizeText(name, 120);
    if (!operationName) return null;

    const normalizedLogoUrl = sanitizeText(logoUrl ?? null, 500);
    const current = db
      .prepare("SELECT name, logo_url FROM operations WHERE name = ?")
      .get(operationName) as any;

    if (!current) {
      db.prepare(
        `
        INSERT INTO operations (name, logo_url)
        VALUES (?, ?)
      `,
      ).run(operationName, normalizedLogoUrl);
      return operationName;
    }

    if (normalizedLogoUrl) {
      db.prepare(
        `
        UPDATE operations
        SET logo_url = ?
        WHERE name = ?
      `,
      ).run(normalizedLogoUrl, operationName);
    }

    return operationName;
  }

  app.get("/api/admin/operations", requireAdmin, (_req, res) => {
    const operations = db
      .prepare(
        `
      SELECT name, logo_url, created_at, updated_at
      FROM operations
      ORDER BY name ASC
    `,
      )
      .all();
    return res.json({ operations });
  });

  app.get("/api/admin/plates", requireAdmin, (_req, res) => {
    const plates = db
      .prepare(
        `
      SELECT
        pr.plate,
        pr.model,
        pr.year,
        pr.operation_name,
        op.logo_url AS operation_logo_url,
        pr.created_at,
        pr.updated_at
      FROM plate_registry pr
      LEFT JOIN operations op ON op.name = pr.operation_name
      ORDER BY pr.plate ASC
    `,
      )
      .all();

    return res.json({ plates });
  });

  app.post("/api/admin/plates", requireAdmin, (req, res) => {
    const parsed = plateRegistrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos para cadastro da placa." });
    }

    const plate = normalizePlate(parsed.data.plate);
    const model = sanitizeText(parsed.data.model, 120);
    const operationName = sanitizeText(parsed.data.operation_name, 120);
    const year = Number(parsed.data.year);

    if (!plate || !model || !operationName || !Number.isFinite(year)) {
      return res.status(400).json({ error: "Dados inválidos para cadastro da placa." });
    }

    upsertOperation(operationName, parsed.data.operation_logo_url ?? null);

    try {
      db.prepare(
        `
        INSERT INTO plate_registry (plate, model, year, operation_name)
        VALUES (?, ?, ?, ?)
      `,
      ).run(plate, model, year, operationName);
    } catch {
      return res.status(409).json({ error: "Placa já cadastrada." });
    }

    const created = db
      .prepare(
        `
      SELECT pr.plate, pr.model, pr.year, pr.operation_name, op.logo_url AS operation_logo_url
      FROM plate_registry pr
      LEFT JOIN operations op ON op.name = pr.operation_name
      WHERE pr.plate = ?
      LIMIT 1
    `,
      )
      .get(plate);

    return res.status(201).json({ success: true, plate: created });
  });

  app.put("/api/admin/plates/:plate", requireAdmin, (req, res) => {
    const parsed = updatePlateRegistrySchema.safeParse(req.body);
    const plate = normalizePlate(req.params.plate);

    if (!parsed.success || !plate) {
      return res.status(400).json({ error: "Dados inválidos para atualização da placa." });
    }

    const model = sanitizeText(parsed.data.model, 120);
    const operationName = sanitizeText(parsed.data.operation_name, 120);
    const resolvedOperationName = operationName || "SEM OPERACAO";
    const year = Number(parsed.data.year);

    if (!model || !Number.isFinite(year)) {
      return res.status(400).json({ error: "Dados inválidos para atualização da placa." });
    }

    const existing = db
      .prepare("SELECT plate FROM plate_registry WHERE plate = ?")
      .get(plate) as any;
    if (!existing) {
      return res.status(404).json({ error: "Placa não encontrada." });
    }

    upsertOperation(resolvedOperationName, parsed.data.operation_logo_url ?? null);

    db.prepare(
      `
  UPDATE plate_registry
  SET model = ?,
      year = ?,
      operation_name = ?
  WHERE plate = ?
`,
    ).run(model, year, resolvedOperationName, plate);

    const updated = db
      .prepare(
        `
      SELECT pr.plate, pr.model, pr.year, pr.operation_name, op.logo_url AS operation_logo_url
      FROM plate_registry pr
      LEFT JOIN operations op ON op.name = pr.operation_name
      WHERE pr.plate = ?
      LIMIT 1
    `,
      )
      .get(plate);

    return res.json({ success: true, plate: updated });
  });

  app.delete("/api/admin/plates/:plate", requireAdmin, (req, res) => {
    const plate = normalizePlate(req.params.plate);
    if (!plate) {
      return res.status(400).json({ error: "Placa inválida." });
    }

    const existing = db
      .prepare("SELECT plate, operation_name FROM plate_registry WHERE plate = ?")
      .get(plate) as any;
    if (!existing) {
      return res.status(404).json({ error: "Placa não encontrada." });
    }

    db.prepare("DELETE FROM plate_registry WHERE plate = ?").run(plate);

    db.prepare(
      `
      DELETE FROM operations
      WHERE name = ?
        AND NOT EXISTS (
          SELECT 1
          FROM plate_registry
          WHERE operation_name = ?
        )
    `,
    ).run(existing.operation_name, existing.operation_name);

    return res.json({ success: true });
  });

  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth")) return next();
    if (req.path === "/sighra/webhook") return next();
    return requireAuth(req, res, next);
  });

  const sanitizeDriverStmt = db.prepare(`
    UPDATE vehicles
    SET driver = ?
    WHERE plate = ?
  `);
  const existingVehicles = db.prepare(`SELECT plate, driver FROM vehicles`).all() as Array<{
    plate: string;
    driver: string | null;
  }>;
  for (const row of existingVehicles) {
    const normalizedDriver = normalizeDriverName(row.driver);
    if (normalizedDriver && normalizedDriver !== String(row.driver || "").trim()) {
      sanitizeDriverStmt.run(normalizedDriver, row.plate);
    }
  }

  const sanitizeLocationStmt = db.prepare(`
    UPDATE vehicles
    SET location_name = ?,
        last_operational_location = ?
    WHERE plate = ?
  `);
  const existingVehicleLocations = db
    .prepare(
      `
    SELECT plate, location_name, last_operational_location
    FROM vehicles
  `,
    )
    .all() as Array<{
    plate: string;
    location_name: string | null;
    last_operational_location: string | null;
  }>;

  for (const row of existingVehicleLocations) {
    const mappedLocation = mapTrackerLocation(row.location_name);
    const mappedOperationalLocation = mapTrackerLocation(row.last_operational_location);

    if (
      mappedLocation !== (row.location_name || "") ||
      mappedOperationalLocation !== (row.last_operational_location || "")
    ) {
      sanitizeLocationStmt.run(
        mappedLocation || row.location_name,
        mappedOperationalLocation || row.last_operational_location,
        row.plate,
      );
    }
  }

  let lastSyncStatus = {
    success: false,
    lastUpdate: null as string | null,
    error: null as string | null,
    vehicleCount: 0,
  };

  let lastMacrosStatus = {
    success: false,
    lastUpdate: null as string | null,
    error: null as string | null,
    macroCount: 0,
  };

  const soapBaseUrl = requireEnv("SIGHRA_WS_URL").replace(/\?wsdl$/i, "");
  const sighraUser = requireEnv("SIGHRA_USER");
  const sighraPass = requireEnv("SIGHRA_PASS");

  const rasterBaseUrl = requireEnv("RASTER_BASE_URL");
  const rasterMethod = optionalEnv("RASTER_METHOD", "getEventoFimViagem");
  const rasterLogin = requireEnv("RASTER_LOGIN");
  const rasterPassword = requireEnv("RASTER_PASSWORD");

  const getRasterTripsEndpoint = () => {
    const normalizedMethod = String(rasterMethod || "").trim();
    const methodWithQuotes =
      normalizedMethod.startsWith('"') && normalizedMethod.endsWith('"')
        ? normalizedMethod
        : `"${normalizedMethod.replace(/^"+|"+$/g, "")}"`;

    return `${rasterBaseUrl.replace(/\/$/, "")}/${methodWithQuotes}`;
  };

  const getRasterTripsPayload = () => ({
    Ambiente: "Producao",
    Login: rasterLogin,
    Senha: rasterPassword,
    TipoRetorno: "JSON",
    StatusViagem: "A",
  });

  const fetchRasterResultList = async (forceRefresh = false): Promise<any[]> => {
    const now = Date.now();
    const hasFreshCache =
      !forceRefresh &&
      rasterTripsCache &&
      now - rasterTripsCache.fetchedAt < RASTER_TRIPS_CACHE_TTL_MS;

    if (hasFreshCache && rasterTripsCache) {
      return rasterTripsCache.resultList;
    }

    if (!forceRefresh && rasterTripsInflight) {
      return rasterTripsInflight;
    }

    const request = axios
      .post(getRasterTripsEndpoint(), getRasterTripsPayload(), {
        timeout: 30000,
        headers: { "Content-Type": "application/json" },
      })
      .then((response) => {
        const resultList = asArray(response?.data?.result);
        rasterTripsCache = {
          fetchedAt: Date.now(),
          resultList,
        };
        return resultList;
      })
      .finally(() => {
        rasterTripsInflight = null;
      });

    rasterTripsInflight = request;
    return request;
  };

  const callSoap = async (soapRequest: string) => {
    const response = await axios.post(soapBaseUrl, soapRequest, {
      timeout: 30000,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
      },
      responseType: "text",
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}: ${String(response.data).slice(0, 1000)}`);
    }

    return parser.parse(String(response.data || ""));
  };

  const fetchMacrosByRange = async (dataIni: string, dataFim: string) => {
    const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.sighra.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <ws:obterMacrosPeriodo>
      <usuario>${sighraUser}</usuario>
      <senha>${sighraPass}</senha>
      <dataIni>${dataIni}</dataIni>
      <dataFim>${dataFim}</dataFim>
    </ws:obterMacrosPeriodo>
  </soapenv:Body>
</soapenv:Envelope>`;

    const json = await callSoap(soapRequest);
    const body = getSoapBody(json);
    const responseNode =
      body?.obterMacrosPeriodoResponse || body?.["w:obterMacrosPeriodoResponse"] || null;
    const result = responseNode?.return || {};
    return asArray(result?.macro);
  };

  const processMacrosBatch = async (macrosData: any[]) => {
    if (!macrosData.length) {
      return { insertedCount: 0, kanbanUpdatedCount: 0 };
    }

    const insertMacro = db.prepare(`
      INSERT INTO macros_history (
        plate,
        driver,
        macro_id,
        macro_description,
        macro_group,
        created_at,
        latitude,
        longitude,
        city,
        state,
        raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const existsMacro = db.prepare(`
      SELECT id
      FROM macros_history
      WHERE plate = ?
        AND macro_id = ?
        AND created_at = ?
      LIMIT 1
    `);

    const getVehicleStmt = db.prepare(`
      SELECT *
      FROM vehicles
      WHERE plate = ?
    `);

    const updateLastMacroStmt = db.prepare(`
      UPDATE vehicles
      SET last_macro = ?,
          last_macro_time = ?,
          driver = ?,
          course = COALESCE(?, course),
          last_update = CURRENT_TIMESTAMP
      WHERE plate = ?
    `);

    const updateOperationalStatusStmt = db.prepare(`
      UPDATE vehicles
      SET status = CASE
            WHEN status IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN status
            ELSE ?
          END,
          last_operational_macro = ?,
          last_operational_macro_time = ?,
          driver = ?,
          last_operational_driver = ?,
          last_operational_location = ?,
          trip_start_time = CASE
            WHEN status IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN trip_start_time
            ELSE ?
          END,
          last_update = CURRENT_TIMESTAMP
      WHERE plate = ?
    `);

    let insertedCount = 0;
    let kanbanUpdatedCount = 0;

    const latestMacroByPlate = new Map<string, any>();
    const latestOperationalByPlate = new Map<string, any>();

    for (const macro of macrosData) {
      const plate = normalizePlate(macro?.placa || macro?.veiculo?.placa);
      if (!plate) continue;

      const driverRaw =
        macro?.motorista?.nome || (typeof macro?.motorista === "string" ? macro.motorista : "");

      const driver = resolveDriverValue(driverRaw, null);

      const macroId = String(macro?.id ?? macro?.idMacro ?? "").trim();
      const macroDescription = String(macro?.macro ?? macro?.descricao ?? "").trim();
      const macroGroup = String(macro?.tipoMacro ?? macro?.grupo ?? "").trim();
      const createdAt = String(macro?.dataMacro ?? macro?.dataRecepcao ?? "").trim();

      const latitude = safeFloat(macro?.latitude ?? macro?.lat, 0);
      const longitude = safeFloat(macro?.longitude ?? macro?.lng, 0);
      const city = String(macro?.cidade ?? "").trim();
      const state = String(macro?.estado ?? "").trim();

      if (!createdAt) continue;

      const alreadyExists = existsMacro.get(plate, macroId, createdAt) as any;
      if (!alreadyExists) {
        insertMacro.run(
          plate,
          driver,
          macroId,
          macroDescription,
          macroGroup,
          createdAt,
          latitude,
          longitude,
          city,
          state,
          JSON.stringify(macro),
        );
        insertedCount++;
      }

      const currentLatest = latestMacroByPlate.get(plate);
      if (!currentLatest) {
        latestMacroByPlate.set(plate, macro);
      } else {
        const currentDate = parseSighraDate(
          currentLatest?.dataMacro ?? currentLatest?.dataRecepcao,
        );
        const newDate = parseSighraDate(createdAt);
        if (newDate >= currentDate) {
          latestMacroByPlate.set(plate, macro);
        }
      }

      if (isOperationalMacro(macroDescription)) {
        const currentOperational = latestOperationalByPlate.get(plate);
        if (!currentOperational) {
          latestOperationalByPlate.set(plate, macro);
        } else {
          const currentDate = parseSighraDate(
            currentOperational?.dataMacro ?? currentOperational?.dataRecepcao,
          );
          const newDate = parseSighraDate(createdAt);
          if (newDate >= currentDate) {
            latestOperationalByPlate.set(plate, macro);
          }
        }
      }
    }

    for (const [plate, macro] of latestMacroByPlate.entries()) {
      const macroDescription = String(macro?.macro ?? macro?.descricao ?? "").trim();
      const macroTime = String(macro?.dataMacro ?? macro?.dataRecepcao ?? "").trim();
      const driverRaw = macro?.motorista?.nome || macro?.motorista || null;

      const course = safeFloat(macro?.curso ?? macro?.course ?? macro?.heading, 0);

      const vehicle = getVehicleStmt.get(plate) as any;
      if (!vehicle) continue;

      const finalDriver = String(driverRaw || "").trim() || "SEM MOTORISTA";

      const currentLastMacroTime = parseSighraDate(vehicle.last_macro_time);
      const newLastMacroTime = parseSighraDate(macroTime);

      if (newLastMacroTime >= currentLastMacroTime) {
        updateLastMacroStmt.run(macroDescription, macroTime, finalDriver, course, plate);
      }
    }

    for (const [plate, macro] of latestOperationalByPlate.entries()) {
      const macroDescription = String(macro?.macro ?? macro?.descricao ?? "").trim();
      const macroTime = String(macro?.dataMacro ?? macro?.dataRecepcao ?? "").trim();
      const driverRaw = macro?.motorista?.nome || macro?.motorista || null;

      const newStatus = mapMacroToKanbanStatus(macroDescription);
      if (!newStatus) continue;

      const vehicle = getVehicleStmt.get(plate) as any;
      if (!vehicle) continue;

      const finalDriver = String(driverRaw || "").trim() || "SEM MOTORISTA";

      const currentOperationalTime = parseSighraDate(vehicle.last_operational_macro_time);
      const newOperationalTime = parseSighraDate(macroTime);

      if (newOperationalTime < currentOperationalTime) {
        continue;
      }

      const tripStartTime =
        newStatus === "EM TRÂNSITO" ? vehicle.trip_start_time || new Date().toISOString() : null;

      updateOperationalStatusStmt.run(
        newStatus,
        macroDescription,
        macroTime,
        finalDriver,
        finalDriver,
        vehicle.location_name,
        tripStartTime,
        plate,
      );

      const updated = vehicleRepo.getVehicleByPlate(plate);
      if (updated) {
        kanbanUpdatedCount++;
        io.emit("vehicle:updated", updated);
      }
    }

    return { insertedCount, kanbanUpdatedCount };
  };

  const reconcileVehiclesWithoutActiveMacro = (io: Server) => {
    const vehicles = db.prepare(`SELECT * FROM vehicles`).all() as any[];

    const updateStmt = db.prepare(`
      UPDATE vehicles
      SET status = ?,
          last_operational_macro = ?,
          last_operational_macro_time = ?,
          trip_start_time = ?,
          last_update = CURRENT_TIMESTAMP
      WHERE plate = ?
    `);

    for (const vehicle of vehicles) {
      if (isMaintenanceStatus(vehicle.status)) {
        continue;
      }

      const historyMacro = getLastOperationalMacroFromHistory(vehicle.plate);

      if (!historyMacro) {
        const fallbackStatus = resolveVehicleStatusWithoutOperationalMacro(vehicle);
        const tripStartTime =
          fallbackStatus === "EM TRÂNSITO"
            ? vehicle.trip_start_time || new Date().toISOString()
            : null;

        updateStmt.run(fallbackStatus, null, null, tripStartTime, vehicle.plate);

        const updated = vehicleRepo.getVehicleByPlate(vehicle.plate);
        if (updated) io.emit("vehicle:updated", updated);
        continue;
      }

      const mappedStatus =
        mapMacroToKanbanStatus(historyMacro.macro_description) || "VEÍCULO VAZIO";
      const tripStartTime =
        mappedStatus === "EM TRÂNSITO" ? vehicle.trip_start_time || new Date().toISOString() : null;

      updateStmt.run(
        mappedStatus,
        historyMacro.macro_description,
        historyMacro.created_at,
        tripStartTime,
        vehicle.plate,
      );

      const updated = vehicleRepo.getVehicleByPlate(vehicle.plate);
      if (updated) io.emit("vehicle:updated", updated);
    }
  };

  const pollSighraPositions = async () => {
    try {
      console.log(`Polling SIGHRA Positions at ${soapBaseUrl}...`);

      const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.sighra.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <ws:obterUltimaPosicao>
      <usuario>${sighraUser}</usuario>
      <senha>${sighraPass}</senha>
    </ws:obterUltimaPosicao>
  </soapenv:Body>
</soapenv:Envelope>`;

      const json = await callSoap(soapRequest);
      const body = getSoapBody(json);
      const responseNode =
        body?.obterUltimaPosicaoResponse || body?.["w:obterUltimaPosicaoResponse"] || null;

      const result = responseNode?.return || {};
      const positions = asArray(result?.posicao);

      if (!positions.length) {
        console.log("No positions returned from SIGHRA");

        lastSyncStatus = {
          success: false,
          lastUpdate: new Date().toISOString(),
          error: "Nenhuma posição retornada",
          vehicleCount: 0,
        };

        io.emit("sync:status", lastSyncStatus);
        return;
      }

      console.log(`Received ${positions.length} positions from SIGHRA`);

      let updatedCount = 0;

      const getVehicleStmt = db.prepare(`
        SELECT *
        FROM vehicles
        WHERE plate = ?
      `);

      const updateVehicleStmt = db.prepare(`
        UPDATE vehicles
        SET lat = ?,
            lng = ?,
            speed = ?,
            course = ?,
            location_name = CASE
              WHEN status IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN location_name
              ELSE ?
            END,
            status = CASE
              WHEN status IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN status
              ELSE ?
            END,
            driver = ?,
            trip_start_time = CASE
              WHEN status IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN trip_start_time
              ELSE ?
            END,
            last_operational_driver = CASE
              WHEN status NOT IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN ?
              ELSE last_operational_driver
            END,
            last_operational_location = CASE
              WHEN status NOT IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN ?
              ELSE last_operational_location
            END,
            last_operational_speed = CASE
              WHEN status NOT IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN ?
              ELSE last_operational_speed
            END,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `);

      for (const data of positions) {
        const plate = normalizePlate(data?.placa);
        if (!plate) continue;

        const lat = safeFloat(data?.latitude, 0);
        const lng = safeFloat(data?.longitude, 0);
        const speed = safeInt(data?.velocidade, 0);
        const course = safeFloat(data?.curso ?? data?.course ?? data?.heading, 0);

        const current = getVehicleStmt.get(plate) as any;
        if (!current) continue;

        const driverNameRaw =
          data?.motorista?.nome ||
          data?.motorista?.nomeMotorista ||
          data?.driver ||
          data?.nomeMotorista ||
          (typeof data?.motorista === "string" ? data.motorista : "");

        const finalDriver = resolveDriverValue(driverNameRaw, current.driver);

        const operationalLocation = buildLocationFromPosition(data);

        let newStatus = current.status;
        let tripStartTime = current.trip_start_time;

        const lastOperationalStatus = current.last_operational_macro
          ? mapMacroToKanbanStatus(current.last_operational_macro)
          : null;

        if (lastOperationalStatus) {
          newStatus = lastOperationalStatus;

          if (newStatus === "EM TRÂNSITO" && !tripStartTime) {
            tripStartTime = new Date().toISOString();
          }

          if (newStatus !== "EM TRÂNSITO") {
            tripStartTime = null;
          }
        } else {
          newStatus = resolveVehicleStatusWithoutOperationalMacro(current);
          tripStartTime =
            newStatus === "EM TRÂNSITO"
              ? current.trip_start_time || new Date().toISOString()
              : null;
        }

        updateVehicleStmt.run(
          lat,
          lng,
          speed,
          course,
          operationalLocation,
          newStatus,
          finalDriver,
          tripStartTime,
          finalDriver,
          operationalLocation,
          speed,
          plate,
        );

        const updated = vehicleRepo.getVehicleByPlate(plate);
        if (updated) {
          updatedCount++;
          io.emit("vehicle:updated", updated);
        }
      }

      lastSyncStatus = {
        success: true,
        lastUpdate: new Date().toISOString(),
        error: null,
        vehicleCount: updatedCount,
      };
    } catch (error: any) {
      console.error("Error polling SIGHRA positions:", error.message);

      lastSyncStatus = {
        success: false,
        lastUpdate: new Date().toISOString(),
        error: error.message,
        vehicleCount: 0,
      };
    }

    io.emit("sync:status", lastSyncStatus);
  };

  const pollSighraMacros = async (fullLoad = false) => {
    try {
      let totalInserted = 0;
      let totalKanbanUpdated = 0;

      cleanupOldMacrosHistory();

      if (fullLoad) {
        const start = getTodayStartLocal();
        const end = new Date();
        const windows = buildTimeWindows(start, end, 30);

        console.log(`Polling SIGHRA Macros in ${windows.length} window(s) for full day load...`);

        for (const window of windows) {
          console.log(`Macros window: ${window.dataIni} -> ${window.dataFim}`);

          const macrosData = await fetchMacrosByRange(window.dataIni, window.dataFim);

          if (macrosData.length >= 1000) {
            console.warn(
              `A janela ${window.dataIni} -> ${window.dataFim} retornou ${macrosData.length} macros. Reduza para 15 min se necessário.`,
            );
          }

          const result = await processMacrosBatch(macrosData);
          totalInserted += result.insertedCount;
          totalKanbanUpdated += result.kanbanUpdatedCount;
        }
      } else {
        const { dataIni, dataFim } = getRecentRangeLocal(15);

        console.log(`Polling SIGHRA Macros incremental: ${dataIni} -> ${dataFim}`);

        const macrosData = await fetchMacrosByRange(dataIni, dataFim);

        if (macrosData.length >= 1000) {
          console.warn(
            `A janela incremental ${dataIni} -> ${dataFim} retornou ${macrosData.length} macros. Reduza o intervalo.`,
          );
        }

        const result = await processMacrosBatch(macrosData);
        totalInserted += result.insertedCount;
        totalKanbanUpdated += result.kanbanUpdatedCount;
      }

      reconcileVehiclesWithoutActiveMacro(io);

      lastMacrosStatus = {
        success: true,
        lastUpdate: new Date().toISOString(),
        error: null,
        macroCount: totalInserted,
      };

      console.log(`Updated ${totalKanbanUpdated} kanban status(es) from macros`);
      io.emit("macros:status", lastMacrosStatus);
    } catch (error: any) {
      console.error("Error polling SIGHRA macros:", error.message);

      lastMacrosStatus = {
        success: false,
        lastUpdate: new Date().toISOString(),
        error: error.message,
        macroCount: 0,
      };

      io.emit("macros:status", lastMacrosStatus);
    }
  };

  const pollRasterTrips = async () => {
    if (!rasterLogin || !rasterPassword) {
      console.log("Skipping Raster polling: missing RASTER_LOGIN/RASTER_PASSWORD");
      return;
    }

    try {
      const endpoint = getRasterTripsEndpoint();

      console.log(`Polling Raster trips at ${endpoint} ...`);

      const resultList = await fetchRasterResultList(true);
      const allStops = resultList.flatMap((result: any) =>
        asArray(result?.Viagens).flatMap((trip: any) => asArray(trip?.ColetasEntregas)),
      );
      const ibgeCodes = allStops
        .map((stop: any) => safeIBGECode(stop?.CodIBGECidade))
        .filter((code: number | null): code is number => code != null);
      const ibgeLabels = await resolveIbgeCityLabels(ibgeCodes);

      const totalTrips = resultList.reduce(
        (acc: number, result: any) => acc + asArray(result?.Viagens).length,
        0,
      );

      console.log(
        `Raster response received: ${resultList.length} result block(s), ${totalTrips} viagem(ns)`,
      );

      const updateRouteStmt = db.prepare(`
        UPDATE vehicles
        SET route_origin = ?,
            route_destination = ?,
            route_progress_percent = ?,
            route_timeline_link = ?,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `);
      const clearRouteStmt = db.prepare(`
        UPDATE vehicles
        SET route_origin = NULL,
            route_destination = NULL,
            route_progress_percent = NULL,
            route_timeline_link = NULL,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `);

      const getVehicleStmt = db.prepare(`SELECT * FROM vehicles WHERE plate = ?`);
      const getVehiclesWithRouteStmt = db.prepare(`
        SELECT plate
        FROM vehicles
        WHERE route_origin IS NOT NULL
           OR route_destination IS NOT NULL
           OR route_progress_percent IS NOT NULL
           OR route_timeline_link IS NOT NULL
      `);

      let updatedCount = 0;
      let clearedCount = 0;
      const skippedPlates = new Set<string>();
      const bestTripByPlate = new Map<string, any>();
      const excludedTripPlates = new Set<string>();

      for (const result of resultList) {
        for (const trip of asArray(result?.Viagens)) {
          const tripPlates = extractTripPlates(trip);
          if (!tripPlates.length) continue;

          if (!isConsideredRasterTrip(trip)) {
            tripPlates.forEach((plate) => excludedTripPlates.add(plate));
            continue;
          }

          const plate = normalizePlate(trip?.PlacaVeiculo) || tripPlates[0];

          const currentBest = bestTripByPlate.get(plate);
          if (!currentBest || scoreTripCompleteness(trip) >= scoreTripCompleteness(currentBest)) {
            bestTripByPlate.set(plate, trip);
          }
        }
      }

      for (const [plate, trip] of bestTripByPlate.entries()) {
        const currentVehicle = getVehicleStmt.get(plate) as any;
        if (!currentVehicle) {
          skippedPlates.add(plate);
          continue;
        }

        const canonicalStops = mergeStopsByCompleteness(asArray(trip?.ColetasEntregas));
        const { origin, destination, progressPercent } = selectOriginAndDestination(
          canonicalStops,
          ibgeLabels,
        );
        const timelineLink = String(trip?.LinkTimeLine || "").trim() || null;

        updateRouteStmt.run(origin, destination, progressPercent, timelineLink, plate);

        const updated = vehicleRepo.getVehicleByPlate(plate);
        if (updated) {
          updatedCount++;
          io.emit("vehicle:updated", updated);
        }
      }

      const platesToClear = new Set<string>();

      for (const plate of excludedTripPlates) {
        if (!bestTripByPlate.has(plate)) {
          platesToClear.add(plate);
        }
      }

      const vehiclesWithRoute = getVehiclesWithRouteStmt.all() as Array<{ plate: string }>;
      for (const vehicle of vehiclesWithRoute) {
        const plate = normalizePlate(vehicle?.plate);
        if (!plate) continue;
        if (bestTripByPlate.has(plate)) continue;
        platesToClear.add(plate);
      }

      for (const plate of platesToClear) {
        const currentVehicle = getVehicleStmt.get(plate) as any;
        if (!currentVehicle) continue;

        clearRouteStmt.run(plate);

        const updated = vehicleRepo.getVehicleByPlate(plate);
        if (updated) {
          clearedCount++;
          io.emit("vehicle:updated", updated);
        }
      }

      console.log(
        `Raster polling completed: ${updatedCount} veículo(s) atualizado(s), ${clearedCount} rota(s) limpa(s), ${skippedPlates.size} placa(s) ignorada(s) por não encontrada(s) no cadastro.`,
      );
    } catch (error: any) {
      const status = error?.response?.status;
      const responseBody = error?.response?.data;

      console.error("Error polling Raster trips:", error?.message || error);
      if (status) {
        console.error(`Raster HTTP status: ${status}`);
      }
      if (responseBody) {
        console.error(
          "Raster response body:",
          typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody),
        );
      }
    }
  };

  app.get("/api/vehicles/:plate/raster-trip", async (req, res) => {
    if (!rasterLogin || !rasterPassword) {
      return res.status(400).json({ error: "Raster credentials not configured" });
    }

    const normalizedPlate = normalizePlate(req.params.plate);

    try {
      const resultList = await fetchRasterResultList(false);
      const trips = resultList.flatMap((result: any) =>
        asArray(result?.Viagens).filter(isConsideredRasterTrip),
      );
      const trip = selectBestTripForPlate(trips, normalizedPlate);

      if (!trip) {
        const availableTripPlates = trips
          .map((item: any) => normalizePlate(item?.PlacaVeiculo))
          .filter(Boolean);

        return res.status(404).json({
          error: "Viagem não encontrada para a placa",
          plate: normalizedPlate,
          availableTripPlates: [...new Set(availableTripPlates)].slice(0, 30),
        });
      }

      const stops = mergeStopsByCompleteness(asArray(trip?.ColetasEntregas));
      const ibgeCodes = stops
        .map((stop: any) => safeIBGECode(stop?.CodIBGECidade))
        .filter((code: number | null): code is number => code != null);
      const ibgeLabels = await resolveIbgeCityLabels(ibgeCodes);

      const orderedStops = [...stops].sort(
        (a: any, b: any) => safeInt(a?.Ordem, 0) - safeInt(b?.Ordem, 0),
      );
      const mappedStops = orderedStops.map((stop: any) => ({
        ordem: safeInt(stop?.Ordem, 0),
        tipo: String(stop?.Tipo || "").toUpperCase(),
        cidade: getStopDisplayLocation(stop, ibgeLabels),
        percentualPercorrido: clampProgressPercent(stop?.PercentualPercorrido),
        kmPercorridoEntrega: safeFloat(stop?.KmPercorridoEntrega, 0),
        kmRestanteEntrega: safeFloat(stop?.KmRestanteEntrega, 0),
        distanciaRota: safeFloat(stop?.DistanciaRota, 0),
      }));

      const destinationStop =
        mappedStops.find((stop: any) => stop.tipo === "E") ||
        mappedStops[mappedStops.length - 1] ||
        null;

      const progressoPercorrido = clampProgressPercent(
        destinationStop?.percentualPercorrido ??
          mappedStops
            .map((stop: any) => clampProgressPercent(stop?.percentualPercorrido))
            .filter((value: number | null) => value != null)
            .reduce((acc: number, value: number | null) => Math.max(acc, value || 0), 0),
      );

      const kmPercorridoEntrega = safeFloat(destinationStop?.kmPercorridoEntrega, 0);
      const kmRestanteEntrega = safeFloat(destinationStop?.kmRestanteEntrega, 0);
      const distanciaRota = safeFloat(
        destinationStop?.distanciaRota,
        kmPercorridoEntrega + kmRestanteEntrega,
      );

      const tempoTotalViagem = safeFloat(trip?.TempoTotalViagem, 0);
      const percentualMovimentando = safeFloat(trip?.PercentualMovimentando, 0);
      const tempoMovimentando = Number(
        ((tempoTotalViagem * percentualMovimentando) / 100).toFixed(2),
      );
      const tempoParado = Number(Math.max(0, tempoTotalViagem - tempoMovimentando).toFixed(2));

      const stopOrigem =
        stops.find((stop: any) => String(stop?.Tipo || "").toUpperCase() === "C") || null;
      const stopDestino =
        stops.find((stop: any) => String(stop?.Tipo || "").toUpperCase() === "E") || null;

      const cnpjClienteOrig =
        normalizeCnpj(trip?.CNPJClienteOrig) || normalizeCnpj(stopOrigem?.CNPJCliente);
      const cnpjClienteDest =
        normalizeCnpj(trip?.CNPJClienteDest) || normalizeCnpj(stopDestino?.CNPJCliente);
      const [clienteOrigemNome, clienteDestinoNome] = await Promise.all([
        resolveCompanyNameByCnpj(cnpjClienteOrig),
        resolveCompanyNameByCnpj(cnpjClienteDest),
      ]);

      const statusViagemCode = String(trip?.StatusViagem || "")
        .trim()
        .toUpperCase();

      return res.json({
        plate: normalizedPlate,
        statusViagem: statusViagemCode,
        statusViagemLabel: formatStatusViagem(statusViagemCode),
        dataHoraPrevIni: trip?.DataHoraPrevIni || null,
        dataHoraPrevFim: trip?.DataHoraPrevFim || null,
        dataHoraRealIni: trip?.DataHoraRealIni || null,
        dentroPrazo: String(trip?.DentroPrazo || ""),
        percentualAtraso: safeFloat(trip?.PercentualAtraso, 0),
        velocidadeMedia: safeFloat(trip?.VelocidadeMedia, 0),
        tempoTotalViagem,
        percentualMovimentando,
        tempoMovimentando,
        tempoParado,
        carreta1: String(trip?.PlacaCarreta1 || "").trim() || null,
        carreta2: String(trip?.PlacaCarreta02 || trip?.PlacaCarreta2 || "").trim() || null,
        cnpjClienteOrig: cnpjClienteOrig || null,
        cnpjClienteDest: cnpjClienteDest || null,
        clienteOrigemNome: clienteOrigemNome || cnpjClienteOrig || "Não identificado",
        clienteDestinoNome: clienteDestinoNome || cnpjClienteDest || "Não identificado",
        progressoPercorrido,
        kmPercorridoEntrega,
        kmRestanteEntrega,
        distanciaRota,
        linkTimeLine: String(trip?.LinkTimeLine || "").trim() || null,
        stops: mappedStops,
      });
    } catch (error: any) {
      return res.status(500).json({
        error: "Erro ao consultar viagem na Raster",
        detail: error?.response?.data || error?.message || error,
      });
    }
  });

  app.get("/api/vehicles", (_req, res) => {
    db.prepare(
      `
      UPDATE vehicles
      SET maintenance_finished_at = NULL
      WHERE maintenance_finished_at IS NOT NULL
        AND datetime(maintenance_finished_at) < datetime('now', '-24 hours')
    `,
    ).run();

    const fleet = vehicleRepo.getAllVehicles();
    res.json(fleet);
  });

  app.get("/api/efficiency/current", (_req, res) => {
    const snapshot = calculateFleetEfficiency();

    res.json({
      timestamp: snapshot.timestamp,
      efficiency: snapshot.efficiency,
      totalVehicles: snapshot.totalVehicles,
      operationalVehicles: snapshot.operationalVehicles,
    });
  });

  app.get("/api/efficiency/start-of-day", (_req, res) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const startIso = startOfDay.toISOString();
    const endIso = endOfDay.toISOString();

    const currentDayRecord = db
      .prepare(
        `
      SELECT id, timestamp, efficiency, total_vehicles, operational_vehicles
      FROM fleet_efficiency_history
      WHERE timestamp >= ? AND timestamp < ?
      ORDER BY ABS(strftime('%s', timestamp) - strftime('%s', ?)) ASC
      LIMIT 1
    `,
      )
      .get(startIso, endIso, startIso) as any;

    const closestRecord =
      currentDayRecord ||
      (db
        .prepare(
          `
      SELECT id, timestamp, efficiency, total_vehicles, operational_vehicles
      FROM fleet_efficiency_history
      ORDER BY ABS(strftime('%s', timestamp) - strftime('%s', ?)) ASC
      LIMIT 1
    `,
        )
        .get(startIso) as any);

    if (!closestRecord) {
      const snapshot = calculateFleetEfficiency();
      return res.json({
        timestamp: snapshot.timestamp,
        efficiency: snapshot.efficiency,
        totalVehicles: snapshot.totalVehicles,
        operationalVehicles: snapshot.operationalVehicles,
        source: "fallback-current",
      });
    }

    res.json({
      id: closestRecord.id,
      timestamp: closestRecord.timestamp,
      efficiency: Number(closestRecord.efficiency),
      totalVehicles: Number(closestRecord.total_vehicles),
      operationalVehicles: Number(closestRecord.operational_vehicles),
      source: currentDayRecord ? "history-current-day" : "history-nearest",
    });
  });

  app.get("/api/sync/status", (_req, res) => {
    res.json(lastSyncStatus);
  });

  app.get("/api/macros/status", (_req, res) => {
    res.json(lastMacrosStatus);
  });

  app.get("/api/macros/today", (_req, res) => {
    const macros = db
      .prepare(
        `
      SELECT *
      FROM macros_history
      WHERE date(datetime(created_at, '-3 hours')) >= date('now', '-1 day', 'localtime')
      ORDER BY datetime(created_at) DESC
    `,
      )
      .all();

    res.json(macros);
  });

  const vehicleStatusSchema = z.object({
    status: z.enum([
      "EM TRÂNSITO",
      "AGUARDANDO CARREGAMENTO",
      "EFETUANDO CARREGAMENTO",
      "AGUARDANDO DESCARREGAMENTO",
      "EFETUANDO DESCARREGAMENTO",
      "VEÍCULO VAZIO",
      "EM MANUTENÇÃO",
    ]),
  });

  app.post("/api/vehicles/:plate/status", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const parsed = vehicleStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Status inválido." });
    }

    const vehicle = db
      .prepare("SELECT * FROM vehicles WHERE plate = ?")
      .get(normalizedPlate) as any;
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    const status = parsed.data.status;
    const tripStartTime = status === "EM TRÂNSITO" ? new Date().toISOString() : null;

    db.prepare(
      `
    UPDATE vehicles
    SET status = ?,
        trip_start_time = ?,
        last_update = CURRENT_TIMESTAMP
    WHERE plate = ?
  `,
    ).run(status, tripStartTime, normalizedPlate);

    const updated = vehicleRepo.getVehicleByPlate(normalizedPlate);
    if (updated) io.emit("vehicle:updated", updated);

    res.json({ success: true, vehicle: updated });
  });

  app.put("/api/vehicles/:plate/maintenance", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const parsed = maintenanceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Dados de manutenção inválidos." });
    }

    const driver = sanitizeText(parsed.data.driver, 120);
    const reason = sanitizeText(parsed.data.reason, 300);
    const location = sanitizeText(parsed.data.location, 300);
    const forecast = sanitizeText(parsed.data.forecast, 80);

    const vehicle = db
      .prepare("SELECT * FROM vehicles WHERE plate = ?")
      .get(normalizedPlate) as any;
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    db.prepare(
      `
    UPDATE vehicles
    SET driver = COALESCE(?, driver),
        maintenance_reason = COALESCE(?, maintenance_reason),
        location_name = COALESCE(?, location_name),
        maintenance_prev_date = COALESCE(?, maintenance_prev_date),
        last_update = CURRENT_TIMESTAMP
    WHERE plate = ?
  `,
    ).run(driver, reason, location, forecast, normalizedPlate);

    const updated = vehicleRepo.getVehicleByPlate(normalizedPlate);
    if (updated) io.emit("vehicle:updated", updated);

    res.json({ success: true, vehicle: updated });
  });

  app.put("/api/vehicles/:plate/observation", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const parsed = observationSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Observação inválida." });
    }

    const vehicle = db
      .prepare("SELECT * FROM vehicles WHERE plate = ?")
      .get(normalizedPlate) as any;
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    const observation = sanitizeText(parsed.data.observation ?? null, 1000);

    db.prepare(
      `
    UPDATE vehicles
    SET observation = ?,
        last_update = CURRENT_TIMESTAMP
    WHERE plate = ?
  `,
    ).run(observation, normalizedPlate);

    const updated = vehicleRepo.getVehicleByPlate(normalizedPlate);
    if (updated) io.emit("vehicle:updated", updated);

    res.json({ success: true, vehicle: updated });
  });

  app.post("/api/vehicles/:plate/maintenance", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const parsed = maintenanceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Dados de manutenção inválidos." });
    }

    const driver = sanitizeText(parsed.data.driver, 120);
    const reason = sanitizeText(parsed.data.reason, 300);
    const location = sanitizeText(parsed.data.location, 300);
    const forecast = sanitizeText(parsed.data.forecast, 80);

    const current = db
      .prepare("SELECT * FROM vehicles WHERE plate = ?")
      .get(normalizedPlate) as any;
    if (!current) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    db.prepare(
      `
    UPDATE vehicles
    SET status = 'EM MANUTENÇÃO',
        driver = ?,
        maintenance_reason = ?,
        location_name = ?,
        maintenance_prev_date = ?,
        maintenance_finished_at = NULL,
        trip_start_time = NULL,
        last_operational_driver = COALESCE(last_operational_driver, ?),
        last_operational_location = COALESCE(last_operational_location, ?),
        last_operational_speed = COALESCE(last_operational_speed, ?),
        last_update = CURRENT_TIMESTAMP
    WHERE plate = ?
  `,
    ).run(
      driver,
      reason,
      location,
      forecast,
      current.driver,
      current.location_name,
      current.speed,
      normalizedPlate,
    );

    const updated = vehicleRepo.getVehicleByPlate(normalizedPlate);
    if (updated) io.emit("vehicle:updated", updated);

    res.json({ success: true, vehicle: updated });
  });

  app.delete("/api/vehicles/:plate/maintenance", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);

    const vehicle = db
      .prepare("SELECT * FROM vehicles WHERE plate = ?")
      .get(normalizedPlate) as any;
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    const fallbackStatus = resolveVehicleStatusWithoutOperationalMacro(vehicle);

    const tripStartTime =
      fallbackStatus === "EM TRÂNSITO" ? vehicle.trip_start_time || new Date().toISOString() : null;

    db.prepare(
      `
      UPDATE vehicles
      SET status = ?,
          driver = COALESCE(last_operational_driver, driver),
          location_name = COALESCE(last_operational_location, location_name),
          speed = COALESCE(last_operational_speed, speed),
          maintenance_reason = NULL,
          maintenance_type = NULL,
          maintenance_prev_date = NULL,
          maintenance_finished_at = NULL,
          trip_start_time = ?,
          last_update = CURRENT_TIMESTAMP
      WHERE plate = ?
    `,
    ).run(fallbackStatus, tripStartTime, normalizedPlate);

    const updated = vehicleRepo.getVehicleByPlate(normalizedPlate);
    if (updated) io.emit("vehicle:updated", updated);

    res.json({ success: true, vehicle: updated });
  });

  app.post("/api/vehicles/:plate/maintenance/finish", (req, res) => {
    const normalizedPlate = normalizePlate(req.params.plate);
    const parsed = finishMaintenanceSchema.safeParse(req.body || {});

    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos para finalização." });
    }

    const reason = sanitizeText(parsed.data.reason, 300);
    const location = sanitizeText(parsed.data.location, 300);

    const vehicle = db
      .prepare("SELECT * FROM vehicles WHERE plate = ?")
      .get(normalizedPlate) as any;
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    const finishedAtDate = new Date();
    const finishedAt = finishedAtDate.toISOString();

    const fallbackStatus = resolveVehicleStatusWithoutOperationalMacro(vehicle);

    const tripStartTime =
      fallbackStatus === "EM TRÂNSITO" ? vehicle.trip_start_time || new Date().toISOString() : null;

    db.prepare(
      `
    UPDATE vehicles
    SET status = ?,
        driver = COALESCE(last_operational_driver, driver),
        location_name = COALESCE(last_operational_location, location_name),
        speed = COALESCE(last_operational_speed, speed),
        maintenance_finished_at = ?,
        maintenance_reason = NULL,
        maintenance_type = NULL,
        maintenance_prev_date = NULL,
        trip_start_time = ?,
        last_update = CURRENT_TIMESTAMP
    WHERE plate = ?
  `,
    ).run(fallbackStatus, finishedAt, tripStartTime, normalizedPlate);

    const historyReason = reason || vehicle.maintenance_reason;
    const historyLocation = location || vehicle.location_name;
    const historyForecast = new Date(finishedAtDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      `
    INSERT INTO maintenance_history (plate, driver, reason, location, start_date, finish_date, forecast_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      vehicle.plate,
      vehicle.driver,
      historyReason,
      historyLocation,
      vehicle.last_update,
      finishedAt,
      historyForecast,
    );

    const updated = vehicleRepo.getVehicleByPlate(normalizedPlate);
    if (updated) io.emit("vehicle:updated", updated);

    res.json({ success: true, vehicle: updated });
  });

  app.post("/api/sighra/webhook", (req, res) => {
    // In production SIGHRA_WEBHOOK_TOKEN is required at boot (see env loading
    // above). In dev it is optional, but if it's set we still enforce it.
    if (SIGHRA_WEBHOOK_TOKEN) {
      const token = String(req.headers["x-webhook-token"] || "");
      // timingSafeEqual avoids leaking token length via response time.
      const expected = Buffer.from(SIGHRA_WEBHOOK_TOKEN);
      const received = Buffer.from(token);
      const tokenMatches =
        expected.length === received.length && crypto.timingSafeEqual(expected, received);
      if (!tokenMatches) {
        return res.status(401).json({ error: "Unauthorized webhook" });
      }
    } else if (IS_PRODUCTION) {
      // Defense-in-depth: if env loading was bypassed somehow, never allow
      // an unauthenticated webhook to mutate fleet state in production.
      return res.status(401).json({ error: "Unauthorized webhook" });
    }

    const data = req.body;
    const normalizedPlate = normalizePlate(data?.plate);

    if (normalizedPlate) {
      db.prepare(
        `
      UPDATE vehicles
      SET lat = ?,
          lng = ?,
          speed = ?,
          last_update = CURRENT_TIMESTAMP
      WHERE plate = ?
    `,
      ).run(data.lat, data.lng, data.speed, normalizedPlate);

      const updated = vehicleRepo.getVehicleByPlate(normalizedPlate);
      if (updated) {
        io.emit("vehicle:updated", updated);
      }
    }

    res.status(200).send("OK");
  });

  app.get("/", (req, res, next) => {
    const authUser = (req as any).authUser as AuthUser | null;
    if (!authUser) {
      return res.redirect("/login");
    }
    next();
  });

  // SPA static hosting in production. In dev the frontend is served by the
  // Vite dev server on a separate port (see frontend/vite.config.ts) which
  // proxies /api, /login and /socket.io back to this backend.
  if (IS_PRODUCTION) {
    const frontendDist = resolveFrontendDistPath();
    app.use(express.static(frontendDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  io.use((socket, next) => {
    const cookies = parseCookies(socket.request.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    const user = auth.getAuthUserFromToken(token);
    if (!user) {
      return next(new Error("Unauthorized"));
    }
    (socket.data as any).authUser = user;
    next();
  });

  io.on("connection", (socket) => {
    console.log("Client connected", (socket.data as any).authUser?.email || "unknown");

    db.prepare(
      `
      UPDATE vehicles
      SET maintenance_finished_at = NULL
      WHERE maintenance_finished_at IS NOT NULL
        AND datetime(maintenance_finished_at) < datetime('now', '-24 hours')
    `,
    ).run();

    socket.emit("init:vehicles", vehicleRepo.getAllVehicles());
    socket.emit("sync:status", lastSyncStatus);
    socket.emit("macros:status", lastMacrosStatus);
  });

  httpServer.listen(APP_PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://0.0.0.0:${APP_PORT}`);

    cleanupOldMacrosHistory();

    await pollSighraMacros(true);
    await pollSighraPositions();
    await pollRasterTrips();

    saveFleetEfficiencySnapshot();

    setInterval(() => {
      saveFleetEfficiencySnapshot();
    }, 300000);

    setInterval(() => {
      pollSighraPositions();
    }, 60000);

    setInterval(() => {
      pollRasterTrips();
    }, 120000);

    setInterval(() => {
      cleanupOldMacrosHistory();
      pollSighraMacros(false);
    }, 300000);

    setInterval(() => {
      cleanupFinishedMaintenanceByForecast();
    }, 60000);
  });
}

export { startServer };
