const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");

const code = fs.readFileSync("static-flow.js", "utf8");
const start = code.indexOf("  function baselineTimestamp(");
const end = code.indexOf("  function renderBaselineSegment(", start);
assert.ok(start > 0 && end > start, "expected production baseline timestamp and date helpers");
const context = vm.createContext({ Intl, Date });
vm.runInContext(code.slice(start, end) + "\nthis.formatTime = baselineTimestamp; this.formatDate = baselineDepartureDate;", context);
const { formatTime, formatDate } = context;

test("Kiwi baseline renders Montreal departure in local EDT, not UTC", () => {
  assert.equal(formatTime("2026-10-21T18:20:00.000Z", "America/Toronto", "KIWI"), "2026-10-21 14:20");
});

test("Kiwi baseline return crossing midnight in Beirut is Nov 20, not UTC Nov 19", () => {
  const departure = "2026-11-19T23:30:00.000Z";
  assert.equal(formatTime(departure, "Asia/Beirut", "KIWI"), "2026-11-20 01:30");
  assert.equal(formatDate({ departure, segments: [{ originTimeZone: "Asia/Beirut" }] }, "KIWI"), "2026-11-20");
});

test("Kiwi itinerary segments can have different local timezones and DST offsets", () => {
  assert.equal(formatTime("2026-10-22T04:50:00.000Z", "Asia/Amman", "KIWI"), "2026-10-22 07:50");
  assert.equal(formatTime("2026-11-20T19:25:00.000Z", "America/Toronto", "KIWI"), "2026-11-20 14:25");
});

test("legacy Sabre keeps offset-local representation, and older Kiwi data is explicitly UTC", () => {
  assert.equal(formatTime("2026-10-21T14:20:00-04:00", undefined, "SABRE"), "2026-10-21 14:20");
  assert.equal(formatDate({ departure: "2026-11-19T23:30:00.000Z", segments: [] }, "KIWI"), "2026-11-19 UTC");
  assert.match(code, /renderBaselineSegment\(segment, baseline\.provider\)/);
  assert.match(code, /baselineDepartureDate\(inbound, baseline\.provider\)/);
});
