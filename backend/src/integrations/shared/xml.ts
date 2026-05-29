import { XMLParser } from "fast-xml-parser";

export const soapParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

export function getSoapBody(json: unknown): Record<string, unknown> | null {
  const payload = json as Record<string, unknown> | null | undefined;
  if (!payload) return null;

  const envelope = payload.Envelope ?? payload["S:Envelope"];
  if (envelope && typeof envelope === "object") {
    const body =
      (envelope as Record<string, unknown>).Body ?? (envelope as Record<string, unknown>)["S:Body"];
    if (body && typeof body === "object") {
      return body as Record<string, unknown>;
    }
  }

  return (payload.Body as Record<string, unknown> | undefined) ?? null;
}
