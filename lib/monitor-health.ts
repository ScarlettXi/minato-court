import { parseScanWindow, type ScanWindow } from "./scan-window";
export const STALE_AFTER_MS = 10 * 60 * 1000;
export type CourtHealth = { lastSuccessAt: string | null; consecutiveFailures: number; status: string; scanWindow?: ScanWindow };
export type MonitorHealth = {
  reportedAt?: string;
  lastEndToEndSuccessAt: string | null;
  perCourt: Record<string, CourtHealth>;
  officialBlocks: string[];
  status: string;
  telegramStatus: string;
};

function instant(value: unknown, now: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 40 || !/(Z|[+-]\d\d:\d\d)$/.test(value)) throw new Error("Invalid health timestamp");
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > now + 60_000) throw new Error("Invalid health timestamp");
  return new Date(time).toISOString();
}

export function cleanHealth(value: unknown, selected: string[], now = Date.now()): MonitorHealth {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid health snapshot");
  const input = value as Record<string, unknown>;
  if (!input.perCourt || typeof input.perCourt !== "object" || Array.isArray(input.perCourt)) throw new Error("Invalid court health");
  const perCourt: Record<string, CourtHealth> = {};
  for (const key of selected) {
    const entry = (input.perCourt as Record<string, unknown>)[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const failures = row.consecutiveFailures;
    if (!Number.isInteger(failures) || Number(failures) < 0 || Number(failures) > 1_000_000) throw new Error("Invalid failure count");
    const status = String(row.status);
    if (!["healthy", "ok", "error", "failed", "blocked", "pending", "unknown", "paused", "stale", "partial"].includes(status)) throw new Error("Invalid court status");
    perCourt[key] = { lastSuccessAt: instant(row.lastSuccessAt, now), consecutiveFailures: Number(failures), status,
      ...(row.scanWindow === undefined ? {} : { scanWindow: parseScanWindow(row.scanWindow) }) };
  }
  const blocks = Array.isArray(input.officialBlocks) ? input.officialBlocks : Object.keys(input.officialBlocks || {});
  const status = String(input.status || "unknown");
  return {
    lastEndToEndSuccessAt: instant(input.lastEndToEndSuccessAt, now), perCourt,
    officialBlocks: blocks.filter(key => key === "tokyo" || key === "minato") as string[],
    status: ["healthy", "partial", "blocked", "error", "paused", "unknown"].includes(status) ? status : "unknown",
    telegramStatus: ["confirmed", "sent", "not_needed", "disabled", "failed_or_unconfirmed", "unknown"].includes(String(input.telegramStatus)) ? String(input.telegramStatus) : "unknown",
  };
}

export function courtFreshness(health: MonitorHealth | null | undefined, key: string, checkedAt: unknown, active: boolean, now = Date.now()) {
  if (!active) return "paused";
  const row = health?.perCourt[key];
  if (row?.status === "blocked") return "blocked";
  const last = row?.lastSuccessAt ?? (typeof checkedAt === "string" ? checkedAt : null);
  if (!last) return "unknown";
  const time = Date.parse(last);
  if (!Number.isFinite(time) || time > now + 60_000 || now - time > STALE_AFTER_MS) return "stale";
  if (row && !["healthy", "ok"].includes(row.status)) return "partial";
  return "healthy";
}

export async function readHealth(db: D1Database, userId: string): Promise<MonitorHealth | null> {
  const row = await db.prepare("SELECT reported_at,payload FROM monitor_health WHERE user_id=?").bind(userId).first<{reported_at:string;payload:string}>();
  return row ? { ...JSON.parse(row.payload), reportedAt: row.reported_at } : null;
}

// Freshness belongs to each observation, not just the most recent scan of its court.
export function slotIsFresh(slot: Record<string, unknown>, health: MonitorHealth | null | undefined,
  courtStatus: string, now = Date.now()): boolean {
  if (courtStatus !== "healthy") return false;
  const window = health?.perCourt[String(slot.court_key)]?.scanWindow;
  if (window && (String(slot.slot_date) < window.startDate || String(slot.slot_date) > window.endDate
    || slot.reservation_type !== "first_come")) return false;
  const raw = String(slot.last_seen_at ?? "");
  const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? raw.replace(" ", "T") + "Z" : raw);
  return Number.isFinite(timestamp) && timestamp <= now + 60_000 && now - timestamp <= STALE_AFTER_MS;
}
