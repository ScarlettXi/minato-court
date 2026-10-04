"use client";

import { useState } from "react";
import { validCourtTimeRange, type CourtTimeRange } from "../lib/courts";
import { translate, type Language } from "./i18n";

export function CourtTimeSettings({ courtKey, courtName, language, range, disabled, onSave }: {
  courtKey: string;
  courtName: string;
  language: Language;
  range: CourtTimeRange;
  disabled: boolean;
  onSave: (range: CourtTimeRange) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<CourtTimeRange | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const t = (text: string) => translate(language, text);
  const value = draft ?? range;
  const dirty = value.start !== range.start || value.end !== range.end;
  const valid = validCourtTimeRange(value);
  const helpId = `court-time-help-${courtKey}`;

  return <form className="court-time-settings" aria-label={`${courtName} · ${t("监控时段")}`} onSubmit={async event => {
    event.preventDefault();
    if (disabled || pending || !dirty || !valid) return;
    setPending(true);
    setFailed(false);
    try { if (await onSave(value)) setDraft(null); else setFailed(true); }
    finally { setPending(false); }
  }}>
    <div className="court-time-heading"><strong>{t("监控时段")}</strong><span>{t("每天 · 日本时间")}</span></div>
    <div className="court-time-inputs">
      <label><span>{t("开始时间")}</span><input type="time" required step="60" value={value.start} disabled={disabled || pending} aria-describedby={helpId} aria-invalid={!valid} onChange={event => setDraft({ ...value, start:event.target.value })} /></label>
      <label><span>{t("结束时间")}</span><input type="time" required step="60" value={value.end} disabled={disabled || pending} aria-describedby={helpId} aria-invalid={!valid} onChange={event => setDraft({ ...value, end:event.target.value })} /></label>
    </div>
    <p id={helpId} className={valid ? "court-time-help" : "court-time-help invalid"}>{t(valid ? "筛选与此时段有重叠的空位" : "请选择同一天内的有效时间，结束时间须晚于开始时间")}</p>
    <div className="court-time-actions">
      <span role="status">{t(pending ? "保存中…" : failed ? "保存失败，请重试" : dirty ? "修改未保存" : "当前已保存")}</span>
      <button type="submit" disabled={disabled || pending || !dirty || !valid}>{t(pending ? "保存中…" : "保存时段")}</button>
    </div>
  </form>;
}
