const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const issue115 = fs.readFileSync("static-issue115.js", "utf8");
const issue14 = fs.readFileSync("static-issue14.js", "utf8");

test("pricing funnel includes ticket-compatible valid and risk status breakdown", () => {
  assert.match(issue115, /validWithRisk/);
  assert.match(issue115, /ticket-compatible/);
  assert.match(issue115, /valid with risk/);
  assert.doesNotMatch(issue115, /data-issue148-status="not-valid"/);
});

test("Step 3 and selected hub cards reuse the optimized funnel after pricing", () => {
  assert.match(issue14, /pricingFunnelCounts/);
  assert.match(issue14, /ticket-compatible/);
  assert.match(issue14, /valid with risk/);
  assert.doesNotMatch(issue14, /not valid/);
});
