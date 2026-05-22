import { resolveCompanyNameByCnpj } from "../external/brasilapi.js";
import { resolveIbgeCityLabels, safeIBGECode } from "../external/ibge.js";
import type { RasterClient } from "./client.js";
import { clampProgressPercent } from "../shared/datetime.js";
import {
  asArray,
  formatStatusViagem,
  normalizeCnpj,
  safeFloat,
  safeInt,
} from "../shared/values.js";
import {
  getStopDisplayLocation,
  isConsideredRasterTrip,
  mergeStopsByCompleteness,
  selectBestTripForPlate,
} from "./trip-utils.js";
import { normalizePlate } from "../../shared/utils/plate.js";

export type RasterTripHandlerDeps = {
  rasterClient: RasterClient;
  rasterLogin: string;
  rasterPassword: string;
};

export async function handleRasterTripRequest(
  deps: RasterTripHandlerDeps,
  plateParam: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { rasterClient, rasterLogin, rasterPassword } = deps;

  if (!rasterLogin || !rasterPassword) {
    return { status: 400, body: { error: "Raster credentials not configured" } };
  }

  const normalizedPlate = normalizePlate(plateParam);

  try {
    const resultList = (await rasterClient.fetchResultList(false)) as any[];
    const trips = resultList.flatMap((result: any) =>
      asArray(result?.Viagens).filter(isConsideredRasterTrip),
    );
    const trip = selectBestTripForPlate(trips, normalizedPlate);

    if (!trip) {
      const availableTripPlates = trips
        .map((item: any) => normalizePlate(item?.PlacaVeiculo))
        .filter(Boolean);

      return {
        status: 404,
        body: {
          error: "Viagem não encontrada para a placa",
          plate: normalizedPlate,
          availableTripPlates: [...new Set(availableTripPlates)].slice(0, 30),
        },
      };
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

    return {
      status: 200,
      body: {
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
      },
    };
  } catch (error: any) {
    return {
      status: 500,
      body: {
        error: "Erro ao consultar viagem na Raster",
        detail: error?.response?.data || error?.message || error,
      },
    };
  }
}
