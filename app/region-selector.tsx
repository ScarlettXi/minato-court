"use client";

import { useState } from "react";
import { courtCatalog, regions, toggleCourtKeys } from "../lib/courts";
import { translate, type Language } from "./i18n";

type Props = {
  language: Language;
  selected: string[];
  disabled: boolean;
  dirty: boolean;
  onChange: (keys: string[]) => void;
  onSave: () => void;
  onReset: () => void;
};

export function RegionSelector({ language, selected, disabled, dirty, onChange, onSave, onReset }: Props) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const t = (source: string, values?: Record<string, string>) => translate(language, source, values);
  return <section id="monitor-preferences" className="region-selector" aria-labelledby="region-title">
    <div className="region-title-row"><h2 id="region-title">{t("监控区域")}</h2><span>{t("已选 {count}", { count:String(selected.length) })}</span></div>
    <p className="region-help">{t("勾选整区，或展开选择场地")}</p>
    <div className="region-bulk"><button disabled={disabled} onClick={() => onChange(courtCatalog.map(court => court.key))}>{t("全选")}</button><button disabled={disabled} onClick={() => onChange([])}>{t("清空选择")}</button></div>
    <div className="region-list">
      <div className="region-group">
        <h3>{t("东京23区内")}</h3>
        {regions.map(region => {
          const courts = courtCatalog.filter(court => court.regionKey === region.key);
          const count = courts.filter(court => selected.includes(court.key)).length;
          const isExpanded = expanded.includes(region.key);
          const mixed = count > 0 && count < courts.length;
          return <div className={`region-item ${count ? "has-selection" : ""}`} key={region.key}>
            <div className="region-row">
              <label><input type="checkbox" checked={count === courts.length} aria-checked={mixed ? "mixed" : count === courts.length} ref={input => { if (input) input.indeterminate = mixed; }} disabled={disabled} onChange={event => onChange(toggleCourtKeys(selected, courts.map(court => court.key), event.target.checked))} /><span>{t(region.name)}</span></label>
              <button className="region-expand" aria-label={t("展开或收起{region}场地", { region:t(region.name) })} aria-expanded={isExpanded} aria-controls={`region-${region.key}`} onClick={() => setExpanded(current => current.includes(region.key) ? current.filter(key => key !== region.key) : [...current, region.key])}><span>{count}/{courts.length}</span><span aria-hidden="true">{isExpanded ? "−" : "+"}</span></button>
            </div>
            <div id={`region-${region.key}`} hidden={!isExpanded} className="region-courts">
              {courts.map(court => <label key={court.key}><input type="checkbox" checked={selected.includes(court.key)} disabled={disabled} onChange={event => onChange(toggleCourtKeys(selected, [court.key], event.target.checked))} /><span>{t(court.name)}{court.system === "minato" && <small>{t("港区区立")}</small>}</span></label>)}
            </div>
          </div>;
        })}
      </div>
    </div>
    <div className="region-save">
      <p role="status">{t(!selected.length ? "请至少选择一个场地" : dirty ? "有未保存的更改" : "选择已保存")}</p>
      <button className="save-regions-button" disabled={disabled || !dirty || !selected.length} onClick={onSave}>{t(disabled ? "保存中…" : "保存并持续监控")}</button>
      {dirty && <button className="reset-regions-button" disabled={disabled} onClick={onReset}>{t("撤销更改")}</button>}
    </div>
  </section>;
}
