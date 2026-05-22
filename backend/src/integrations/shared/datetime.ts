export function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

export function getRecentRangeLocal(minutes = 15) {
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60 * 1000);

  return {
    dataIni: formatDateLocal(start),
    dataFim: formatDateLocal(end),
  };
}

export function getTodayStartLocal() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function parseDateMs(value: unknown): number {
  const text = String(value || "").trim();
  if (!text) return 0;

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseSighraDate(value: unknown): number {
  return parseDateMs(value);
}

export function clampProgressPercent(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return 0;
  if (parsed >= 100) return 100;
  return Number(parsed.toFixed(1));
}

export function buildTimeWindows(start: Date, end: Date, windowMinutes = 30) {
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
