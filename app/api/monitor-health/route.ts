import { getMonitorKey, getTennisDb, jsonError, OWNER_ID } from "../../../db/tennis";
import { selectedCourtKeys } from "../../../lib/courts";
import { cleanHealth } from "../../../lib/monitor-health";
import { canAccessAccount } from "../../../lib/invitations";

// Existing monitor authorization, deliberately no browser identity fallback.
export async function POST(request: Request) {
  const expected = getMonitorKey();
  if (!expected || request.headers.get("x-monitor-key") !== expected) return jsonError("Unauthorized", 401);
  try {
    const raw = await request.text();
    if (raw.length > 24_000) return jsonError("Health snapshot too large", 413);
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { return jsonError("Invalid health snapshot", 400); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return jsonError("Invalid health snapshot", 400);
    const userId = input.userId === undefined ? OWNER_ID : input.userId;
    if (typeof userId !== "string") return jsonError("Invalid account", 400);
    const db = getTennisDb();
    if (!await canAccessAccount(db,userId)) return jsonError("Unknown monitoring account",404);
    const settings = await db.prepare("SELECT selected_court_keys FROM watch_settings WHERE user_id=?").bind(userId).first<{selected_court_keys:string}>();
    if (!settings) return jsonError("Unknown monitoring account", 404);
    let health;
    try { health = cleanHealth(input.health, selectedCourtKeys(settings.selected_court_keys)); }
    catch { return jsonError("Invalid health snapshot", 400); }
    const reportedAt = new Date().toISOString();
    await db.prepare(`INSERT INTO monitor_health(user_id,reported_at,payload) VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET reported_at=excluded.reported_at,payload=excluded.payload`)
      .bind(userId, reportedAt, JSON.stringify(health)).run();
    return Response.json({ok:true,reportedAt}, {headers:{"cache-control":"no-store"}});
  } catch {
    console.error("monitor_health_write_failed");
    return jsonError("Health storage temporarily unavailable", 503);
  }
}
