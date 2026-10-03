const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const issue115 = fs.readFileSync("static-issue115.js", "utf8");
const issue14 = fs.readFileSync("static-issue14.js", "utf8");

for (const [name, source] of [["pricing funnel", issue115], ["Step 3 and hub cards", issue14]]) {
  test(`${name} uses the canonical trip-combination sequence`, () => {
    assert.match(source, /trip combinations identified/);
    assert.match(source, /rejected.*connection risk too high/s);
    assert.match(source, /feasible/);
    assert.match(source, /ticket-compatible itineraries/);
    assert.match(source, /valid with risk/);
  });
}

test("completed advisor funnel omits not-valid output", () => {
  assert.doesNotMatch(issue115, /data-issue148-status="not-valid"/);
  assert.doesNotMatch(issue14, / not valid/);
});
