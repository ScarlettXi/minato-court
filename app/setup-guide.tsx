"use client";
import type { PublicAccount, AuthCapabilities } from "./account-types";
import { translate, type Language } from "./i18n";

export function SetupGuide({ account, capabilities, language, hasCourts, active, scanned }: {
  account:PublicAccount; capabilities:AuthCapabilities; language:Language;
  hasCourts:boolean; active:boolean; scanned:boolean;
}) {
  const t = (value:string) => translate(language,value);
  const remindersReady = capabilities.emailDelivery && account.emailVerified && account.notificationChannel === "email";
  return <section className="setup-guide" aria-labelledby="setup-title">
    <div><h2 id="setup-title">{t("开始使用你的监控台")}</h2><p>{t("完成以下设置，再确认首次扫描和测试邮件。")}</p></div>
    <ol>
      <li data-complete={hasCourts && active}><span>1</span><div><strong>{t("选择球场和时间")}</strong><p>{t(hasCourts ? active ? "场地已保存，可分别调整时间。" : "场地已保存，监控当前暂停。" : "选择关注的球场，保存后设置各场地时间。")}</p><a href="#monitor-preferences">{t("设置监控场地")}</a></div></li>
      <li data-complete={remindersReady}><span>2</span><div><strong>{t("设置空位提醒")}</strong><p>{t(!capabilities.emailDelivery ? "邮件服务尚未开通，目前请在站内查看结果。" : remindersReady ? "邮件提醒已开启，请确认测试邮件能收到。" : "验证提醒邮箱，然后选择邮件提醒。")}</p><a href="#account">{t("账户与提醒")}</a></div></li>
      <li data-complete={scanned}><span>3</span><div><strong>{t("确认扫描结果")}</strong><p>{t(scanned ? "已收到近期成功扫描，空位仍以官网为准。" : active ? "等待首次或下一次成功扫描，当前结果尚未确认。" : "保存场地并启用监控后，等待成功扫描。")}</p><a href="#courts">{t("查看场地状态")}</a></div></li>
    </ol>
  </section>;
}
