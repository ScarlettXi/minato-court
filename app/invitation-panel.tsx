"use client";
import { useEffect, useState } from "react";
import { formatDateTime, translate, type Language } from "./i18n";
import type { AuthCapabilities } from "./account-types";

type Invitation = {id:string;createdAt:string;expiresAt:number;status:"available"|"joined"|"expired"|"revoked"};
const labels = {available:"等待朋友加入",joined:"朋友已加入",expired:"邀请码已过期",revoked:"访问已撤销"};

export function InvitationPanel({capabilities,language}:{capabilities:AuthCapabilities;language:Language}) {
  const t = (text:string) => translate(language,text);
  const [invitations,setInvitations] = useState<Invitation[]>([]);
  const [newCode,setNewCode] = useState<{id:string;code:string;expiresAt:number}|null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const ready = capabilities.inviteOnly && capabilities.emailLogin;
  useEffect(() => {
    let mounted = true;
    void fetch("/api/invitations",{cache:"no-store"}).then(async response => {
      const result = await response.json() as {invitations?:Invitation[];error?:string};
      if (!response.ok) throw new Error(result.error ?? "读取失败");
      if (mounted) setInvitations(result.invitations ?? []);
    }).catch(() => {if(mounted)setMessage("无法读取邀请记录，请刷新重试");});
    return () => {mounted=false;};
  },[]);
  async function action(payload:Record<string,string>) {
    setBusy(true);setMessage("");
    try {
      const response = await fetch("/api/invitations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const result = await response.json() as {invitations?:Invitation[];invitation?:{id:string;code:string;expiresAt:number};error?:string};
      if(!response.ok)throw new Error(result.error ?? "操作失败");
      setInvitations(result.invitations ?? []);
      if(result.invitation)setNewCode(result.invitation);
      if(payload.action === "revoke") {if(newCode?.id === payload.id)setNewCode(null);setMessage("邀请已撤销，该邀请对应的访问已停止");}
    } catch(error){setMessage(error instanceof Error?error.message:"操作失败");}
    finally{setBusy(false);}
  }
  return <div className="invitation-panel">
    <h3>{t("邀请朋友")}</h3>
    <p className="account-note">{t("每个邀请码供一位朋友使用，7 天内有效。朋友验证自己的邮箱后即可加入，无需 ChatGPT 账户。")}</p>
    {!ready && <p className="account-note service-pending">{t("先接通邮箱验证码服务，再生成并分享邀请码。")}</p>}
    <button className="account-primary" disabled={busy || !ready} onClick={() => void action({action:"create"})}>{t("生成一位朋友的邀请码")}</button>
    {newCode && <div className="invitation-code"><label>{t("新邀请码（仅本次显示，请保存）")}<input readOnly value={newCode.code} onFocus={event=>event.target.select()} /></label><p className="account-note">{t("将登录网址和邀请码私下发给这位朋友，请勿公开发布。")}</p><a href="/login">{t("朋友登录入口")}</a><p className="account-note">{t("有效期至")} {formatDateTime(language,new Date(newCode.expiresAt*1000).toISOString())}</p></div>}
    {!!invitations.length && <ul className="invitation-list">{invitations.map(invitation=><li key={invitation.id}><div><strong>{t(labels[invitation.status])}</strong><small>{formatDateTime(language,invitation.createdAt)}</small></div>{["available","joined"].includes(invitation.status) && <button className="account-secondary" disabled={busy} onClick={() => void action({action:"revoke",id:invitation.id})}>{t("撤销访问")}</button>}</li>)}</ul>}
    {message && <p className="account-note" role="status">{t(message)}</p>}
  </div>;
}
