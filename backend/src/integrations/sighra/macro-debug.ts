export type MacroBatchStats = {
  received: number;
  skippedNoPlate: number;
  skippedNoDate: number;
  insertedHistory: number;
  operational: number;
  skippedNoVehicle: number;
  skippedNotMapped: number;
  skippedOlder: number;
  kanbanUpdated: number;
};

export function createEmptyMacroBatchStats(received = 0): MacroBatchStats {
  return {
    received,
    skippedNoPlate: 0,
    skippedNoDate: 0,
    insertedHistory: 0,
    operational: 0,
    skippedNoVehicle: 0,
    skippedNotMapped: 0,
    skippedOlder: 0,
    kanbanUpdated: 0,
  };
}

export function getProcessTimezoneLabel(): string {
  return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
}

export function summarizeMacroKeys(macro: Record<string, unknown>): string {
  return Object.keys(macro || {})
    .slice(0, 12)
    .join(",");
}

export function logMacrosWindowFetch(dataIni: string, dataFim: string, fetched: number): void {
  console.log(`[SIGHRA macros] window ${dataIni} -> ${dataFim} | fetched=${fetched}`);
}

export function logMacrosPollComplete(
  fetched: number,
  inserted: number,
  kanbanUpdated: number,
  windowLabel: string,
): void {
  console.log(
    `[SIGHRA macros] poll complete window=${windowLabel} fetched=${fetched} inserted=${inserted} kanbanUpdated=${kanbanUpdated}`,
  );
}

export function logMacroBatchSummary(stats: MacroBatchStats, debug: boolean): void {
  if (!debug && stats.received === 0) {
    return;
  }

  console.log(
    `[SIGHRA macros] batch summary received=${stats.received} inserted=${stats.insertedHistory} operational=${stats.operational} noPlate=${stats.skippedNoPlate} noDate=${stats.skippedNoDate} noVehicle=${stats.skippedNoVehicle} notMapped=${stats.skippedNotMapped} older=${stats.skippedOlder} kanbanUpdated=${stats.kanbanUpdated}`,
  );
}

export function logMacroSample(
  macro: Record<string, unknown>,
  plate: string,
  description: string,
  createdAt: string,
): void {
  console.log(
    `[SIGHRA macros] sample plate=${plate} macro="${description}" at=${createdAt} keys=[${summarizeMacroKeys(macro)}]`,
  );
}

export function logEmptyMacrosSoapResponse(
  dataIni: string,
  dataFim: string,
  bodyKeys: string[],
  hasResponseNode: boolean,
): void {
  console.warn(
    `[SIGHRA macros] empty SOAP result window=${dataIni} -> ${dataFim} responseNode=${hasResponseNode} bodyKeys=[${bodyKeys.join(",")}]`,
  );
}
