import { getTennisDb, runtimeEnv } from "../db/tennis";
import { publicAccount, resolveAccount, type Account, type VerifiedIdentity } from "./accounts";
import { admitAccount, canAccessAccount, invitationRequired } from "./invitations";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) { super(message); this.status = status; }
}
export type AuthContext = { account: Account; cookieHeaders: string[]; accessToken?: string };
type ProviderUser = { id: string; email?: string; phone?: string; email_confirmed_at?: string; phone_confirmed_at?: string };
type ProviderSession = { access_token: string; refresh_token: string; expires_in?: number; user?: ProviderUser };
const siteOrigin = "https://minato-court.example";

export function authCapabilities() {
  const env = runtimeEnv();
  const configured = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
  return { inviteOnly:invitationRequired(), emailLogin:configured, phoneLogin:configured && !invitationRequired() && env.PHONE_LOGIN_ENABLED === "true",
    emailDelivery:Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) };
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const expected = runtimeEnv().SITE_ORIGIN || siteOrigin;
  const local = ["localhost", "127.0.0.1"].includes(url.hostname) && origin === url.origin;
  if (origin !== expected && !local) throw new AuthError("请求来源无效", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AuthError("请求格式无效", 415);
}

function cookieValue(request: Request, name: string) {
  const part = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : "";
}

export function sessionCookies(request: Request, session?: ProviderSession): string[] {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const options = `; Path=/; HttpOnly; SameSite=Lax${secure}`;
  return [
    `mc_access=${session?.access_token ?? ""}; Max-Age=${session ? Math.min(session.expires_in ?? 3600, 86400) : 0}${options}`,
    `mc_refresh=${session?.refresh_token ?? ""}; Max-Age=${session ? 2592000 : 0}${options}`,
  ];
}

export async function providerRequest(path: string, method = "GET", body?: unknown, token?: string) {
  const env = runtimeEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new AuthError("验证码登录尚未开通", 503);
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== "https:") throw new AuthError("登录服务配置无效", 503);
  return fetch(`${url.origin}/auth/v1${path}`, { method, cache:"no-store",
    headers:{ apikey:env.SUPABASE_ANON_KEY, authorization:`Bearer ${token || env.SUPABASE_ANON_KEY}`, "content-type":"application/json" },
    body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(15000) });
}

function providerIdentity(user: ProviderUser): VerifiedIdentity {
  if (!user.id || (!user.email_confirmed_at && !user.phone_confirmed_at)) throw new AuthError("请先完成邮箱或手机验证");
  return { provider:"supabase", id:user.id, email:user.email || null, phone:user.phone || null, emailVerified:Boolean(user.email && user.email_confirmed_at) };
}

export async function authContext(request: Request): Promise<AuthContext> {
  const db = getTennisDb();
  let accessToken = cookieValue(request, "mc_access");
  const refresh = cookieValue(request, "mc_refresh");
  const cookieHeaders: string[] = [];
  if (accessToken || refresh) {
    let response = accessToken ? await providerRequest("/user", "GET", undefined, accessToken) : null;
    if ((!response || response.status === 401 || response.status === 403) && refresh) {
      const renewed = await providerRequest("/token?grant_type=refresh_token", "POST", { refresh_token:refresh });
      if (!renewed.ok) throw new AuthError("登录已过期，请重新登录");
      const session = await renewed.json() as ProviderSession;
      accessToken = session.access_token;
      cookieHeaders.push(...sessionCookies(request, session));
      response = await providerRequest("/user", "GET", undefined, accessToken);
    }
    if (!response?.ok) throw new AuthError("登录已过期，请重新登录");
    const identity = providerIdentity(await response.json() as ProviderUser);
    const account = await resolveAccount(db, identity);
    if (!await canAccessAccount(db,account.id)) throw new AuthError("请使用有效邀请码加入，或联系站点所有者恢复访问",403);
    return { account, cookieHeaders, accessToken };
  }
  // These headers are authenticated and injected by the Sites dispatcher.
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!id || !email) throw new AuthError("请先登录");
  const identity: VerifiedIdentity = { provider:"chatgpt", id, email, phone:null, emailVerified:true };
  const account = await resolveAccount(db, identity, runtimeEnv().OWNER_BOOTSTRAP_EMAIL);
  if (!await canAccessAccount(db,account.id)) throw new AuthError("请使用邮箱和邀请码加入本站",403);
  return { account, cookieHeaders };
}

export async function acceptSession(request: Request, session: ProviderSession, expectedUserId?: string, invitationCode?:unknown, expectedEmail?:string) {
  if (!session.access_token || !session.refresh_token) throw new AuthError("验证码无效或已过期", 400);
  const verified = await providerRequest("/user", "GET", undefined, session.access_token);
  if (!verified.ok) throw new AuthError("登录验证失败");
  const identity = providerIdentity(await verified.json() as ProviderUser);
  if (expectedUserId && identity.id !== expectedUserId) throw new AuthError("邮箱不属于当前账户", 403);
  if (expectedEmail && identity.email?.toLowerCase() !== expectedEmail.toLowerCase()) throw new AuthError("邮箱不属于当前账户",403);
  const account = await resolveAccount(getTennisDb(), identity);
  if (!await admitAccount(getTennisDb(),account,invitationCode)) throw new AuthError("邀请码无效、已使用或已过期",403);
  return { account, cookieHeaders:sessionCookies(request, session), accessToken:session.access_token };
}

export function authJson(value: unknown, context?: Pick<AuthContext, "cookieHeaders">, status = 200) {
  const headers = new Headers({ "cache-control":"private, no-store", vary:"Cookie, oai-authenticated-user-id" });
  context?.cookieHeaders.forEach(cookie => headers.append("set-cookie", cookie));
  return Response.json(value, { status, headers });
}

export function authFailure(error: unknown, context?: Pick<AuthContext, "cookieHeaders">) {
  return authJson({ error:error instanceof AuthError ? error.message : "服务暂时不可用，请稍后重试", capabilities:authCapabilities() }, context, error instanceof AuthError ? error.status : 500);
}

export function accountView(context: AuthContext) { return publicAccount(context.account); }

export async function rateLimit(request: Request, action: string, identifier: string, maximum: number, seconds: number) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Math.floor(Date.now() / 1000);
  for (const source of [`${action}:identity:${identifier}`, `${action}:ip:${ip}`]) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    const key = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    const window = Math.floor(now / seconds) * seconds;
    const limit = source.includes(":ip:") ? maximum * 5 : maximum;
    const row = await getTennisDb().prepare(`INSERT INTO auth_rate_limits(key,window_start,attempts) VALUES(?,?,1)
      ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,
        attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END RETURNING attempts`)
      .bind(key, window).first<{ attempts:number }>();
    if ((row?.attempts ?? limit + 1) > limit) throw new AuthError("操作太频繁，请稍后重试", 429);
  }
  await getTennisDb().prepare("DELETE FROM auth_rate_limits WHERE window_start<?").bind(now - 86400).run();
}
