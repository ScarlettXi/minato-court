import { ensureDefaultSettings, getMonitorKey, getTennisDb, isIsoDate, jsonError, OWNER_ID } from "../../../db/tennis";

import { slotEmailStatement, sendQueuedEmails } from "../../../lib/notifications";

import { bookingUrl, continuousSettings, courtByKey, courtTimeRange, selectedCourtKeys, slotMatchesSettings } from "../../../lib/courts";

function authorized(request: Request) {
  const expected = getMonitorKey();
  if (!expected) return false;
  return request.headers.get("x-monitor-key") === expected;
}

async function monitorUser(db: D1Database, value: unknown) {
  if (value === undefined || value === null || value === OWNER_ID) return OWNER_ID;
  if (typeof value !== "string") return null;
  const row = await db.prepare("SELECT id FROM app_users WHERE id=?").bind(value).first<{ id:string }>();
  return row?.id ?? null;
}

export async function GET(request: Request) {
  try {
    if (!authorized(request)) return jsonError("Unauthorized", 401);
    const db = getTennisDb();
    const query = new URL(request.url).searchParams;
    if (query.get("listUsers") === "1") {
      await ensureDefaultSettings(db);
      const users = await db.prepare("SELECT user_id FROM watch_settings WHERE active=1 AND user_id>? ORDER BY user_id LIMIT 51").bind(query.get("after") || "").all<{user_id:string}>();
      return Response.json({ users:users.results.slice(0,50).map(row => row.user_id), next:users.results.length > 50 ? users.results[49].user_id : null }, {headers:{"cache-control":"no-store"}});
    }
    const userId = await monitorUser(db, query.get("userId"));
    if (!userId) return jsonError("Unknown monitoring account",404);
    await ensureDefaultSettings(db,userId);
    const [settings, pending, verification, currentSlots] = await Promise.all([
      db.prepare("SELECT * FROM watch_settings WHERE user_id=?").bind(userId).first(),
      db.prepare(`SELECT r.id AS request_id, r.status, s.* FROM booking_requests r
        JOIN availability_slots s ON s.id=r.slot_id AND s.user_id=r.user_id
        WHERE r.user_id=? AND r.status IN ('pending','processing')
        ORDER BY r.requested_at`).bind(userId).all(),
      db.prepare(`SELECT r.id AS request_id, r.status AS request_status,
          r.confirmation_number, r.official_status, r.booked_at, r.official_checked_at,
          r.official_verified, r.official_source_url, r.booking_details,
          r.verification_status, r.verification_message, s.*
        FROM booking_requests r
        JOIN availability_slots s ON s.id=r.slot_id AND s.user_id=r.user_id
        WHERE r.user_id=? AND r.status='booked' AND r.official_verified=0
        ORDER BY COALESCE(r.official_checked_at,r.updated_at), r.requested_at`).bind(userId).all(),
      db.prepare(`SELECT * FROM availability_slots WHERE user_id=?
        AND status IN ('available','lottery_open') ORDER BY slot_date,start_time`)
        .bind(userId).all(),
    ]);
    const preferences = await db.prepare("SELECT notification_channel FROM app_users WHERE id=?").bind(userId).first<{notification_channel:string}>();
    return Response.json({
      userId,
      notificationChannel:preferences?.notification_channel ?? (userId === OWNER_ID ? "push" : "none"),
      settings:continuousSettings(settings),
      selectedCourtKeys: selectedCourtKeys(settings?.selected_court_keys),
      selectedCourts: selectedCourtKeys(settings?.selected_court_keys).map(key => {
        const court = courtByKey.get(key)!;
        const range = courtTimeRange(settings, key);
        return { ...court, sourceUrl:bookingUrl(court), targetStart:range.start, targetEnd:range.end };
      }),
      pendingRequests: pending.results,
      verificationRequests: verification.results,
      currentSlots: currentSlots.results.filter(slot => slotMatchesSettings(slot, settings)),
    }, {headers:{"cache-control":"private, no-store"}});
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "读取失败", 500);
  }
}

export async function POST(request: Request) {
  try {
    if (!authorized(request)) return jsonError("Unauthorized", 401);
    const body = await request.json() as {
      userId?: string;
      checkedCourts?: string[];
      slots?: Array<Record<string, unknown>>;
      bookingUpdates?: Array<Record<string, unknown>>;
      runMessage?: string;
    };
    if (!Array.isArray(body.checkedCourts ?? []) || !Array.isArray(body.slots ?? [])) return jsonError("Invalid monitoring result", 400);
    if ((body.slots?.length ?? 0) > 5000) return jsonError("Send complete results for fewer courts per request", 413);
    const db = getTennisDb();
    const userId = await monitorUser(db, body.userId);
    if (!userId) return jsonError("Unknown monitoring account",404);
    if (userId !== OWNER_ID && body.bookingUpdates?.length) return jsonError("Booking assistance is available only for the private owner account",403);
    await ensureDefaultSettings(db,userId);
    const settings = await db.prepare("SELECT * FROM watch_settings WHERE user_id=?").bind(userId).first();
    const selected = selectedCourtKeys(settings?.selected_court_keys);
    const checked = [...new Set(body.checkedCourts ?? [])].filter(key => selected.includes(key));
    const slots = body.slots ?? [];
    const accepted = [];
    for (const item of slots) {
      const courtKey = typeof item?.courtKey === "string" ? item.courtKey : "";
      if (!checked.includes(courtKey)) continue;
      const { slotDate, startTime, endTime, sourceUrl } = item;
      if (!isIsoDate(slotDate) || typeof startTime !== "string" || typeof endTime !== "string"
        || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)
        || startTime >= endTime || typeof sourceUrl !== "string" || !sourceUrl.startsWith("https://")) return jsonError("Invalid slot in complete court result", 400);
      if (slotMatchesSettings({ court_key:courtKey, slot_date:slotDate, start_time:startTime, end_time:endTime }, settings)) accepted.push(item);
    }

    const current = await db.prepare("SELECT court_key,slot_date,start_time,end_time,reservation_type FROM availability_slots WHERE user_id=? AND status IN ('available','lottery_open')").bind(userId).all();
    const previous = new Set(current.results.map(slot => [slot.court_key,slot.slot_date,slot.start_time,slot.end_time,slot.reservation_type].join("|")));
    const fresh = accepted.filter(slot => !previous.has([slot.courtKey,slot.slotDate,slot.startTime,slot.endTime,slot.reservationType === "lottery" ? "lottery" : "first_come"].join("|")));
    const writes = [];
    for (const courtKey of checked) {
      writes.push(db.prepare(`UPDATE availability_slots SET status='expired'
        WHERE user_id=? AND court_key=? AND status IN ('available','lottery_open')`)
        .bind(userId, courtKey));
    }

    for (const item of accepted) {
      const courtKey = typeof item.courtKey === "string" ? item.courtKey : "";
      const slotDate = item.slotDate;
      const startTime = typeof item.startTime === "string" ? item.startTime : "";
      const endTime = typeof item.endTime === "string" ? item.endTime : "";
      const reservationType = item.reservationType === "lottery" ? "lottery" : "first_come";
      const sourceUrl = typeof item.sourceUrl === "string" ? item.sourceUrl : "";
      if (!courtByKey.has(courtKey) || !isIsoDate(slotDate) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || !sourceUrl.startsWith("https://")) continue;
      const natural = `${userId === OWNER_ID ? "" : userId + ":"}${courtKey}:${slotDate}:${startTime}:${endTime}`;
      writes.push(db.prepare(`INSERT INTO availability_slots
        (id,user_id,court_key,court_name,slot_date,start_time,end_time,reservation_type,status,source_url,price_text,detected_at,last_seen_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,court_key,slot_date,start_time,end_time) DO UPDATE SET
        reservation_type=excluded.reservation_type,status=excluded.status,source_url=excluded.source_url,
        price_text=excluded.price_text,last_seen_at=CURRENT_TIMESTAMP`)
        .bind(natural, userId, courtKey, courtByKey.get(courtKey)!.name, slotDate, startTime, endTime,
          reservationType, reservationType === "lottery" ? "lottery_open" : "available", sourceUrl,
          typeof item.priceText === "string" ? item.priceText : null));
    }

    const now = new Date().toISOString();
    for (const courtKey of checked) {
      writes.push(db.prepare(`INSERT INTO monitor_runs(user_id,court_key,status,checked_at,message) VALUES(?,?, 'ok', ?, ?)
        ON CONFLICT(user_id,court_key) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at,message=excluded.message`)
        .bind(userId, courtKey, now, body.runMessage ?? "已完成检查"));
    }

    if (settings?.active === 1 && fresh.length) {
      const email = await slotEmailStatement(db,userId,fresh);
      if (email) writes.push(email);
    }
    if (writes.length) await db.batch(writes);
    const emailResult = await sendQueuedEmails(db,userId);

    for (const update of (body.bookingUpdates ?? []).slice(0, 20)) {
      const requestId = typeof update.requestId === "string" ? update.requestId : "";
      const status = typeof update.status === "string" ? update.status : "";
      if (!requestId || !["processing","booked","failed","needs_action"].includes(status)) continue;
      const cleanText = (value: unknown, max: number) => typeof value === "string" && value.trim()
        ? value.trim().slice(0, max) : null;
      const verificationStatus = ["pending","verifying","verified","needs_action","not_found","conflict"]
        .includes(String(update.verificationStatus)) ? String(update.verificationStatus) : null;
      const officialVerified = update.officialVerified === true ? 1 : update.officialVerified === false ? 0 : null;
      const sourceUrl = typeof update.officialSourceUrl === "string" && update.officialSourceUrl.startsWith("https://")
        ? update.officialSourceUrl.slice(0, 500) : null;
      const checkedSignal = verificationStatus ?? cleanText(update.officialStatus, 160);
      await db.prepare(`UPDATE booking_requests SET
          status=?, status_message=COALESCE(?,status_message),
          confirmation_number=COALESCE(?,confirmation_number),
          official_status=COALESCE(?,official_status),
          booked_at=COALESCE(?,booked_at,CASE WHEN ?='booked' THEN CURRENT_TIMESTAMP END),
          official_checked_at=CASE WHEN ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE official_checked_at END,
          official_verified=COALESCE(?,official_verified),
          official_source_url=COALESCE(?,official_source_url),
          booking_details=COALESCE(?,booking_details),
          verification_status=COALESCE(?,verification_status),
          verification_message=COALESCE(?,verification_message),
          updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND user_id=?`).bind(
          status,
          cleanText(update.message, 500),
          cleanText(update.confirmationNumber, 120),
          cleanText(update.officialStatus, 160),
          cleanText(update.bookedAt, 40), status,
          checkedSignal,
          officialVerified,
          sourceUrl,
          cleanText(update.bookingDetails, 4000),
          verificationStatus,
          cleanText(update.verificationMessage, 500),
          requestId, userId,
        ).run();
    }

    return Response.json({ ok: true, checkedCourts: checked.length, acceptedSlots: accepted.length, emailsSent:emailResult.sent }, {headers:{"cache-control":"private, no-store"}});
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "写入失败", 500);
  }
}
