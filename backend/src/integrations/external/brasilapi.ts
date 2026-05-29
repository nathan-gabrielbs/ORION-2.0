import axios from "axios";
import { normalizeCnpj } from "../shared/values.js";

const cnpjNameCache = new Map<string, string>();

export async function resolveCompanyNameByCnpj(cnpjValue: unknown): Promise<string | null> {
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
