"use client";
import { useState } from "react";
import { formatDateTime, translate, type Language } from "./i18n";
import type { PublicAccount, AuthCapabilities } from "./account-types";
import type { NotificationStatus, NotificationReceipt } from "../lib/notification-status";
import { InvitationPanel } from "./invitation-panel";

const receiptLabels:Record<NotificationReceipt["status"],string> = {
  pending:"等待发送", sending:"正在提交发送", retry:"暂未确认，将重试", sent:"邮件服务已接收",
  failed:"发送失败", cancelled:"已取消发送", unknown:"发送状态未知",
};

export function AccountPanel({ account, capabilities, language, notifications, onNotifications, onAccount }: { account:PublicAccount; capabilities:AuthCapabilities; language:Language; notifications?:NotificationStatus; onNotifications:(status:NotificationStatus) => void; onAccount:(account:PublicAccount) => void }) {
  const t = (source:string) => translate(language,source);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [email,setEmail] = useState("");
  const [code,setCode] = useState("");
  const [emailSent,setEmailSent] = useState(false);
  async function action(path:string,payload:Record<string,unknown>,success:string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const result = await response.json() as { error?:string; account?:PublicAccount; notifications?:NotificationStatus; redirect?:string };
      if (result.notifications) onNotifications(result.notifications);
      if (!response.ok) throw new Error(result.error ?? "操作失败");
      if (result.account) onAccount(result.account);
      if (payload.action === "bind_email") setEmailSent(true);
      if (result.redirect) window.location.assign(result.redirect);
      setMessage(success);
    } catch(error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  }
  return <section className="account-panel" id="account">
    <div className="section-title"><div><p className="eyebrow">{t("我的账户")}</p><h2>{t("账户与提醒")}</h2></div><button className="account-secondary" disabled={busy} onClick={() => void action("/api/auth",{action:"logout"},"")}>{t("退出登录")}</button></div>
    <p className="account-identity">{account.email || account.phone} <span>{t("独立账户")}</span></p>
    <p className="account-note">{t("只有你能查看和更改自己的监控条件与记录。")}</p>
    <div className="account-controls">
      <label>{t("提醒方式")}<select value={account.notificationChannel} disabled={busy} onChange={event => void action("/api/account",{action:"preferences",channel:event.target.value},"提醒设置已保存")}>
        {account.isOwner && <option value="push">{t("保留原有推送")}</option>}<option value="email" disabled={!account.emailVerified || !capabilities.emailDelivery}>{t(capabilities.emailDelivery ? "邮件提醒" : "邮件提醒（待开通）")}</option><option value="none">{t("关闭提醒")}</option>
      </select></label>
      <div><span className="account-label">{t("提醒邮箱")}</span><strong>{account.emailVerified ? account.email : t("尚未绑定")}</strong><button className="account-secondary" disabled={busy || !account.emailVerified || !capabilities.emailDelivery} onClick={() => void action("/api/account",{action:"test_email"},"测试邮件已交给邮件服务，请查看收件箱")}>{t("发送测试邮件")}</button></div>
    </div>
    {account.isOwner && account.notificationChannel === "push" && <p className="account-note">{t("已保留你的原有推送设置，邮件提醒需单独开通。")}</p>}
    {!capabilities.emailDelivery && <p className="account-note service-pending">{t("邮件服务尚未开通，目前请在站内查看结果。")}</p>}
    {capabilities.emailDelivery && !account.emailVerified && <p className="account-note">{t("请先绑定并验证提醒邮箱")}</p>}
    {capabilities.emailDelivery && account.emailVerified && <p className="account-note">{t(account.notificationChannel === "email" ? "邮件提醒已开启，请确认测试邮件能收到。" : "测试邮件仅验证收件地址，开启邮件提醒后才会发送空位通知。")}</p>}
    {!account.emailVerified && account.provider === "supabase" && <form className="bind-email-form" onSubmit={event => { event.preventDefault(); void action("/api/auth",{action:emailSent ? "verify_email" : "bind_email",email,code},emailSent ? "提醒邮箱已验证" : "验证码已发送，请查看邮箱或短信"); }}>
      <label>{t("绑定提醒邮箱")}<input type="email" required value={email} disabled={busy || emailSent} onChange={event => setEmail(event.target.value)} /></label>
      {emailSent && <label>{t("验证码")}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g,""))} /></label>}
      <button className="account-primary" disabled={busy}>{t(emailSent ? "验证邮箱" : "发送验证码")}</button>
    </form>}
    <div className="notification-history"><h3>{t("最近邮件记录")}</h3><p className="account-note">{t("“邮件服务已接收”不代表已经进入收件箱；请同时检查垃圾邮件。")}</p>
      {notifications?.recent.length ? <ul>{notifications.recent.map((notice,index) => <li key={`${notice.createdAt}-${index}`}><div><strong>{t(notice.kind === "test" ? "测试邮件" : "空位提醒")}</strong><time>{formatDateTime(language,notice.acceptedAt ?? notice.createdAt)}</time></div><span data-status={notice.status}>{t(receiptLabels[notice.status])}</span></li>)}</ul> : <p className="account-note">{t("暂无邮件记录")}</p>}
    </div>
    {account.isOwner && <div className="account-readiness"><h3>{t("新用户服务状态")}</h3><p className="account-note"><a href="/login">{t("查看新用户登录入口")}</a></p><ul><li>{t(capabilities.emailLogin ? "邮箱登录已配置" : "邮箱登录待开通")}</li><li>{t(capabilities.phoneLogin ? "手机登录已配置" : "手机登录待开通")}</li><li>{t(capabilities.emailDelivery ? "邮件发送已配置" : "邮件发送服务尚未开通")}</li></ul></div>}
    {account.isOwner && <InvitationPanel capabilities={capabilities} language={language} />}
    {message && <p className="account-note" role="status">{t(message)}</p>}
  </section>;
}
