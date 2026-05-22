import axios from "axios";

const ibgeCityCache = new Map<number, string>();

function extractUfFromIbgeResponse(data: unknown): string {
  const payload = data as Record<string, unknown> | null | undefined;
  if (!payload) return "";

  const microrregiao = payload.microrregiao as Record<string, unknown> | undefined;
  const mesorregiao = microrregiao?.mesorregiao as Record<string, unknown> | undefined;
  const ufFromMicro = (mesorregiao?.UF as Record<string, unknown> | undefined)?.sigla;

  const regiaoImediata = payload["regiao-imediata"] as Record<string, unknown> | undefined;
  const regiaoIntermediaria = regiaoImediata?.["regiao-intermediaria"] as
    | Record<string, unknown>
    | undefined;
  const ufFromRegiao = (regiaoIntermediaria?.UF as Record<string, unknown> | undefined)?.sigla;

  const ufDirect = (payload.UF as Record<string, unknown> | undefined)?.sigla;

  return String(ufFromMicro || ufFromRegiao || ufDirect || "").trim();
}

export async function resolveIbgeCityLabels(codes: number[]): Promise<Map<number, string>> {
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

export function safeIBGECode(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
