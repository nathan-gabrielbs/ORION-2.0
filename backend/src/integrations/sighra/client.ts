import axios from "axios";
import { asArray } from "../shared/values.js";
import { getSoapBody, soapParser } from "../shared/xml.js";
import { SIGHRA_MACROS_DEBUG } from "../../shared/app-config.js";
import { logEmptyMacrosSoapResponse, logMacroSample, logMacrosWindowFetch } from "./macro-debug.js";

export type SighraClientConfig = {
  soapBaseUrl: string;
  user: string;
  pass: string;
};

export function createSighraClient(config: SighraClientConfig) {
  const callSoap = async (soapRequest: string) => {
    const response = await axios.post(config.soapBaseUrl, soapRequest, {
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

    return soapParser.parse(String(response.data || ""));
  };

  const fetchMacrosByRange = async (dataIni: string, dataFim: string) => {
    const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.sighra.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <ws:obterMacrosPeriodo>
      <usuario>${config.user}</usuario>
      <senha>${config.pass}</senha>
      <dataIni>${dataIni}</dataIni>
      <dataFim>${dataFim}</dataFim>
    </ws:obterMacrosPeriodo>
  </soapenv:Body>
</soapenv:Envelope>`;

    const json = await callSoap(soapRequest);
    const body = getSoapBody(json);
    const responseNode =
      body?.obterMacrosPeriodoResponse || body?.["w:obterMacrosPeriodoResponse"] || null;
    const result = (responseNode as Record<string, unknown> | undefined)?.return || {};
    const macros = asArray((result as Record<string, unknown>).macro);

    logMacrosWindowFetch(dataIni, dataFim, macros.length);

    if (SIGHRA_MACROS_DEBUG) {
      if (macros.length === 0) {
        logEmptyMacrosSoapResponse(
          dataIni,
          dataFim,
          Object.keys((body as Record<string, unknown>) || {}),
          Boolean(responseNode),
        );
      } else {
        const first = macros[0] as Record<string, unknown>;
        const nestedPlate = (first?.veiculo as Record<string, unknown> | undefined)?.placa;
        const plate = String(first?.placa ?? nestedPlate ?? "").trim();
        const description = String(first?.macro ?? first?.descricao ?? "").trim();
        const createdAt = String(first?.dataMacro ?? first?.dataRecepcao ?? "").trim();
        logMacroSample(first, plate, description, createdAt);
      }
    }

    return macros;
  };

  const fetchLastPositions = async () => {
    const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.sighra.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <ws:obterUltimaPosicao>
      <usuario>${config.user}</usuario>
      <senha>${config.pass}</senha>
    </ws:obterUltimaPosicao>
  </soapenv:Body>
</soapenv:Envelope>`;

    const json = await callSoap(soapRequest);
    const body = getSoapBody(json);
    const responseNode =
      body?.obterUltimaPosicaoResponse || body?.["w:obterUltimaPosicaoResponse"] || null;
    const result = (responseNode as Record<string, unknown> | undefined)?.return || {};
    return asArray((result as Record<string, unknown>).posicao);
  };

  return {
    callSoap,
    fetchMacrosByRange,
    fetchLastPositions,
  };
}

export type SighraClient = ReturnType<typeof createSighraClient>;
