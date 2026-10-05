import { readNotificationStatus } from "../../../lib/notification-status";
import { accountView, authCapabilities, authContext, authFailure, authJson, requireSameOrigin, type AuthContext } from "../../../lib/auth";
import { ensureDefaultSettings, getTennisDb } from "../../../db/tennis";
import { continuousSettings, courtByKey, selectedCourtKeys, slotMatchesSettings, validCourtSelection, validCourtTimeRange } from "../../../lib/courts";
import { readHealth } from "../../../lib/monitor-health";

async function readDashboard(db: D1Database, userId: string) {
  const [settings, slots, requests, runs, health, notifications] = await Promise.all([
    db.prepare("SELECT * FROM watch_settings WHERE user_id = ?").bind(userId).first(),
    db.prepare(`SELECT s.*, r.status AS request_status, r.id AS request_id
      FROM availability_slots s
      LEFT JOIN booking_requests r ON r.slot_id = s.id AND r.user_id = s.user_id
        AND r.status IN ('pending','processing','booked','needs_action')
      WHERE s.user_id = ? AND s.status IN ('available','lottery_open')
      ORDER BY s.slot_date, s.start_time`).bind(userId).all(),
    db.prepare(`SELECT r.*, s.court_key, s.court_name, s.slot_date, s.start_time, s.end_time, s.reservation_type
      FROM booking_requests r JOIN availability_slots s ON s.id = r.slot_id AND s.user_id = r.user_id
      WHERE r.user_id = ? ORDER BY r.requested_at DESC LIMIT 30`).bind(userId).all(),
    db.prepare("SELECT * FROM monitor_runs WHERE user_id=? ORDER BY checked_at DESC").bind(userId).all(),
    readHealth(db, userId),
    readNotificationStatus(db, userId),
  ]);
  const selected = selectedCourtKeys(settings?.selected_court_keys);
  return { settings:continuousSettings(settings), health, notifications, slots: slots.results.filter(slot => slotMatchesSettings(slot, settings)), requests: requests.results, runs: runs.results.filter(run => selected.includes(String(run.court_key))) };
}

export async function GET(request: Request) {
  let context: AuthContext | undefined;
  try {
    context = await authContext(request);
    const userId = context.account.id;
    const db = getTennisDb();
    await ensureDefaultSettings(db, userId);
    return authJson({ ...await readDashboard(db, userId), account:accountView(context), capabilities:authCapabilities() }, context);
  } catch (error) {
    return authFailure(error, context);
  }
}

export async function POST(request: Request) {
  let context: AuthContext | undefined;
  try {
    requireSameOrigin(request);
    const payload = await request.json() as Record<string, unknown>;
    const action = payload.action;
    context = await authContext(request);
    const userId = context.account.id;
    const db = getTennisDb();
    await ensureDefaultSettings(db, userId);
    const currentContext = context;
    const result = async () => authJson({ ...await readDashboard(db, userId), account:accountView(currentContext), capabilities:authCapabilities() }, currentContext);
    const jsonError = (error:string,status=400) => authJson({error},currentContext,status);

    if (action === "save_courts") {
      if (!validCourtSelection(payload.courtKeys)) return jsonError("请选择至少一个有效场地");
      const keys = selectedCourtKeys(payload.courtKeys);
      await db.prepare("UPDATE watch_settings SET selected_court_keys=?, active=1, updated_at=CURRENT_TIMESTAMP WHERE user_id=?")
        .bind(JSON.stringify(keys), userId).run();
      return await result();
    }

    if (action === "save_court_time") {
      const { courtKey, start, end } = payload;
      if (typeof courtKey !== "string" || !courtByKey.has(courtKey)) return jsonError("请选择有效场地");
      const range = { start, end };
      if (!validCourtTimeRange(range)) return jsonError("请选择同一天内的有效时间，结束时间须晚于开始时间");
      await db.batch([
        db.prepare(`UPDATE watch_settings SET court_time_ranges=json_set(court_time_ranges, ?, json(?)),
          updated_at=CURRENT_TIMESTAMP WHERE user_id=?`)
          .bind(`$.${courtKey}`, JSON.stringify(range), userId),
        db.prepare("DELETE FROM monitor_runs WHERE court_key=? AND user_id=?").bind(courtKey, userId),
      ]);
      return await result();
    }

    if (action === "save_settings") {
      const currentSettings = await db.prepare("SELECT selected_court_keys FROM watch_settings WHERE user_id=?").bind(userId).first();
      if (payload.active !== false && !selectedCourtKeys(currentSettings?.selected_court_keys).length) return jsonError("请选择至少一个有效场地");
      // Compatibility for older clients: only activation is stored; date limits are retired.
      await db.prepare("UPDATE watch_settings SET active=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?")
        .bind(payload.active === false ? 0 : 1, userId).run();
      return await result();
    }

    if (action === "confirm_booking") {
      if (userId !== "owner") return jsonError("请前往官方预约网站完成预约", 403);
      const slotId = typeof payload.slotId === "string" ? payload.slotId : "";
      if (!slotId) return jsonError("缺少可预约时段");
      const slot = await db.prepare(`SELECT * FROM availability_slots
        WHERE id = ? AND user_id = ? AND status IN ('available','lottery_open')`)
        .bind(slotId, userId).first();
      if (!slot) return jsonError("该时段已不可预约，请刷新后重试", 409);
      const settings = await db.prepare("SELECT * FROM watch_settings WHERE user_id=?").bind(userId).first();
      if (!slotMatchesSettings(slot, settings)) return jsonError("此场地或时段不在已保存的监控范围内", 409);
      const existing = await db.prepare(`SELECT id FROM booking_requests
        WHERE slot_id = ? AND user_id = ? AND status IN ('pending','processing','booked','needs_action')`)
        .bind(slotId, userId).first();
      if (!existing) {
        await db.prepare(`INSERT INTO booking_requests
          (id, user_id, slot_id, status, status_message, requested_at, updated_at)
          VALUES (?, ?, ?, 'pending', '已收到你的确认，等待预约助手执行', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
          .bind(crypto.randomUUID(), userId, slotId).run();
      }
      return await result();
    }

    if (action === "cancel_request") {
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      await db.prepare(`UPDATE booking_requests SET status='cancelled',
        status_message='你已取消这次预约请求', updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND user_id=? AND status='pending'`).bind(requestId, userId).run();
      return await result();
    }

    return jsonError("未知操作");
  } catch (error) {
    return authFailure(error, context);
  }
}
