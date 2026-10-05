"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { courtFreshness, slotIsFresh, type MonitorHealth } from "../lib/monitor-health";
import { fetchDashboard } from "../lib/dashboard-fetch";
import { bookingUrl, catalogCheckedAt, courtByKey, courtCatalog, courtTimeRange, metropolitanOptionCount, metropolitanVenueCount, regions, selectedCourtKeys } from "../lib/courts";
import { RegionSelector } from "./region-selector";
import { CourtTimeSettings } from "./court-time-settings";
import { SetupGuide } from "./setup-guide";
import type { NotificationStatus } from "../lib/notification-status";
import { AccountPanel } from "./account-panel";
import { LoginPanel } from "./login-panel";
import { unavailableAuth, type PublicAccount, type AuthCapabilities } from "./account-types";
import { formatDate, formatDateTime, isLanguage, locales, readLanguage, saveLanguage, serverLanguage, subscribeLanguage, translate } from "./i18n";

type Row = Record<string, string | number | null>;
type Dashboard = { notifications?:NotificationStatus; settings: Row | null; slots: Row[]; requests: Row[]; runs: Row[]; health?:MonitorHealth | null; account:PublicAccount | null; capabilities:AuthCapabilities };
const emptyDashboard: Dashboard = { settings:null, slots:[], requests:[], runs:[], account:null, capabilities:unavailableAuth };


function statusCopy(status: unknown) {
  const map: Record<string, string> = { pending:"等待执行", processing:"预约处理中", booked:"已预约", failed:"预约失败", needs_action:"需要你操作", cancelled:"已取消" };
  return map[String(status)] ?? String(status ?? "");
}

function verificationCopy(status: unknown, verified: unknown) {
  if (Boolean(verified)) return "官方账户已核验";
  const map: Record<string, string> = {
    pending:"等待官方核验", verifying:"正在核验", verified:"官方账户已核验",
    needs_action:"需要重新登录", not_found:"官方账户暂未找到", conflict:"信息不一致",
  };
  return map[String(status)] ?? "等待官方核验";
}

export default function Home() {
  const language = useSyncExternalStore(subscribeLanguage, readLanguage, serverLanguage);
  const t = (source: unknown, values?: Record<string, string>) => translate(language, source, values);
  const friendlyDate = (value: unknown) => formatDate(language, value);
  const friendlyDateTime = (value: unknown) => formatDateTime(language, value);
  const [data, setData] = useState<Dashboard>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const loadingRequest = useRef(false);
  const [clock, setClock] = useState(() => Date.now());
  const [confirmSlot, setConfirmSlot] = useState<Row | null>(null);
  const [draftCourtKeys, setDraftCourtKeys] = useState<string[] | null>(null);

  useEffect(() => {
    document.documentElement.lang = locales[language];
    document.title = `Minato Court｜${translate(language, "东京都网球场监控系统")}`;
  }, [language]);

  const load = useCallback(async () => {
    if (loadingRequest.current) return;
    loadingRequest.current = true;
    try {
      const response = await fetchDashboard();
      const next = await response.json() as Dashboard & { error?: string };
      if (response.status === 401 || response.status === 403) { setData({ ...emptyDashboard, capabilities:next.capabilities ?? unavailableAuth }); if(response.status === 403) setMessage(next.error ?? "请先登录"); return; }
      if (!response.ok) throw new Error(next.error ?? "读取失败");
      setData(next);
      setConnectionError(false);
    } catch {
      setConnectionError(true);
    } finally { loadingRequest.current = false; setLoading(false); setClock(Date.now()); }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { setClock(Date.now()); if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  async function act(payload: Record<string, unknown>, success: string) {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/dashboard", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify(payload) });
      const next = await response.json() as Dashboard & { error?: string };
      if (response.status === 401 || response.status === 403) setData({ ...emptyDashboard, capabilities:next.capabilities ?? unavailableAuth });
      if (!response.ok) throw new Error(next.error ?? "操作失败");
      setData(next); setMessage(success);
      if (payload.action === "save_courts") setDraftCourtKeys(null);
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); return false; }
    finally { setSaving(false); }
  }

  const active = Boolean(data.settings?.active);
  const pendingCount = data.requests.filter((item) => ["pending","processing","needs_action"].includes(String(item.status))).length;
  const bookedCount = data.requests.filter((item) => item.status === "booked").length;
  const savedCourtKeys = selectedCourtKeys(data.settings?.selected_court_keys);
  const selectedKeys = draftCourtKeys ?? savedCourtKeys;
  const selectionDirty = JSON.stringify([...selectedKeys].sort()) !== JSON.stringify([...savedCourtKeys].sort());
  const courts = courtCatalog.filter(court => selectedKeys.includes(court.key));
  const regionCount = new Set(courts.map(court => court.regionKey)).size;
  const recordCourtName = (record: Row) => t(courtByKey.get(String(record.court_key))?.name ?? record.court_name);
  const freshness = (key: string) => courtFreshness(data.health, key, data.runs.find(run => run.court_key === key)?.checked_at, active, clock);
  const healthStates = savedCourtKeys.map(freshness);
  const healthLabel = !active ? "监控已暂停" : healthStates.includes("blocked") ? "官方验证待处理" : healthStates.some(state => state === "stale" || state === "unknown") ? "部分数据待重新确认" : healthStates.includes("partial") ? "部分检查失败，自动重试中" : "最近扫描正常";
  const courtHealthCopy: Record<string,string> = {healthy:"最近扫描正常",partial:"部分检查失败，自动重试中",blocked:"官方验证待处理",stale:"数据已过期，等待重新扫描",unknown:"尚未检查此场地",paused:"监控已暂停"};

  const latestRun = data.runs[0]?.checked_at ? friendlyDateTime(data.runs[0].checked_at) : t("尚未扫描");

  if (!data.account) return loading ? <main className="login-shell"><p role="status">{t("正在读取你的账户…")}</p></main>
    : <>{message && <div className="notice" role="status">{t(message)}</div>}<LoginPanel capabilities={data.capabilities} /></>;

  return (
    <main className="site-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">M</span><div><strong>MINATO COURT</strong><small>{t("私人网球场助手")}</small></div></div>
        <nav aria-label={t("主导航")}>
          <a className="nav-item active" href="#dashboard"><span>⌂</span>{t("监控总览")}</a>
          <a className="nav-item" href="#courts"><span>◎</span>{t("我的场地")}</a>
          {data.account.isOwner && <a className="nav-item" href="#requests"><span>✓</span>{t("预约记录")}</a>}
          <a className="nav-item" href="#account"><span>○</span>{t("账户与提醒")}</a>
        </nav>
        <RegionSelector language={language} selected={selectedKeys} disabled={loading || saving || !data.settings} dirty={selectionDirty} onChange={setDraftCourtKeys} onReset={() => setDraftCourtKeys(null)} onSave={() => void act({ action:"save_courts", courtKeys:selectedKeys }, "监控范围已保存")} />
        <div className="sidebar-note"><span className={`live-dot ${active ? "on" : ""}`} /><div><strong>{t(active ? "监控设置已启用" : "尚未启动监控")}</strong><p>{active ? t("最近检查：{time}", { time:latestRun }) : t("选择并保存场地后持续监控")}</p></div></div>
      </aside>

      <section className="content" id="dashboard">
        <header className="topbar">
          <div className="topbar-heading"><p className="eyebrow">{t("网球场预约助手")}</p><h1>{t("东京都网球场监控系统")}</h1><p className="intro">{t(data.account.isOwner ? "持续查看你指定的球场。有空位时通知你，只有在你确认后才会提交预约。" : "选择场地和时间，查看扫描结果，并在账户中设置空位提醒。预约请在官网完成。")}</p></div>
          <div className="top-actions">
            <button className="icon-button" aria-label={t("刷新监控面板")} onClick={() => void load()}>↻<span className={data.slots.length ? "notification-dot" : ""} /></button>
            <label className="language-picker" title={t("选择语言")}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></svg>
              <select aria-label={t("选择语言")} value={language} onChange={(event) => { if (isLanguage(event.target.value)) saveLanguage(event.target.value); }}>
                <option value="zh" lang="zh-CN">中文</option>
                <option value="en" lang="en">English</option>
                <option value="ja" lang="ja">日本語</option>
              </select>
              <svg className="language-chevron" aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 6 4 4 4-4" /></svg>
            </label>
          </div>
        </header>

        {message && <div className="notice" role="status"><span>{t(message)}</span><button onClick={() => setMessage("")} aria-label={t("关闭提示")}>×</button></div>}
        <div className="monitor-health" role="status"><strong>{t(connectionError ? "连接异常，正在自动重试" : healthLabel)}</strong><span>{t("临时故障自动恢复；认证、验证码与付款不自动处理。")}</span>{connectionError && <small>{t("保留上次结果，当前数据尚未重新确认。")}</small>}{["failed_or_unconfirmed","unknown"].includes(data.health?.telegramStatus ?? "") && <small>{t("通知送达尚未确认，请勿视为已送达。")}</small>}</div>

        {!data.account.isOwner && <SetupGuide account={data.account} capabilities={data.capabilities} language={language} hasCourts={savedCourtKeys.length > 0} active={active} scanned={healthStates.length > 0 && healthStates.every(state => state === "healthy")} />}
        <div className="monitor-controls"><p>{t(active ? "监控条件已保存，实际运行以扫描记录为准。" : "监控已暂停，重新启用后等待下一次扫描。")}</p><button className="account-secondary" disabled={saving || !savedCourtKeys.length} onClick={() => void act({action:"save_settings",active:!active}, active ? "监控已暂停" : "监控已启用，等待扫描")}>{t(active ? "暂停监控" : "启用监控")}</button></div>
        <section className={`status-grid${data.account.isOwner ? "" : " personal-status"}`} aria-label={t("监控状态")}>
          <article className="metric-card primary"><span>{t("已保存的监控场地")}</span><strong>{savedCourtKeys.length} <small>/ {courtCatalog.length}</small></strong><p>{t(active ? "持续监控 · 无结束日期" : "选择并保存场地后持续监控")}</p></article>
          <article className="metric-card"><span>{t("可预约空位")}</span><strong>{loading ? "…" : data.slots.length}</strong><p>{t(data.slots.length ? "打开场地卡片即可确认" : "尚未发现符合条件的时段")}</p></article>
          {data.account.isOwner && <><article className="metric-card"><span>{t("待处理")}</span><strong>{pendingCount}</strong><p>{t("只有你确认后才会进入队列")}</p></article>
          <article className="metric-card"><span>{t("已预约")}</span><strong>{bookedCount}</strong><p>{t("所有历史记录都会保留")}</p></article></>}
        </section>

        <section id="courts" className="courts-section">
          <div className="section-title"><div><p className="eyebrow">{t("关注场地")}</p><h2>{t("我的监控场地")}</h2><p className="selection-summary">{t("{regions} 个区域 · {courts} 个场地", { regions:String(regionCount), courts:String(courts.length) })}{selectionDirty && <span> · {t("预览未保存的选择")}</span>}</p></div><span className="privacy-pill">{t(data.account.isOwner ? "确认后才预约" : "前往官网预约")}</span></div>
          <p className="catalog-note">{t("已导入东京23区内 {venues} 个都立场馆、{options} 个网球预约选项", { venues:String(metropolitanVenueCount), options:String(metropolitanOptionCount) })}<br />{t("按官方目录的区域归类")} · {t("目录核对：{date}", { date:catalogCheckedAt })} · <a href="https://kouen.sports.metro.tokyo.lg.jp/web/" target="_blank" rel="noreferrer">{t("官方场地目录 ↗")}</a></p>
          {!courts.length && <div className="empty-selection">{t("从左侧区域栏选择想监控的场地")}</div>}
          <div className="court-grid">
            {courts.map((court) => {
              const slots = data.slots.filter(slot => slot.court_key === court.key);
              const isSaved = savedCourtKeys.includes(court.key);
              const region = regions.find(item => item.key === court.regionKey)!;
              const source = bookingUrl(court);
              const tag = court.system === "minato" ? "港区区立" : court.indoor ? "都立 · 室内硬地" : court.surface === "hard" ? "都立 · 硬地" : "都立 · 人工草地";
              const run = data.runs.find((item) => item.court_key === court.key);
              const healthState = freshness(court.key);
              const scanWindow = data.health?.perCourt[court.key]?.scanWindow;
              return <article className="court-card" key={court.key}>
                <div className={`court-visual ${court.indoor ? "violet" : court.surface === "hard" ? "blue" : "green"}`}><span className="court-tag">{t(tag)}</span><div className="court-lines" aria-hidden="true"><i /><b /></div><span className="area-label">{t(region.name)}</span></div>
                <div className="court-body">
                  <div className="court-heading"><div><h3>{t(court.name)}</h3><p lang="ja">{court.jp}</p></div><a href={source} target="_blank" rel="noreferrer" aria-label={t("打开{court}官方预约系统", { court:t(court.name) })}>↗</a></div>
                  <CourtTimeSettings courtKey={court.key} courtName={t(court.name)} language={language} range={courtTimeRange(data.settings, court.key)} disabled={loading || saving || !data.settings} onSave={range => act({ action:"save_court_time", courtKey:court.key, ...range }, "此场地的监控时段已保存")} />
                  <p className="court-rule">{t("实际开放时段以官网为准")}</p>
                  <p className={`court-health ${healthState}`}><span>{t(courtHealthCopy[healthState])}</span>{(data.health?.perCourt[court.key]?.lastSuccessAt || run?.checked_at) && <small>{t("最近检查：{time}", { time:friendlyDateTime(data.health?.perCourt[court.key]?.lastSuccessAt || run?.checked_at) })}</small>}</p>
                  {scanWindow && <p className="court-rule">{t("已检查日期：{start} 至 {end}（先到先得）", { start:scanWindow.startDate, end:scanWindow.endDate })}</p>}
                  <div className="slot-list">
                    {slots.length ? slots.slice(0, 3).map((slot) => <div className="slot" key={String(slot.id)}>
                      <div><strong>{friendlyDate(slot.slot_date)}</strong><span>{slot.start_time}–{slot.end_time} · {t(slot.reservation_type === "lottery" ? "抽选" : "先到先得")}</span>{!slotIsFresh(slot, data.health, healthState, clock) && <small>{t("历史空位，需在官网重新确认")}</small>}</div>
                      {slot.request_status ? <span className={`request-badge ${slot.request_status}`}>{t(statusCopy(slot.request_status))}</span> : data.account?.isOwner ? <button onClick={() => setConfirmSlot(slot)}>{t("确认预约")}</button> : <a className="slot-book-link" href={source} target="_blank" rel="noreferrer">{t("前往官网预约")}</a>}
                    </div>) : <div className="empty-slot"><span className={`pending-state ${healthState === "healthy" ? "checked" : ""}`}><i /> {t(!isSaved ? "保存后加入监控" : healthState === "healthy" ? "最近检查未发现空位" : "当前空位尚未确认")}</span><small>{run ? t("最近检查：{time}", { time:friendlyDateTime(run.checked_at) }) : t(court.system === "tokyo" ? "都立公园预约系统" : "港区设施预约系统")}</small></div>}
                  </div>
                </div>
              </article>;
            })}
          </div>
        </section>

        <AccountPanel account={data.account} capabilities={data.capabilities} language={language} notifications={data.notifications} onNotifications={notifications => setData(current => ({ ...current, notifications }))} onAccount={account => setData(current => ({ ...current, account }))} />

        {data.account.isOwner && <section className="requests-section" id="requests">
          <div className="section-title"><div><p className="eyebrow">{t("预约请求")}</p><h2>{t("预约记录")}</h2></div><span className="latest-check">{t("最近扫描：{time}", { time:latestRun })}</span></div>
          {data.requests.length ? <div className="request-table">
            {data.requests.map((request) => <article key={String(request.id)}>
              <div className="request-identity"><strong>{recordCourtName(request)}</strong><span>{friendlyDate(request.slot_date)} · {request.start_time}–{request.end_time}</span><small>{t(request.reservation_type === "lottery" ? "抽选申请" : "先到先得预约")}</small></div>
              <div className="request-message">
                <div className="request-status-row"><strong>{t(statusCopy(request.status))}</strong>{request.status === "booked" && <b className={`verification-badge ${request.official_verified ? "verified" : String(request.verification_status ?? "pending")}`}>{t(verificationCopy(request.verification_status, request.official_verified))}</b>}</div>
                <span>{t(request.status_message)}</span>
                {request.status === "booked" && <div className="booking-detail-grid">
                  <div><small>{t("预约／订单号")}</small><b>{request.confirmation_number || t("等待官方账户核对")}</b></div>
                  <div><small>{t("官方状态")}</small><b>{t(request.official_status || "用户确认已预约")}</b></div>
                  <div><small>{t("预约确认时间")}</small><b>{friendlyDateTime(request.booked_at || request.updated_at)}</b></div>
                  <div><small>{t("最近官方核验")}</small><b>{friendlyDateTime(request.official_checked_at)}</b></div>
                  {request.booking_details && <div className="booking-notes"><small>{t("预约信息")}</small><b>{request.booking_details}</b></div>}
                  {request.verification_message && <div className="booking-notes"><small>{t("核验说明")}</small><b>{t(request.verification_message)}</b></div>}
                </div>}
                {request.official_source_url && <a className="official-record-link" href={String(request.official_source_url)} target="_blank" rel="noreferrer">{t("查看官方预约系统 ↗")}</a>}
              </div>
              {request.status === "pending" && <button onClick={() => void act({ action:"cancel_request", requestId:request.id }, "已取消预约请求")}>{t("取消请求")}</button>}
            </article>)}
          </div> : <div className="empty-history"><span>✓</span><div><strong>{t("还没有预约记录")}</strong><p>{t("发现空位后，点击“确认预约”才会出现在这里。")}</p></div></div>}
        </section>}
      </section>

      {confirmSlot && <div className="modal-backdrop" role="presentation" onMouseDown={() => setConfirmSlot(null)}><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(e) => e.stopPropagation()}><span className="modal-kicker">{t("预约确认")}</span><h2 id="confirm-title">{t("确认提交预约请求？")}</h2><div className="confirm-summary"><strong>{recordCourtName(confirmSlot)}</strong><span>{friendlyDate(confirmSlot.slot_date)}</span><b>{confirmSlot.start_time} – {confirmSlot.end_time}</b><small>{t(confirmSlot.reservation_type === "lottery" ? "参加抽选" : "先到先得预约")}</small></div><p>{t("点击后，预约助手才会登录官方系统尝试提交。若遇到验证码、付款或额外确认，会回来请你操作。")}</p><div className="modal-actions"><button className="secondary" onClick={() => setConfirmSlot(null)}>{t("暂不预约")}</button><button className="primary" disabled={saving} onClick={async () => { const slot = confirmSlot; setConfirmSlot(null); await act({ action:"confirm_booking", slotId:slot.id }, "预约请求已提交，助手会尽快处理"); }}>{t("确认预约")}</button></div></section></div>}
    </main>
  );
}
