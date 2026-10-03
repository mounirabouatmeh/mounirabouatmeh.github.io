const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const statePath = require.resolve("../static-issue23-state.js");
const originalFetch = globalThis.fetch;
delete globalThis.CuberenceIssue23;
delete require.cache[statePath];
require(statePath);

const formatDateTime = globalThis.CuberenceIssue23?.formatDateTime;
const candidates = fs.readFileSync("static-issue23-candidates.js", "utf8");

test.after(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.CuberenceIssue23;
  delete require.cache[statePath];
});

test("issue 152 converts canonical UTC schedule instants to each airport local clock", () => {
  assert.equal(formatDateTime("2026-10-12T22:15:00Z", "America/Toronto"), "Oct 12, 6:15 PM");
  assert.equal(formatDateTime("2026-10-13T05:05:00Z", "Europe/Paris"), "Oct 13, 7:05 AM");
  assert.equal(formatDateTime("2026-10-15T11:40:00Z", "Europe/Paris"), "Oct 15, 1:40 PM");
  assert.equal(formatDateTime("2026-10-15T15:55:00Z", "Asia/Beirut"), "Oct 15, 6:55 PM");
  assert.equal(formatDateTime("2026-11-22T05:50:00Z", "Asia/Beirut"), "Nov 22, 7:50 AM");
  assert.equal(formatDateTime("2026-11-22T10:35:00Z", "Europe/Paris"), "Nov 22, 11:35 AM");
  assert.equal(formatDateTime("2026-11-22T13:00:00Z", "Europe/Paris"), "Nov 22, 2:00 PM");
  assert.equal(formatDateTime("2026-11-22T20:40:00Z", "America/Toronto"), "Nov 22, 3:40 PM");
});

test("issue 152 preserves Sabre offset-local display behavior when no IANA zone is supplied", () => {
  assert.equal(formatDateTime("2026-10-12T17:00:00-04:00"), "Oct 12, 5:00 PM");
  assert.equal(formatDateTime("2026-10-13T05:45:00+02:00"), "Oct 13, 5:45 AM");
});

test("candidate schedule rows pass the endpoint-specific timezones into the formatter", () => {
  assert.match(candidates, /formatDateTime\(flight\.departure, flight\.originTimeZone\)/);
  assert.match(candidates, /formatDateTime\(flight\.arrival, flight\.destinationTimeZone\)/);
});
