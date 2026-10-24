const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const ui = fs.readFileSync("static-issue23-candidates.js", "utf8");
const state = fs.readFileSync("static-issue23-state.js", "utf8");

test("both providers' changed timetables are presented as alternatives, never selected-fare confirmation", () => {
  assert.match(ui, /Sabre CERT timetable difference/);
  assert.match(ui, /Sabre CERT test timetable differs/);
  assert.match(ui, /Cuberence flight schedule remains unchanged/);
  assert.match(ui, /Test fare evidence only/);
  assert.doesNotMatch(ui, /AeroDataBox/i);
  assert.match(ui, /"Advisor-selected schedule \(NOT fare-confirmed\)"/);
  assert.match(ui, /"The advisor has not authorized replacing the selected itinerary/);
  assert.match(ui, /change\.provider/);
  assert.match(ui, /change\.alternativePrice/);
  assert.match(ui, /change\.alternativeAssessment/);
  assert.match(ui, /difference\.departure/);
  assert.match(ui, /difference\.arrival/);
  assert.match(ui, /flight\.originTimeZone/);
  assert.match(ui, /flight\.destinationTimeZone/);
  assert.doesNotMatch(ui, /status === "SCHEDULE_CHANGED"\) \{[\s\S]{0,140}confirmedTickets/);
});

test("schedule changed outcome is captured as complete and sent to Luna for final explanation", () => {
  assert.match(state, /if \(x\?\.status === "SCHEDULE_CHANGED"\) return "SCHEDULE_CHANGED";/);
  assert.match(state, /"CONFIRMED", "SCHEDULE_CHANGED", "EXACT_PRICE_UNAVAILABLE"/);
  assert.match(state, /data\.status === "SCHEDULE_CHANGED"/);
});
