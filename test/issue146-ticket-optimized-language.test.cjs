const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const issue115 = fs.readFileSync("static-issue115.js", "utf8");

test("Step 4 header badge says Pricing complete without repeating the optimized count", () => {
  assert.match(issue115, /setText\(badge, "Pricing complete"\)/);
  assert.doesNotMatch(issue115, /setText\(badge, `\$\{usable\.length\} optimized`\)/);
});

test("the meaningful 414-style count remains in funnel and navigation terminology", () => {
  assert.match(issue115, /ticket-compatible/);
  assert.match(issue115, /Ticket-compatible itineraries/);
  assert.match(issue115, /optimized:\s*usableRecords\(\)\.length/);
});
