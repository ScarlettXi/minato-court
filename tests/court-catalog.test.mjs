import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { continuousSettings, courtCatalog, courtTimeRange, defaultCourtKeys, regions, retiredCourtKeys, selectedCourtKeys, slotMatchesSettings as matches, toggleCourtKeys, validCourtSelection, validCourtTimeRange } from "../lib/courts.ts";
const slotMatchesSettings = (slot, settings) => matches(slot, settings, new Date("2026-10-01T00:00:00Z"));

test("catalog covers official Tokyo ward options and excludes Tama", () => {
  const snapshot = JSON.parse(readFileSync(new URL("../data/official-tennis-catalog.json", import.meta.url)));
  const actual = courtCatalog.filter(court => court.system === "tokyo");
  const wardEntries = snapshot.entries.filter(entry => entry.region.endsWith("区"));
  assert.equal(actual.length, wardEntries.length);
  assert.equal(regions.every(region => region.group === "wards"), true);
  assert.equal(courtCatalog.some(court => retiredCourtKeys.includes(court.key)), false);
  assert.equal(new Set(actual.map(court => `${court.officialParkId}:${court.sportValue}`)).size, actual.length);
  for (const entry of wardEntries) {
    const court = actual.find(court => court.officialParkId === entry.value && court.sportValue === entry.sportValue);
    assert.ok(court, entry.name);
    assert.equal(court.jp, entry.name);
    assert.equal(regions.find(region => region.key === court.regionKey)?.jp, entry.region);
  }
  assert.equal(actual.filter(court => court.officialParkId === "1315").length, 2);
  assert.equal(actual.find(court => court.key === "ariake_indoor").indoor, true);
  assert.equal(courtCatalog.filter(court => court.key === "azabu").length, 1);
});

test("whole-area and individual selections preserve other areas and reject invalid saves", () => {
  const koto = courtCatalog.filter(court => court.regionKey === "koto").map(court => court.key);
  const allKoto = toggleCourtKeys(["shiba"], koto, true);
  assert.deepEqual(new Set(allKoto), new Set(["shiba", ...koto]));
  assert.deepEqual(toggleCourtKeys(allKoto, koto, false), ["shiba"]);
  assert.equal(toggleCourtKeys(allKoto, ["ariake_indoor"], false).includes("ariake_indoor"), false);
  assert.equal(validCourtSelection([]), false);
  assert.equal(validCourtSelection(["shiba", "shiba"]), false);
  assert.equal(validCourtSelection(["unknown"]), false);
  assert.equal(validCourtSelection(courtCatalog.map(court => court.key)), true);
  assert.deepEqual(new Set(selectedCourtKeys(undefined)), new Set(defaultCourtKeys));
  assert.deepEqual(selectedCourtKeys('["takaido"]'), ["takaido"]);
  assert.deepEqual(selectedCourtKeys('["takaido","koganei","nogawa"]'), ["takaido"]);
  assert.deepEqual(selectedCourtKeys(JSON.stringify(retiredCourtKeys)), []);
  assert.deepEqual(selectedCourtKeys('[]'), []);
  for (const key of retiredCourtKeys) assert.equal(validCourtSelection([key]), false);
});

test("continuous monitoring keeps court hours but ignores legacy end dates and the former 93-day limit", () => {
  const settings = { selected_court_keys:'["takaido","ariake_indoor"]', start_date:"2026-10-01", end_date:"2026-10-15", outdoor_start:"17:00", outdoor_end:"21:00", ariake_all_day:1 };
  const slot = { court_key:"takaido", slot_date:"2026-10-04", start_time:"17:00", end_time:"19:00" };
  assert.equal(slotMatchesSettings(slot, settings), true);
  assert.equal(slotMatchesSettings({ ...slot, court_key:"shiba" }, settings), false);
  assert.equal(slotMatchesSettings({ ...slot, slot_date:"2026-10-16" }, settings), true);
  assert.equal(slotMatchesSettings({ ...slot, slot_date:"2027-06-01" }, settings), true);
  assert.equal(slotMatchesSettings({ ...slot, slot_date:"2026-09-30" }, settings), false);
  assert.equal(slotMatchesSettings({ ...slot, start_time:"15:00", end_time:"17:00" }, settings), false);
  assert.equal(slotMatchesSettings({ ...slot, court_key:"ariake_indoor", start_time:"09:00", end_time:"11:00" }, settings), true);
});

test("the open-ended window advances at Tokyo midnight and excludes elapsed slots", () => {
  const settings = { selected_court_keys:'["shiba"]', start_date:"2030-01-01", end_date:"2030-01-02" };
  assert.deepEqual(continuousSettings(settings, new Date("2026-12-31T15:00:00Z")), {
    ...settings, start_date:"2027-01-01", end_date:null, monitoring_mode:"continuous",
  });
  const slot = { court_key:"shiba", slot_date:"2026-12-31", start_time:"17:00", end_time:"19:00" };
  assert.equal(matches(slot, settings, new Date("2026-12-31T08:00:00Z")), true);
  assert.equal(matches(slot, settings, new Date("2026-12-31T10:00:00Z")), false);
  assert.equal(matches(slot, settings, new Date("2026-12-31T15:00:00Z")), false);
  assert.equal(matches({ ...slot, slot_date:"2027-01-01" }, settings, new Date("2026-12-31T15:00:00Z")), true);
});

test("each court keeps independent hours, including an indoor override", () => {
  const settings = { outdoor_start:"17:00", outdoor_end:"21:00", ariake_all_day:1,
    court_time_ranges:JSON.stringify({ shiba:{ start:"18:00", end:"20:30" }, ariake_indoor:{ start:"10:00", end:"13:00" } }) };
  assert.deepEqual(courtTimeRange(settings, "shiba"), { start:"18:00", end:"20:30" });
  assert.deepEqual(courtTimeRange(settings, "hibiya"), { start:"17:00", end:"21:00" });
  assert.deepEqual(courtTimeRange(settings, "ariake_indoor"), { start:"10:00", end:"13:00" });
  assert.deepEqual(courtTimeRange({ ...settings, court_time_ranges:"{}" }, "ariake_indoor"), { start:"07:00", end:"21:00" });
  for (const stored of [undefined, "broken", "null", '{"shiba":{"start":"20:00","end":"09:00"}}']) {
    assert.deepEqual(courtTimeRange({ ...settings, court_time_ranges:stored }, "shiba"), { start:"17:00", end:"21:00" });
  }
});

test("time settings reject malformed, equal and overnight ranges", () => {
  assert.equal(validCourtTimeRange({ start:"00:00", end:"23:59" }), true);
  assert.equal(validCourtTimeRange({ start:"09:15", end:"10:45" }), true);
  for (const range of [null, {}, { start:9, end:12 }, { start:"9:00", end:"12:00" },
    { start:"09:60", end:"12:00" }, { start:"09:00", end:"24:00" },
    { start:"09:00", end:"09:00" }, { start:"21:00", end:"07:00" }]) {
    assert.equal(validCourtTimeRange(range), false, JSON.stringify(range));
  }
});

test("custom monitoring hours use strict overlap boundaries without affecting other courts", () => {
  const settings = { selected_court_keys:'["shiba","hibiya","ariake_indoor"]', start_date:"2026-10-01", end_date:"2026-10-15",
    court_time_ranges:'{"shiba":{"start":"09:00","end":"12:00"},"ariake_indoor":{"start":"18:00","end":"20:00"}}' };
  const slot = { court_key:"shiba", slot_date:"2026-10-04", start_time:"09:00", end_time:"11:00" };
  assert.equal(slotMatchesSettings(slot, settings), true);
  assert.equal(slotMatchesSettings({ ...slot, start_time:"08:00", end_time:"09:00" }, settings), false);
  assert.equal(slotMatchesSettings({ ...slot, start_time:"08:30", end_time:"09:30" }, settings), true);
  assert.equal(slotMatchesSettings({ ...slot, start_time:"12:00", end_time:"14:00" }, settings), false);
  assert.equal(slotMatchesSettings({ ...slot, court_key:"hibiya" }, settings), false);
  assert.equal(slotMatchesSettings({ ...slot, court_key:"ariake_indoor" }, settings), false);
  assert.equal(slotMatchesSettings({ ...slot, court_key:"ariake_indoor", start_time:"18:00", end_time:"20:00" }, settings), true);
});
