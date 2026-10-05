"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { isLanguage, readLanguage, saveLanguage, serverLanguage, subscribeLanguage, translate } from "./i18n";
import { unavailableAuth, type AuthCapabilities } from "./account-types";

export function LoginPanel({ capabilities: initialCapabilities }: { capabilities?: AuthCapabilities }) {
  const language = useSyncExternalStore(subscribeLanguage, readLanguage, serverLanguage);
  const t = (source: string) => translate(language, source);
  const [capabilities, setCapabilities] = useState(initialCapabilities ?? unavailableAuth);
  const [kind, setKind] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [invitationCode,setInvitationCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [remaining, setRemaining] = useState(0);
  const enabled = kind === "email" ? capabilities.emailLogin : capabilities.phoneLogin;
  useEffect(() => {
    if (!initialCapabilities) void fetch("/api/auth", {cache:"no-store"}).then(response => response.json() as Promise<{capabilities?:AuthCapabilities}>).then(result => { if (result.capabilities) setCapabilities(result.capabilities); }).catch(() => {});
  }, [initialCapabilities]);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining(value => Math.max(0,value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  async function submit(action: "send_code" | "verify_code") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,kind,identifier,code,invitationCode})});
      const result = await response.json() as { error?:string };
      if (!response.ok) throw new Error(result.error ?? "操作失败");
      if (action === "send_code") { setSent(true); setRemaining(60); setMessage("验证码已发送，请查看邮箱或短信"); }
      else window.location.assign("/");
    } catch(error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  }
  return <main className="login-shell"><section className="login-card">
    <div className="login-top"><strong>TOKYO COURT</strong><select aria-label={t("选择语言")} value={language} onChange={event => { if (isLanguage(event.target.value)) saveLanguage(event.target.value); }}><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option></select></div>
    <h1>{t("登录你的网球场监控台")}</h1><p>{t("你的场地、监控时段和提醒设置仅属于你的账户。")}</p>
    {!capabilities.inviteOnly && <><a className="platform-signin" href="/signin-with-chatgpt?return_to=%2F" target="_top">{t("使用现有 ChatGPT 账户进入")}</a><p className="account-note">{t("首次登录会建立独立账户。请使用网站已授权的账户进入。")}</p></>}
    {capabilities.inviteOnly ? <div className="invite-login-note"><strong>{t("朋友邀请内测")}</strong><p>{t("使用自己的邮箱接收验证码，无需 ChatGPT 账户。首次加入需要站点所有者提供的邀请码。")}</p><h2>{t("邮箱登录")}</h2></div> : <div className="login-methods"><button type="button" aria-pressed={kind === "email"} onClick={() => { setKind("email"); setIdentifier(""); setCode(""); setSent(false); setMessage(""); }}>{t("邮箱登录")}{!capabilities.emailLogin && <small>{t("暂未开放")}</small>}</button><button type="button" aria-pressed={kind === "phone"} onClick={() => { setKind("phone"); setIdentifier(""); setCode(""); setSent(false); setMessage(""); }}>{t("手机号登录")}{!capabilities.phoneLogin && <small>{t("暂未开放")}</small>}</button></div>}
    {!enabled && <p className="account-note">{t(kind === "email" ? "邮箱验证码登录尚未开放" : "手机验证码登录尚未开放")}</p>}
    {enabled && <form onSubmit={event => { event.preventDefault(); void submit(sent ? "verify_code" : "send_code"); }}>
      <label>{t(kind === "email" ? "邮箱地址" : "手机号（含国家区号）")}<input type={kind === "email" ? "email" : "tel"} autoComplete={kind === "email" ? "email" : "tel"} required value={identifier} disabled={busy || sent} placeholder={kind === "email" ? "you@example.com" : "+81…"} onChange={event => setIdentifier(event.target.value)} /></label>
      {capabilities.inviteOnly && <label>{t("邀请码（首次加入必填）")}<input autoComplete="off" spellCheck={false} maxLength={35} value={invitationCode} disabled={busy || sent} placeholder="MC-…" onChange={event => setInvitationCode(event.target.value.trim().toUpperCase())} /><span className="account-note">{t("已经加入？使用原邮箱登录，无需再次填写邀请码。")}</span></label>}
      {sent && <label>{t("验证码")}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} value={code} required disabled={busy} onChange={event => setCode(event.target.value.replace(/\D/g,""))} /></label>}
      <button className="account-primary" disabled={!enabled || busy}>{t(busy ? "处理中…" : sent ? "验证并登录" : "发送验证码")}</button>
      {sent && <div className="login-retry"><button type="button" disabled={busy || remaining > 0} onClick={() => void submit("send_code")}>{remaining > 0 ? `${remaining}s` : t("重新发送")}</button><button type="button" disabled={busy} onClick={() => { setSent(false); setCode(""); }}>{t("更改登录信息")}</button></div>}
    </form>}
    {message && <p className="account-note" role="status">{t(message)}</p>}
    {capabilities.inviteOnly && <a className="platform-signin owner-signin" href="/signin-with-chatgpt?return_to=%2F" target="_top">{t("站点所有者使用 ChatGPT 登录")}</a>}
    <div className="login-existing"><Link href="/" prefetch={false}>{t("返回我的监控台")}</Link></div>
  </section></main>;
}
