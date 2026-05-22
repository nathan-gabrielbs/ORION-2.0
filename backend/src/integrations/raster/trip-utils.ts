import { normalizePlate } from "../../shared/utils/plate.js";
import { safeIBGECode } from "../external/ibge.js";
import { clampProgressPercent, parseDateMs } from "../shared/datetime.js";
import {
  asArray,
  hasMeaningfulValue,
  normalizeCnpj,
  safeFloat,
  safeInt,
} from "../shared/values.js";

export function tripContainsPlate(trip: any, normalizedPlate: string): boolean {
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

export function scoreStopCompleteness(stop: any): number {
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

export function scoreStopPrecision(stop: any): number {
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

export function scoreStopLifecycle(stop: any): number {
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

export function isStopBetterCandidate(candidate: any, current: any): boolean {
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

export function mergeStopsByCompleteness(stops: any[]): any[] {
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

export function scoreTripCompleteness(trip: any): number {
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

export function isConsideredRasterTrip(trip: any): boolean {
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

export function extractTripPlates(trip: any): string[] {
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

export function selectBestTripForPlate(trips: any[], normalizedPlate: string): any | null {
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

export function getStopDisplayLocation(stop: any, ibgeLabels?: Map<number, string>): string {
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

export function selectOriginAndDestination(stops: any[], ibgeLabels?: Map<number, string>) {
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
