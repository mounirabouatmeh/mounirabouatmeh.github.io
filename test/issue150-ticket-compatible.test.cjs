const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const issue14 = fs.readFileSync("static-issue14.js", "utf8");
const issue115 = fs.readFileSync("static-issue115.js", "utf8");
const pricingSummary = fs.readFileSync("static-pricing-summary.js", "utf8");
const css = fs.readFileSync("static-issue115.css", "utf8");

test("advisor-facing UI uses ticket-compatible terminology", () => {
  for (const source of [issue14, issue115, pricingSummary]) {
    assert.match(source, /ticket-compatible/i);
    assert.doesNotMatch(source, /ticket-optimized/i);
  }
});

test("selected hub card fingerprint changes when pricing funnel data arrives", () => {
  assert.match(issue14, /pricingFingerprint/);
  assert.match(issue14, /pricingFunnelCounts\?\.\(hub\.id\)/);
});

test("mobile status row has no standalone dangling arrow", () => {
  assert.match(issue115, /issue148-status-arrow/);
  assert.match(css, /issue148-status-arrow\{display:none\}/);
});
