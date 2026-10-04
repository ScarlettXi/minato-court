export type ScanWindow = { startDate: string; endDate: string };

export function parseScanWindow(value: unknown): ScanWindow {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid scan window");
  const { startDate, endDate } = value as Record<string, unknown>;
  const valid = (date: unknown): date is string => typeof date === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
    && new Date(date).toISOString().slice(0, 10) === date;
  if (!valid(startDate) || !valid(endDate) || startDate > endDate
    || Date.parse(endDate) - Date.parse(startDate) > 27 * 86400000) throw new Error("Invalid scan window");
  return { startDate, endDate };
}
