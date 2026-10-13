const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");

const source = fs.readFileSync("static-issue23-candidates.js", "utf8");
const start = source.indexOf("  function flightDesignator(");
const end = source.indexOf("  function scheduleBlock(", start);
assert.ok(start >= 0 && end > start, "Flight row renderer must exist");
const node = (tag, className, value) => ({
  tag, className, textContent: value ?? "",
  children: [], append(child) { this.children.push(child); },
});
const context = vm.createContext({ node, formatDateTime: (date) => date });
vm.runInContext(source.slice(start, end) + "\nthis.renderRow = flightRow;", context);
const flight = {
  marketingCarrier: "LH", flightNumber: "LH6757", operatingCarrier: "AC",
  codeshareStatus: "IS_CODESHARED",
  origin: "YUL", destination: "MXP",
  departure: "2026-10-30T00:20:00Z", arrival: "2026-10-30T08:05:00Z",
};

test("advisors see marketing LH6757 and verified Air Canada operator distinctly", () => {
  const row = context.renderRow(flight, "Home → hub");
  const details = row.children[1].children;
  assert.equal(details[0].textContent, "LH6757");
  assert.equal(details[1].textContent, "Marketed by LH · Operated by AC");
  assert.equal(details[2].textContent, "YUL → MXP");
});

test("non-codeshare flight keeps existing row without redundant carrier labels", () => {
  const row = context.renderRow({
    ...flight, marketingCarrier: "AC", flightNumber: "AC894",
    operatingCarrier: "AC", codeshareStatus: "IS_OPERATOR",
  }, "Home → hub");
  assert.equal(row.children[1].children.length, 3);
  assert.equal(row.children[1].children[0].textContent, "AC894");
});

test("unknown operator is explicitly not guessed", () => {
  const row = context.renderRow({ ...flight, operatingCarrier: undefined }, "Home → hub");
  assert.equal(row.children[1].children[1].textContent,
    "Marketed by LH · Operating airline not verified");
});
