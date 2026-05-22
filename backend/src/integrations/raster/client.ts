import axios from "axios";

const RASTER_TRIPS_CACHE_TTL_MS = 2 * 60 * 1000;

export type RasterClientConfig = {
  baseUrl: string;
  method: string;
  login: string;
  password: string;
};

export function createRasterClient(config: RasterClientConfig) {
  let rasterTripsCache: { fetchedAt: number; resultList: unknown[] } | null = null;
  let rasterTripsInflight: Promise<unknown[]> | null = null;

  const getTripsEndpoint = () => {
    const normalizedMethod = String(config.method || "").trim();
    const methodWithQuotes =
      normalizedMethod.startsWith('"') && normalizedMethod.endsWith('"')
        ? normalizedMethod
        : `"${normalizedMethod.replace(/^"+|"+$/g, "")}"`;

    return `${config.baseUrl.replace(/\/$/, "")}/${methodWithQuotes}`;
  };

  const getTripsPayload = () => ({
    Ambiente: "Producao",
    Login: config.login,
    Senha: config.password,
    TipoRetorno: "JSON",
    StatusViagem: "A",
  });

  const fetchResultList = async (forceRefresh = false): Promise<unknown[]> => {
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
      .post(getTripsEndpoint(), getTripsPayload(), {
        timeout: 30000,
        headers: { "Content-Type": "application/json" },
      })
      .then((response) => {
        const resultList = Array.isArray(response?.data?.result)
          ? response.data.result
          : response?.data?.result
            ? [response.data.result]
            : [];
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

  return {
    getTripsEndpoint,
    fetchResultList,
  };
}

export type RasterClient = ReturnType<typeof createRasterClient>;
