import { env } from "cloudflare:workers";
import { defaultCourtKeys, monitoringStartDate, retiredCourtKeys } from "../lib/courts";

export const OWNER_ID = "owner";

export type RuntimeEnv = {
  DB?: D1Database; MONITOR_INGEST_KEY?: string; OWNER_BOOTSTRAP_EMAIL?: string;
  SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string; PHONE_LOGIN_ENABLED?: string;
  RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string; SITE_ORIGIN?: string;
  INVITE_ONLY?: string;
};
export function runtimeEnv(): RuntimeEnv { return env as unknown as RuntimeEnv; }

export function getTennisDb(): D1Database {
  const db = (env as unknown as RuntimeEnv).DB;
  if (!db) throw new Error("Tennis database is unavailable");
  return db;
}

export function getMonitorKey(): string | undefined {
  return (env as unknown as RuntimeEnv).MONITOR_INGEST_KEY;
}

export async function ensureDefaultSettings(db: D1Database, userId = OWNER_ID) {
  const today = monitoringStartDate();
  await db.prepare(`INSERT OR IGNORE INTO watch_settings
    (user_id,start_date,end_date,outdoor_start,outdoor_end,ariake_all_day,active,selected_court_keys,updated_at)
    VALUES (?,? ,? ,'17:00','21:00',1,?,?,CURRENT_TIMESTAMP)`)
    .bind(userId, today, today, userId === OWNER_ID ? 1 : 0, JSON.stringify(userId === OWNER_ID ? defaultCourtKeys : [])).run();

  // Clean up retired venues once, preserving the user's other selections and times.
  const retired = JSON.stringify(retiredCourtKeys);
  const paths = retiredCourtKeys.map(key => `$.${key}`);
  await db.prepare(`UPDATE watch_settings SET
    selected_court_keys=(SELECT json_group_array(value) FROM json_each(selected_court_keys)
      WHERE value NOT IN (SELECT value FROM json_each(?))),
    court_time_ranges=json_remove(court_time_ranges, ${paths.map(() => "?").join(",")}),
    active=CASE WHEN EXISTS (SELECT 1 FROM json_each(selected_court_keys)
      WHERE value NOT IN (SELECT value FROM json_each(?))) THEN active ELSE 0 END,
    updated_at=CURRENT_TIMESTAMP
    WHERE user_id=? AND (
      EXISTS (SELECT 1 FROM json_each(selected_court_keys) WHERE value IN (SELECT value FROM json_each(?)))
      OR EXISTS (SELECT 1 FROM json_each(court_time_ranges) WHERE key IN (SELECT value FROM json_each(?)))
    )`).bind(retired, ...paths, retired, userId, retired, retired).run();
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
