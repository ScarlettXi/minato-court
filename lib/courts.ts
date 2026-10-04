// Tokyo ward options verified against both tennis sport selectors and the official region directory.
// Evidence: data/official-tennis-catalog.json (2026-09-22).
export const catalogCheckedAt = "2026-09-22";
export const tokyoBookingUrl = "https://kouen.sports.metro.tokyo.lg.jp/web/";
export const defaultCourtKeys = ["shiba", "hibiya", "ariake_indoor"];
export type Court = { key: string; name: string; en: string; jp: string; regionKey: string; system: "tokyo" | "minato"; surface: "hard" | "turf"; indoor: boolean; officialParkId: string | null; sportValue: string | null };
export const regions = [
  {
    "key": "chiyoda",
    "name": "千代田区",
    "en": "Chiyoda",
    "jp": "千代田区",
    "group": "wards"
  },
  {
    "key": "minato",
    "name": "港区",
    "en": "Minato",
    "jp": "港区",
    "group": "wards"
  },
  {
    "key": "sumida",
    "name": "墨田区",
    "en": "Sumida",
    "jp": "墨田区",
    "group": "wards"
  },
  {
    "key": "koto",
    "name": "江东区",
    "en": "Koto",
    "jp": "江東区",
    "group": "wards"
  },
  {
    "key": "shinagawa",
    "name": "品川区",
    "en": "Shinagawa",
    "jp": "品川区",
    "group": "wards"
  },
  {
    "key": "setagaya",
    "name": "世田谷区",
    "en": "Setagaya",
    "jp": "世田谷区",
    "group": "wards"
  },
  {
    "key": "suginami",
    "name": "杉并区",
    "en": "Suginami",
    "jp": "杉並区",
    "group": "wards"
  },
  {
    "key": "arakawa",
    "name": "荒川区",
    "en": "Arakawa",
    "jp": "荒川区",
    "group": "wards"
  },
  {
    "key": "itabashi",
    "name": "板桥区",
    "en": "Itabashi",
    "jp": "板橋区",
    "group": "wards"
  },
  {
    "key": "nerima",
    "name": "练马区",
    "en": "Nerima",
    "jp": "練馬区",
    "group": "wards"
  },
  {
    "key": "adachi",
    "name": "足立区",
    "en": "Adachi",
    "jp": "足立区",
    "group": "wards"
  },
  {
    "key": "edogawa",
    "name": "江户川区",
    "en": "Edogawa",
    "jp": "江戸川区",
    "group": "wards"
  }
];
export const courtCatalog: Court[] = [
  {
    "key": "hibiya",
    "name": "日比谷公园",
    "en": "Hibiya Park",
    "jp": "日比谷公園",
    "regionKey": "chiyoda",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1000",
    "sportValue": "1000_1030"
  },
  {
    "key": "shiba",
    "name": "芝公园",
    "en": "Shiba Park",
    "jp": "芝公園",
    "regionKey": "minato",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1010",
    "sportValue": "1000_1030"
  },
  {
    "key": "higashi_shirahige",
    "name": "东白须公园",
    "en": "Higashi Shirahige Park",
    "jp": "東白鬚公園",
    "regionKey": "sumida",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1090",
    "sportValue": "1000_1030"
  },
  {
    "key": "sarue",
    "name": "猿江恩赐公园",
    "en": "Sarue Onshi Park",
    "jp": "猿江恩賜公園",
    "regionKey": "koto",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1040",
    "sportValue": "1000_1030"
  },
  {
    "key": "kameido",
    "name": "龟户中央公园",
    "en": "Kameido Chuo Park",
    "jp": "亀戸中央公園",
    "regionKey": "koto",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1050",
    "sportValue": "1000_1030"
  },
  {
    "key": "kiba",
    "name": "木场公园",
    "en": "Kiba Park",
    "jp": "木場公園",
    "regionKey": "koto",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1060",
    "sportValue": "1000_1030"
  },
  {
    "key": "ojima_komatsugawa",
    "name": "大岛小松川公园",
    "en": "Ojima Komatsugawa Park",
    "jp": "大島小松川公園",
    "regionKey": "koto",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1160",
    "sportValue": "1000_1030"
  },
  {
    "key": "ariake_outdoor_hard",
    "name": "有明网球之森 A · 室外硬地",
    "en": "Ariake A · Outdoor hard",
    "jp": "有明テニスＡ屋外ハードコート",
    "regionKey": "koto",
    "system": "tokyo",
    "surface": "hard",
    "indoor": false,
    "officialParkId": "1350",
    "sportValue": "1000_1020"
  },
  {
    "key": "ariake_outdoor_turf",
    "name": "有明网球之森 C · 人工草地",
    "en": "Ariake C · Artificial turf",
    "jp": "有明テニスＣ人工芝コート",
    "regionKey": "koto",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1360",
    "sportValue": "1000_1030"
  },
  {
    "key": "ariake_indoor",
    "name": "有明网球之森 B · 室内",
    "en": "Ariake B · Indoor",
    "jp": "有明テニスＢインドアコート",
    "regionKey": "koto",
    "system": "tokyo",
    "surface": "hard",
    "indoor": true,
    "officialParkId": "1370",
    "sportValue": "1000_1020"
  },
  {
    "key": "oi_a_hard",
    "name": "大井埠头海滨公园 A · 硬地",
    "en": "Oi Wharf Park A · Hard",
    "jp": "大井ふ頭海浜公園Ａ",
    "regionKey": "shinagawa",
    "system": "tokyo",
    "surface": "hard",
    "indoor": false,
    "officialParkId": "1310",
    "sportValue": "1000_1020"
  },
  {
    "key": "oi_b_hard",
    "name": "大井埠头海滨公园 B · 硬地",
    "en": "Oi Wharf Park B · Hard",
    "jp": "大井ふ頭海浜公園Ｂ",
    "regionKey": "shinagawa",
    "system": "tokyo",
    "surface": "hard",
    "indoor": false,
    "officialParkId": "1315",
    "sportValue": "1000_1020"
  },
  {
    "key": "oi_b_turf",
    "name": "大井埠头海滨公园 B · 人工草地",
    "en": "Oi Wharf Park B · Artificial turf",
    "jp": "大井ふ頭海浜公園Ｂ",
    "regionKey": "shinagawa",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1315",
    "sportValue": "1000_1030"
  },
  {
    "key": "soshigaya",
    "name": "祖师谷公园",
    "en": "Soshigaya Park",
    "jp": "祖師谷公園",
    "regionKey": "setagaya",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1070",
    "sportValue": "1000_1030"
  },
  {
    "key": "takaido",
    "name": "高井户公园",
    "en": "Takaido Park",
    "jp": "高井戸公園",
    "regionKey": "suginami",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1175",
    "sportValue": "1000_1030"
  },
  {
    "key": "zenpukuji",
    "name": "善福寺川绿地",
    "en": "Zenpukujigawa Green Space",
    "jp": "善福寺川緑地",
    "regionKey": "suginami",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1180",
    "sportValue": "1000_1030"
  },
  {
    "key": "shioiri",
    "name": "汐入公园",
    "en": "Shioiri Park",
    "jp": "汐入公園",
    "regionKey": "arakawa",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1170",
    "sportValue": "1000_1030"
  },
  {
    "key": "ukima",
    "name": "浮间公园",
    "en": "Ukima Park",
    "jp": "浮間公園",
    "regionKey": "itabashi",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1100",
    "sportValue": "1000_1030"
  },
  {
    "key": "akatsuka",
    "name": "赤塚公园",
    "en": "Akatsuka Park",
    "jp": "赤塚公園",
    "regionKey": "itabashi",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1120",
    "sportValue": "1000_1030"
  },
  {
    "key": "johoku",
    "name": "城北中央公园",
    "en": "Johoku Chuo Park",
    "jp": "城北中央公園",
    "regionKey": "nerima",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1110",
    "sportValue": "1000_1030"
  },
  {
    "key": "hikarigaoka",
    "name": "光丘公园",
    "en": "Hikarigaoka Park",
    "jp": "光が丘公園",
    "regionKey": "nerima",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1190",
    "sportValue": "1000_1030"
  },
  {
    "key": "shakujii_b",
    "name": "石神井公园 B",
    "en": "Shakujii Park B",
    "jp": "石神井公園Ｂ",
    "regionKey": "nerima",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1205",
    "sportValue": "1000_1030"
  },
  {
    "key": "higashi_ayase",
    "name": "东绫濑公园",
    "en": "Higashi Ayase Park",
    "jp": "東綾瀬公園",
    "regionKey": "adachi",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1130",
    "sportValue": "1000_1030"
  },
  {
    "key": "toneri",
    "name": "舍人公园",
    "en": "Toneri Park",
    "jp": "舎人公園",
    "regionKey": "adachi",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1140",
    "sportValue": "1000_1030"
  },
  {
    "key": "shinozaki_a",
    "name": "篠崎公园 A",
    "en": "Shinozaki Park A",
    "jp": "篠崎公園Ａ",
    "regionKey": "edogawa",
    "system": "tokyo",
    "surface": "turf",
    "indoor": false,
    "officialParkId": "1150",
    "sportValue": "1000_1030"
  }
];
// Retained only to remove retired selections and preferences from saved settings.
export const retiredCourtKeys = ["azabu","musashino_chuo","koganei","inokashira","nogawa","fuchunomori","higashiyamato_minami"];
export const courtByKey = new Map(courtCatalog.map(court => [court.key, court]));
export const catalogTranslations = Object.fromEntries([...regions, ...courtCatalog].map(item => [item.name, { en: item.en, ja: item.jp }]));
export const metropolitanOptionCount = courtCatalog.filter(court => court.system === "tokyo").length;
export const metropolitanVenueCount = new Set(courtCatalog.filter(court => court.system === "tokyo").map(court => court.officialParkId)).size;

export function bookingUrl(court: Court): string {
  return court.system === "tokyo" ? tokyoBookingUrl : "https://web101.rsv.ws-scs.jp/minato/web/";
}

export function validCourtSelection(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= courtCatalog.length
    && value.every(key => typeof key === "string" && courtByKey.has(key))
    && new Set(value).size === value.length;
}

export function selectedCourtKeys(value: unknown): string[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) && parsed.every(key => typeof key === "string")
      ? courtCatalog.filter(court => parsed.includes(court.key)).map(court => court.key)
      : [...defaultCourtKeys];
  } catch { return [...defaultCourtKeys]; }
}

export function toggleCourtKeys(current: string[], keys: string[], enabled: boolean): string[] {
  const selection = new Set(current);
  keys.forEach(key => enabled ? selection.add(key) : selection.delete(key));
  return courtCatalog.filter(court => selection.has(court.key)).map(court => court.key);
}

export type WatchSettings = Record<string, unknown> | null;
export type CourtTimeRange = { start: string; end: string };

export function validCourtTimeRange(value: unknown): value is CourtTimeRange {
  if (!value || typeof value !== "object") return false;
  const { start, end } = value as Record<string, unknown>;
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  return typeof start === "string" && typeof end === "string"
    && clock.test(start) && clock.test(end) && start < end;
}

export function courtTimeRange(settings: WatchSettings, courtKey: string): CourtTimeRange {
  try {
    const stored = settings?.court_time_ranges;
    const ranges = typeof stored === "string" ? JSON.parse(stored) : stored;
    const custom = ranges?.[courtKey];
    if (courtByKey.has(courtKey) && validCourtTimeRange(custom)) return { start:custom.start, end:custom.end };
  } catch { /* Older settings keep their original time range. */ }
  if (courtByKey.get(courtKey)?.indoor && (settings?.ariake_all_day ?? true)) return { start:"07:00", end:"21:00" };
  const legacy = { start:settings?.outdoor_start, end:settings?.outdoor_end };
  return validCourtTimeRange(legacy) ? legacy : { start:"17:00", end:"21:00" };
}

const tokyoDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit" });
const tokyoClockFormatter = new Intl.DateTimeFormat("en-GB", { timeZone:"Asia/Tokyo", hour:"2-digit", minute:"2-digit", hourCycle:"h23" });
export function monitoringStartDate(now = new Date()): string { return tokyoDateFormatter.format(now); }

export function continuousSettings(settings: WatchSettings, now = new Date()): WatchSettings {
  // Legacy date columns remain for stored-data compatibility, but no longer limit monitoring.
  return settings ? { ...settings, start_date:monitoringStartDate(now), end_date:null, monitoring_mode:"continuous" } : null;
}

export function slotMatchesSettings(slot: Record<string, unknown>, settings: WatchSettings, now = new Date()): boolean {
  if (!settings || !selectedCourtKeys(settings.selected_court_keys).includes(String(slot.court_key))) return false;
  const date = String(slot.slot_date ?? "");
  const today = monitoringStartDate(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return false;
  if (date === today) {
    const clock = tokyoClockFormatter.format(now);
    if (String(slot.end_time) <= clock) return false;
  }
  const { start, end } = courtTimeRange(settings, String(slot.court_key));
  return String(slot.start_time) < end && String(slot.end_time) > start;
}
