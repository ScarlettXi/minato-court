import { acceptSession, accountView, AuthError, authCapabilities, authContext, authFailure, authJson, providerRequest, rateLimit, requireSameOrigin, sessionCookies, type AuthContext } from "../../../lib/auth";
import { getTennisDb } from "../../../db/tennis";
import { canRequestEmailCode } from "../../../lib/invitations";

export async function GET(request: Request) {
  try {
    const context = await authContext(request);
    return authJson({ account:accountView(context), capabilities:authCapabilities() }, context);
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) return authJson({ account:null, capabilities:authCapabilities() });
    return authFailure(error);
  }
}

function normalizeIdentifier(kind: unknown, input: unknown) {
  if (typeof input !== "string") throw new AuthError("请输入有效的邮箱或手机号", 400);
  const value = input.trim();
  if (kind === "email" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value.toLowerCase();
  if (kind === "phone" && /^\+[1-9]\d{7,14}$/.test(value)) return value;
  throw new AuthError("请输入有效的邮箱或含国家区号的手机号", 400);
}

export async function POST(request: Request) {
  let currentContext: AuthContext | undefined;
  try {
    requireSameOrigin(request);
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "logout") {
      let platform = false;
      try {
        const context = await authContext(request);
        platform = context.account.provider === "chatgpt";
        if (context.accessToken) await providerRequest("/logout?scope=local", "POST", undefined, context.accessToken);
      } catch { /* Expired sessions can always be cleared locally. */ }
      return authJson({ ok:true, redirect:platform ? "/signout-with-chatgpt?return_to=%2Flogin" : "/login" }, { cookieHeaders:sessionCookies(request) });
    }

    if (body.action === "bind_email" || body.action === "verify_email") {
      const context = await authContext(request);
      currentContext = context;
      if (!context.accessToken || context.account.provider !== "supabase") throw new AuthError("请使用当前登录邮箱接收提醒", 400);
      if (context.account.email_verified && context.account.email) throw new AuthError("此账户已绑定提醒邮箱", 400);
      const email = normalizeIdentifier("email", body.email);
      if (body.action === "bind_email") {
        await rateLimit(request, "bind-email", context.account.id, 1, 60);
        const response = await providerRequest("/user", "PUT", { email }, context.accessToken);
        if (!response.ok) throw new AuthError("无法发送邮箱验证码，请稍后重试", 400);
        return authJson({ ok:true }, context);
      }
      if (typeof body.code !== "string" || !/^\d{6,10}$/.test(body.code)) throw new AuthError("请输入有效验证码", 400);
      await rateLimit(request, "verify-email", context.account.id, 10, 600);
      const response = await providerRequest("/verify", "POST", { type:"email_change", email, token:body.code });
      if (!response.ok) throw new AuthError("验证码无效或已过期", 400);
      const verified = await acceptSession(request, await response.json(), context.account.provider_user_id);
      return authJson({ ok:true, account:accountView(verified) }, verified);
    }

    if (!["send_code", "verify_code"].includes(String(body.action))) throw new AuthError("未知操作", 400);
    const capabilities = authCapabilities();
    if (body.kind === "phone" ? !capabilities.phoneLogin : !capabilities.emailLogin) throw new AuthError("验证码登录尚未开通", 503);
    const identifier = normalizeIdentifier(body.kind, body.identifier);
    const identity = body.kind === "phone" ? { phone:identifier } : { email:identifier };
    if (body.action === "send_code") {
      await rateLimit(request, "send-code", identifier, 1, 60);
      if (capabilities.inviteOnly && !await canRequestEmailCode(getTennisDb(),identifier,body.invitationCode)) throw new AuthError("首次使用需要有效邀请码；已加入的用户请使用原邮箱",403);
      const response = await providerRequest("/otp", "POST", { ...identity, create_user:true, ...(body.kind === "phone" ? { channel:"sms" } : {}) });
      if (!response.ok) throw new AuthError(response.status === 429 ? "操作太频繁，请稍后重试" : "验证码发送失败，请稍后重试", response.status === 429 ? 429 : 400);
      return authJson({ ok:true });
    }
    if (typeof body.code !== "string" || !/^\d{6,10}$/.test(body.code)) throw new AuthError("请输入有效验证码", 400);
    await rateLimit(request, "verify-code", identifier, 10, 600);
    const response = await providerRequest("/verify", "POST", { ...identity, type:body.kind === "phone" ? "sms" : "email", token:body.code });
    if (!response.ok) throw new AuthError("验证码无效或已过期", 400);
    const context = await acceptSession(request, await response.json(),undefined,body.invitationCode,body.kind === "email" ? identifier : undefined);
    return authJson({ account:accountView(context) }, context);
  } catch (error) { return authFailure(error, currentContext); }
}
