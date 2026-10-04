import { catalogTranslations } from "../lib/courts";
import { authMessages } from "./auth-messages";

export type Language = "zh" | "en" | "ja";

export const locales: Record<Language, string> = { zh: "zh-CN", en: "en-US", ja: "ja-JP" };
export const languageStorageKey = "minato-court-language";
const languageEvent = "minato-court-language-change";
let sessionLanguage: Language | undefined;

export function isLanguage(value: unknown): value is Language {
  return value === "zh" || value === "en" || value === "ja";
}

export function readLanguage(): Language {
  if (sessionLanguage) return sessionLanguage;
  try {
    const saved = window.localStorage.getItem(languageStorageKey);
    return isLanguage(saved) ? saved : "zh";
  } catch { return "zh"; }
}

export function serverLanguage(): Language { return "zh"; }

export function subscribeLanguage(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== languageStorageKey && event.key !== null) return;
    sessionLanguage = undefined;
    callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(languageEvent, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(languageEvent, callback);
  };
}

export function saveLanguage(language: Language) {
  sessionLanguage = language;
  try { window.localStorage.setItem(languageStorageKey, language); } catch { /* Keep this session's selection when storage is unavailable. */ }
  window.dispatchEvent(new Event(languageEvent));
}

const messages: Record<string, { en: string; ja: string }> = {
  "监控已暂停": {en:"Monitoring paused",ja:"監視は一時停止中"},
  "官方验证待处理": {en:"Official verification required",ja:"公式サイトでの認証が必要"},
  "部分数据待重新确认": {en:"Some data needs rechecking",ja:"一部のデータは再確認が必要"},
  "部分检查失败，自动重试中": {en:"Some checks failed; retrying automatically",ja:"一部の確認に失敗・自動再試行中"},
  "最近扫描正常": {en:"Recent scan healthy",ja:"直近の確認は正常"},
  "数据已过期，等待重新扫描": {en:"Data stale; awaiting a fresh scan",ja:"データが古いため再確認待ち"},
  "连接异常，正在自动重试": {en:"Connection issue; retrying automatically",ja:"接続エラー・自動再試行中"},
  "临时故障自动恢复；认证、验证码与付款不自动处理。": {en:"Temporary failures are retried. Authentication, CAPTCHA and payment require you.",ja:"一時的な障害は自動再試行。認証・CAPTCHA・支払いは手動操作が必要です。"},
  "保留上次结果，当前数据尚未重新确认。": {en:"Previous results retained; current data is unconfirmed.",ja:"前回の結果を保持しています。現在の空き状況は未確認です。"},
  "通知送达尚未确认，请勿视为已送达。": {en:"Notification delivery has not been confirmed.",ja:"通知の配信はまだ確認できていません。"},
  "历史空位，需在官网重新确认": {en:"Previous opening; recheck on the official site",ja:"過去の空き情報・公式サイトで再確認してください"},
  "当前空位尚未确认": {en:"Current availability is unconfirmed",ja:"現在の空き状況は未確認"},
  ...catalogTranslations,
  ...authMessages,
  "监控时段": { en: "Monitoring hours", ja: "対象時間帯" },
  "每天 · 日本时间": { en: "Daily · Japan time", ja: "毎日・日本時間" },
  "开始时间": { en: "Start time", ja: "開始時刻" },
  "结束时间": { en: "End time", ja: "終了時刻" },
  "保存时段": { en: "Save hours", ja: "時間帯を保存" },
  "当前已保存": { en: "Saved", ja: "保存済み" },
  "修改未保存": { en: "Unsaved changes", ja: "未保存の変更" },
  "筛选与此时段有重叠的空位": { en: "Find slots that overlap these hours", ja: "この時間帯と重なる空き枠を表示" },
  "在各场地卡片中单独设置": { en: "Set hours on each court card", ja: "各コートのカードで個別に設定" },
  "此场地的监控时段已保存": { en: "Monitoring hours saved for this court", ja: "このコートの対象時間帯を保存しました" },
  "请选择有效场地": { en: "Choose a valid court", ja: "有効なコートを選択してください" },
  "请选择同一天内的有效时间，结束时间须晚于开始时间": { en: "Choose valid times on the same day, with the end after the start", ja: "同日内の有効な時刻を選び、終了は開始より後にしてください" },
  "保存失败，请重试": { en: "Save failed. Try again.", ja: "保存できませんでした。再度お試しください。" },
  "监控区域": { en: "Monitoring areas", ja: "対象エリア" },
  "已选 {count}": { en: "{count} selected", ja: "{count}件選択" },
  "勾选整区，或展开选择场地": { en: "Select an area or expand to choose courts", ja: "エリアを選択、または展開してコートを選択" },
  "全选": { en: "Select all", ja: "すべて選択" },
  "清空选择": { en: "Clear selection", ja: "選択をクリア" },
  "东京23区内": { en: "Tokyo wards", ja: "東京23区内" },
  "展开或收起{region}场地": { en: "Show or hide courts in {region}", ja: "{region}のコートを表示・非表示" },
  "港区区立": { en: "Minato municipal", ja: "港区立" },
  "请至少选择一个场地": { en: "Choose at least one court", ja: "コートを1つ以上選択してください" },
  "有未保存的更改": { en: "Unsaved changes", ja: "未保存の変更があります" },
  "选择已保存": { en: "Selection saved", ja: "選択を保存済み" },
  "保存监控范围": { en: "Save monitoring areas", ja: "対象エリアを保存" },
  "撤销更改": { en: "Discard changes", ja: "変更を元に戻す" },
  "监控范围已保存": { en: "Monitoring areas saved", ja: "対象エリアを保存しました" },
  "监控设置已启用": { en: "Monitoring preferences enabled", ja: "モニタリング設定は有効" },
  "已保存的监控场地": { en: "Saved monitoring courts", ja: "保存済みの対象コート" },
  "{regions} 个区域 · {courts} 个场地": { en: "{regions} areas · {courts} courts", ja: "{regions}エリア・{courts}施設" },
  "预览未保存的选择": { en: "Previewing unsaved selection", ja: "未保存の選択をプレビュー" },
  "已导入东京23区内 {venues} 个都立场馆、{options} 个网球预约选项": { en: "Tokyo wards: {venues} metropolitan venues · {options} tennis booking options", ja: "東京23区内の都立{venues}施設・テニス予約区分{options}件を登録" },
  "另保留麻布运动场": { en: "Azabu Sports Field also retained", ja: "麻布運動場も引き続き登録" },
  "按官方目录的区域归类": { en: "Areas follow the official directory", ja: "公式施設一覧の地域区分に準拠" },
  "目录核对：{date}": { en: "Directory checked: {date}", ja: "一覧確認日：{date}" },
  "官方场地目录 ↗": { en: "Official court directory ↗", ja: "公式施設一覧 ↗" },
  "从左侧区域栏选择想监控的场地": { en: "Choose courts from the area list", ja: "エリア一覧から対象コートを選択してください" },
  "都立 · 室内硬地": { en: "Metropolitan · Indoor hard", ja: "都立・屋内ハード" },
  "都立 · 硬地": { en: "Metropolitan · Hard", ja: "都立・ハード" },
  "都立 · 人工草地": { en: "Metropolitan · Artificial turf", ja: "都立・人工芝" },
  "实际开放时段以官网为准": { en: "Check official opening hours", ja: "利用可能時間は公式サイトをご確認ください" },
  "保存后加入监控": { en: "Save to add to monitoring", ja: "保存後に対象に追加" },
  "最近检查未发现空位": { en: "No openings at the last check", ja: "前回の確認では空きなし" },
  "尚未检查此场地": { en: "This court has not been checked yet", ja: "このコートはまだ確認されていません" },
  "请选择至少一个有效场地": { en: "Select at least one valid court", ja: "有効なコートを1つ以上選択してください" },
  "此场地或时段不在已保存的监控范围内": { en: "This court or slot is outside your saved preferences", ja: "このコートまたは時間枠は保存済み条件の対象外です" },
  "东京都网球场监控系统": { en: "Tokyo Tennis Court Monitor", ja: "東京都テニスコート空き状況モニター" },
  "私人网球场助手": { en: "Your tennis court assistant", ja: "テニスコート予約アシスタント" },
  "主导航": { en: "Main navigation", ja: "メインナビゲーション" },
  "监控总览": { en: "Overview", ja: "モニター概要" },
  "我的场地": { en: "My courts", ja: "登録コート" },
  "预约记录": { en: "Reservations", ja: "予約履歴" },
  "偏好设置": { en: "Preferences", ja: "設定" },
  "监控已开启": { en: "Monitoring active", ja: "モニタリング中" },
  "尚未启动监控": { en: "Monitoring inactive", ja: "モニタリング停止中" },
  "最近检查：{time}": { en: "Last checked: {time}", ja: "最終確認：{time}" },
  "选择并保存场地后持续监控": { en: "Save your selected courts to monitor continuously", ja: "コートを選択して保存すると継続的に監視します" },
  "持续监控 · 无结束日期": { en: "Continuous monitoring · No end date", ja: "継続監視・終了日なし" },
  "保存并持续监控": { en: "Save & monitor continuously", ja: "保存して継続監視" },
  "网球场预约助手": { en: "TENNIS RESERVATION CONCIERGE", ja: "テニスコート予約アシスタント" },
  "持续查看你指定的球场。有空位时通知你，只有在你确认后才会提交预约。": { en: "Monitor your selected courts and get notified of openings. Reservations are submitted only after your confirmation.", ja: "指定したコートの空き状況を確認し、空きがあればお知らせします。予約はあなたの確認後にのみ申し込みます。" },
  "刷新监控面板": { en: "Refresh dashboard", ja: "表示を更新" },
  "选择语言": { en: "Select language", ja: "言語を選択" },
  "关闭提示": { en: "Dismiss notification", ja: "通知を閉じる" },
  "监控状态": { en: "Monitoring status", ja: "モニタリング状況" },
  "监控中的场地": { en: "Courts monitored", ja: "モニタリング中の施設" },
  "范围 {start} 至 {end}": { en: "{start} to {end}", ja: "{start} ～ {end}" },
  "等待完成初始设置": { en: "Awaiting initial setup", ja: "初期設定待ち" },
  "可预约空位": { en: "Available slots", ja: "予約可能な枠" },
  "打开场地卡片即可确认": { en: "Choose a slot to confirm", ja: "コートの枠を選んで予約を確認" },
  "尚未发现符合条件的时段": { en: "No matching slots found yet", ja: "条件に合う空き枠はまだありません" },
  "待处理": { en: "Pending", ja: "対応待ち" },
  "只有你确认后才会进入队列": { en: "Queued only after you confirm", ja: "確認後にのみ予約処理を開始" },
  "已预约": { en: "Booked", ja: "予約済み" },
  "所有历史记录都会保留": { en: "Your reservation history is saved", ja: "すべての予約履歴を保存" },
  "目标时间": { en: "Preferred hours", ja: "希望時間" },
  "室外 17–21 · 有明全天": { en: "Outdoor 17–21 · Ariake all day", ja: "屋外17～21時・有明は終日" },
  "保存中…": { en: "Saving…", ja: "保存中…" },
  "开始监控": { en: "Start monitoring", ja: "モニタリング開始" },
  "关注场地": { en: "WATCHLIST", ja: "登録コート" },
  "我的监控场地": { en: "My monitored courts", ja: "モニタリング対象コート" },
  "确认后才预约": { en: "Book only after confirmation", ja: "確認後にのみ予約" },
  "都立 · 3 面": { en: "Metropolitan · 3 courts", ja: "都立・3面" },
  "都立 · 5 面": { en: "Metropolitan · 5 courts", ja: "都立・5面" },
  "离家最近的区立场": { en: "Nearest municipal courts", ja: "自宅に最も近い区立コート" },
  "室内 · 8 面": { en: "Indoor · 8 courts", ja: "屋内・8面" },
  "芝公园": { en: "Shiba Park", ja: "芝公園" },
  "日比谷公园": { en: "Hibiya Park", ja: "日比谷公園" },
  "麻布运动场": { en: "Azabu Sports Field", ja: "麻布運動場" },
  "有明网球之森": { en: "Ariake Tennis Park", ja: "有明テニスの森" },
  "港区": { en: "Minato", ja: "港区" },
  "千代田区": { en: "Chiyoda", ja: "千代田区" },
  "南麻布": { en: "Minami-Azabu", ja: "南麻布" },
  "江东区": { en: "Koto", ja: "江東区" },
  "都立公园预约系统": { en: "Tokyo parks booking system", ja: "都立公園予約システム" },
  "港区设施预约系统": { en: "Minato facility booking system", ja: "港区施設予約システム" },
  "東京都体育设施服务": { en: "Tokyo sports facility service", ja: "東京都スポーツ施設サービス" },
  "17–19 / 19–21 两个目标时段": { en: "Preferred slots: 17–19 / 19–21", ja: "希望枠：17～19時／19～21時" },
  "夜间照明人工草地场": { en: "Artificial turf with floodlights", ja: "夜間照明付き人工芝コート" },
  "港区在住个人登记后可预约": { en: "Book after registering as a Minato resident", ja: "港区在住の個人登録後に予約可能" },
  "营业时段内任意时间均可": { en: "Any time during opening hours", ja: "営業時間内ならいつでも可" },
  "打开{court}官方预约系统": { en: "Open the official booking system for {court}", ja: "{court}の公式予約システムを開く" },
  "目标时段": { en: "Preferred hours", ja: "希望時間帯" },
  "抽选": { en: "Lottery", ja: "抽選" },
  "先到先得": { en: "First come, first served", ja: "先着順" },
  "确认预约": { en: "Confirm booking", ja: "予約を確定" },
  "本轮未发现空位": { en: "No openings in the latest check", ja: "今回の確認では空きなし" },
  "等待首次扫描": { en: "Awaiting first check", ja: "初回確認待ち" },
  "开启监控后开始检查": { en: "Start monitoring to check", ja: "モニタリング開始後に確認" },
  "预约请求": { en: "RESERVATION REQUESTS", ja: "予約リクエスト" },
  "最近扫描：{time}": { en: "Last check: {time}", ja: "最終確認：{time}" },
  "尚未扫描": { en: "Not checked yet", ja: "未確認" },
  "抽选申请": { en: "Lottery application", ja: "抽選申し込み" },
  "先到先得预约": { en: "First-come reservation", ja: "先着順予約" },
  "预约／订单号": { en: "Reservation / order number", ja: "予約・注文番号" },
  "等待官方账户核对": { en: "Awaiting official account check", ja: "公式アカウントでの確認待ち" },
  "官方状态": { en: "Official status", ja: "公式予約状況" },
  "用户确认已预约": { en: "Booking reported by you", ja: "ユーザーが予約済みと報告" },
  "预约确认时间": { en: "Booking confirmation time", ja: "予約確認日時" },
  "最近官方核验": { en: "Last official verification", ja: "最終公式確認" },
  "预约信息": { en: "Booking details", ja: "予約内容" },
  "核验说明": { en: "Verification notes", ja: "確認メモ" },
  "查看官方预约系统 ↗": { en: "View official booking system ↗", ja: "公式予約システムを見る ↗" },
  "取消请求": { en: "Cancel request", ja: "リクエストを取り消す" },
  "还没有预约记录": { en: "No reservations yet", ja: "予約履歴はまだありません" },
  "发现空位后，点击“确认预约”才会出现在这里。": { en: "When a slot opens, select “Confirm booking” to add it here.", ja: "空き枠の「予約を確定」を選ぶと、ここに表示されます。" },
  "预约确认": { en: "BOOKING APPROVAL", ja: "予約確認" },
  "确认提交预约请求？": { en: "Submit this booking request?", ja: "予約リクエストを送信しますか？" },
  "参加抽选": { en: "Enter lottery", ja: "抽選に申し込む" },
  "点击后，预约助手才会登录官方系统尝试提交。若遇到验证码、付款或额外确认，会回来请你操作。": { en: "After you confirm, the assistant will try to book through the official system. If verification, payment or another confirmation is needed, you will be asked to complete it.", ja: "確認後、アシスタントが公式システムで予約を試みます。認証コード、支払い、追加確認が必要な場合は、あなたに操作をお願いします。" },
  "暂不预约": { en: "Not now", ja: "今は予約しない" },
  "等待执行": { en: "Awaiting processing", ja: "処理待ち" },
  "预约处理中": { en: "Booking in progress", ja: "予約処理中" },
  "预约失败": { en: "Booking failed", ja: "予約失敗" },
  "需要你操作": { en: "Action needed", ja: "操作が必要" },
  "已取消": { en: "Cancelled", ja: "取り消し済み" },
  "官方账户已核验": { en: "Verified in official account", ja: "公式アカウントで確認済み" },
  "等待官方核验": { en: "Awaiting official verification", ja: "公式確認待ち" },
  "正在核验": { en: "Verification in progress", ja: "確認中" },
  "需要重新登录": { en: "Sign in again", ja: "再ログインが必要" },
  "官方账户暂未找到": { en: "Not yet found in official account", ja: "公式アカウントではまだ見つかりません" },
  "信息不一致": { en: "Details do not match", ja: "情報が一致しません" },
  "待核对": { en: "To be verified", ja: "確認待ち" },
  "读取失败": { en: "Could not load data", ja: "データを読み込めませんでした" },
  "暂时无法读取监控数据": { en: "Monitoring data is temporarily unavailable", ja: "現在モニタリングデータを読み込めません" },
  "无法读取监控数据": { en: "Could not load monitoring data", ja: "モニタリングデータを読み込めませんでした" },
  "操作失败": { en: "Something went wrong. Please try again.", ja: "操作に失敗しました。もう一度お試しください。" },
  "监控设置已保存": { en: "Monitoring preferences saved", ja: "モニタリング設定を保存しました" },
  "已取消预约请求": { en: "Booking request cancelled", ja: "予約リクエストを取り消しました" },
  "预约请求已提交，助手会尽快处理": { en: "Booking request submitted. The assistant will process it shortly.", ja: "予約リクエストを送信しました。アシスタントが順次処理します。" },
  "请选择开始和结束日期": { en: "Select a start and end date", ja: "開始日と終了日を選択してください" },
  "结束日期必须晚于开始日期": { en: "The end date must be after the start date", ja: "終了日は開始日より後に設定してください" },
  "一次最多监控 93 天，请缩短日期范围": { en: "Choose a monitoring period of 93 days or less", ja: "対象期間は93日以内にしてください" },
  "缺少可预约时段": { en: "No booking slot selected", ja: "予約枠が選択されていません" },
  "该时段已不可预约，请刷新后重试": { en: "This slot is no longer available. Refresh and try again.", ja: "この枠は予約できなくなりました。更新して再度お試しください。" },
  "已收到你的确认，等待预约助手执行": { en: "Confirmation received. Waiting for the booking assistant.", ja: "確認を受け付けました。アシスタントの予約処理を待っています。" },
  "你已取消这次预约请求": { en: "You cancelled this booking request", ja: "この予約リクエストを取り消しました" },
  "未知操作": { en: "Unknown action", ja: "不明な操作です" },
};

export function translate(language: Language, source: unknown, values: Record<string, string> = {}): string {
  const text = String(source ?? "");
  const translated = language === "zh" ? text : messages[text]?.[language] ?? text;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export function formatDate(language: Language, value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(`${value}T12:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locales[language], {
    month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo",
  }).format(date);
}

export function formatDateTime(language: Language, value: unknown): string {
  if (typeof value !== "string" || !value) return translate(language, "待核对");
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locales[language], {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo", hour12: false,
  }).format(date);
}
