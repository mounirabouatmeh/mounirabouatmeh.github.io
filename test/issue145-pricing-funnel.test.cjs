const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const issue115 = fs.readFileSync("static-issue115.js", "utf8");
const pricingSummary = fs.readFileSync("static-pricing-summary.js", "utf8");

test("pricing funnel uses assessed, feasible and ticket-optimized sources", () => {
  assert.match(issue115, /totalAssessedOptionCount/);
  assert.match(issue115, /splitFeasibleOptionCount/);
  assert.match(issue115, /optimized:\s*usableRecords\(\)\.length/);
  assert.match(issue115, /Same-carrier round-trip structure applied/);
});

test("pricing terminology distinguishes optimized universe from paginated details", () => {
  assert.match(issue115, /Ticket-optimized itineraries/);
  assert.match(pricingSummary, /Showing .*ticket-optimized itineraries/);
  assert.doesNotMatch(issue115, /All itineraries \(/);
  assert.doesNotMatch(pricingSummary, /viable candidate/);
});
