import { runtimeEnv, type RuntimeEnv } from "../db/tennis";
import type { Account } from "./accounts";
import { courtByKey } from "./courts";

type Notice = { id:string; user_id:string; event_key:string; recipient:string; subject:string; body:string; attempts:number; created_at:string };

export async function enqueueEmail(db: D1Database, account: Account, eventKey: string, subject: string, body: string) {
  if (!account.email || !account.email_verified) return;
  await db.prepare(`INSERT INTO email_notifications(id,user_id,event_key,recipient,subject,body)
    VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,event_key) DO NOTHING`)
    .bind(crypto.randomUUID(), account.id, eventKey, account.email, subject, body).run();
}

export async function slotEmailStatement(db: D1Database, userId: string, slots: Array<Record<string, unknown>>) {
  const origin = runtimeEnv().SITE_ORIGIN || "http://localhost:3000";
  const account = await db.prepare("SELECT * FROM app_users WHERE id=? AND notification_channel='email' AND email_verified=1").bind(userId).first<Account>();
  if (!account?.email || !slots.length) return null;
  const identities = slots.map(slot => [slot.courtKey,slot.slotDate,slot.startTime,slot.endTime,slot.reservationType].join(":" )).sort();
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(identities)));
  const eventKey = `slots:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,"0")).join("")}`;
  const lines = slots.slice(0,100).map(slot => {
    const court = courtByKey.get(String(slot.courtKey));
    const type = slot.reservationType === "lottery" ? "抽选开放" : "可预约空位";
    return `${court?.name ?? "网球场"}｜${slot.slotDate} ${slot.startTime}–${slot.endTime}｜${type}`;
  });
  const body = `你关注的场地出现了 ${slots.length} 个新时段（日本时间）。\n\n${lines.join("\n")}\n${slots.length > 100 ? "其余时段请在监控面板查看。\n" : ""}\n查看你的监控面板和官方预约入口：${origin}\n\n空位可能变化，请以官网当前状态为准。此邮件不会自动提交预约。\n管理或关闭邮件提醒：${origin}/#account`;
  return db.prepare(`INSERT INTO email_notifications(id,user_id,event_key,recipient,subject,body)
    VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,event_key) DO NOTHING`)
    .bind(crypto.randomUUID(), userId, eventKey, account.email, `Minato Court｜发现 ${slots.length} 个新时段`, body);
}

export async function sendQueuedEmails(db: D1Database, userId: string, config: RuntimeEnv = runtimeEnv(), transport: typeof fetch = fetch) {
  if (!config.RESEND_API_KEY || !config.RESEND_FROM_EMAIL) return { sent:0, pending:true };
  const now = Math.floor(Date.now() / 1000);
  const account = await db.prepare("SELECT * FROM app_users WHERE id=?").bind(userId).first<Account>();
  const notices = await db.prepare(`SELECT * FROM email_notifications WHERE user_id=?
    AND status IN ('pending','retry','sending') AND available_at<=? AND attempts<5 ORDER BY created_at LIMIT 5`)
    .bind(userId, now).all<Notice>();
  let sent = 0;
  for (const notice of notices.results) {
    const isTest = notice.event_key.startsWith("test:");
    if (!account?.email_verified || account.email !== notice.recipient || (!isTest && account.notification_channel !== "email")) {
      await db.prepare("UPDATE email_notifications SET status='cancelled' WHERE id=? AND user_id=?").bind(notice.id, userId).run();
      continue;
    }
    // Provider idempotency is retained for 24h; avoid ambiguous retries beyond it.
    if (Date.now() - Date.parse(notice.created_at.replace(" ", "T") + "Z") > 23 * 3600000) {
      await db.prepare("UPDATE email_notifications SET status='failed',last_error='发送已超时，请检查邮件服务记录' WHERE id=? AND user_id=?").bind(notice.id,userId).run();
      continue;
    }
    const claimed = await db.prepare(`UPDATE email_notifications SET status='sending',attempts=attempts+1,available_at=?
      WHERE id=? AND user_id=? AND status IN ('pending','retry','sending') AND available_at<=? AND attempts<5 RETURNING id`)
      .bind(now + 120, notice.id, userId, now).first();
    if (!claimed) continue;
    try {
      const response = await transport("https://api.resend.com/emails", { method:"POST",
        headers:{ authorization:`Bearer ${config.RESEND_API_KEY}`, "content-type":"application/json", "idempotency-key":notice.id },
        body:JSON.stringify({ from:config.RESEND_FROM_EMAIL, to:[notice.recipient], subject:notice.subject, text:notice.body }),
        signal:AbortSignal.timeout(15000) });
      if (!response.ok) {
        const retry = response.status === 429 || response.status >= 500 || response.status === 409;
        await db.prepare("UPDATE email_notifications SET status=?,last_error=?,available_at=? WHERE id=? AND user_id=?")
          .bind(retry && notice.attempts < 4 ? "retry" : "failed", `邮件服务暂未接受请求（${response.status}）`, now + Math.min(3600, 60 * 2 ** notice.attempts), notice.id, userId).run();
        continue;
      }
      const result = await response.json() as { id?: string };
      if (!result.id) throw new Error("No receipt");
      await db.prepare("UPDATE email_notifications SET status='sent',provider_id=?,sent_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=? AND user_id=?")
        .bind(result.id, notice.id, userId).run();
      sent++;
    } catch {
      await db.prepare("UPDATE email_notifications SET status=?,last_error='发送暂未确认，将按原编号重试',available_at=? WHERE id=? AND user_id=?")
        .bind(notice.attempts < 4 ? "retry" : "failed", now + 300, notice.id, userId).run();
    }
  }
  return { sent, pending:false };
}
