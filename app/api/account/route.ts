import { getTennisDb, runtimeEnv } from "../../../db/tennis";
import { publicAccount } from "../../../lib/accounts";
import { AuthError, authCapabilities, authContext, authFailure, authJson, rateLimit, requireSameOrigin, type AuthContext } from "../../../lib/auth";
import { enqueueEmail, sendQueuedEmails } from "../../../lib/notifications";

export async function POST(request: Request) {
  let context: AuthContext | undefined;
  try {
    requireSameOrigin(request);
    context = await authContext(request);
    const body = await request.json() as Record<string, unknown>;
    const db = getTennisDb();
    const account = context.account;
    if (body.action === "preferences") {
      const channel = String(body.channel);
      if (!["email","none", ...(account.id === "owner" ? ["push"] : [])].includes(channel)) throw new AuthError("提醒方式无效", 400);
      if (channel === "email" && (!account.email || !account.email_verified)) throw new AuthError("请先绑定并验证提醒邮箱", 400);
      await db.prepare("UPDATE app_users SET notification_channel=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(channel, account.id).run();
      return authJson({ account:publicAccount({ ...account, notification_channel:channel }) }, context);
    }
    if (body.action === "test_email") {
      if (!authCapabilities().emailDelivery) throw new AuthError("邮件发送服务尚未开通", 503);
      if (!account.email || !account.email_verified) throw new AuthError("请先绑定并验证提醒邮箱", 400);
      await rateLimit(request, "test-email", account.id, 1, 60);
      const event = `test:${crypto.randomUUID()}`;
      const origin = runtimeEnv().SITE_ORIGIN || "http://localhost:3000";
      await enqueueEmail(db, account, event, "Minato Court｜提醒邮件测试", `这是一封你主动请求的测试邮件。\n\n收到此邮件表示你的提醒邮箱可以接收 Minato Court 的邮件。\n你的监控条件和预约记录仅属于你的账户。\n\n${origin}/#account`);
      await sendQueuedEmails(db, account.id);
      const receipt = await db.prepare("SELECT status FROM email_notifications WHERE user_id=? AND event_key=?").bind(account.id, event).first<{status:string}>();
      if (receipt?.status !== "sent") throw new AuthError("测试邮件暂未发送成功，请稍后重试", 502);
      return authJson({ ok:true }, context);
    }
    throw new AuthError("未知操作", 400);
  } catch (error) { return authFailure(error, context); }
}
