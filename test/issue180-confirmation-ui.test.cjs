const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");

test("the confirmation proof issuer requests an authenticated same-origin, uncached proof", async () => {
  const source = fs.readFileSync("static-app.js", "utf8");
  const start = source.indexOf("globalThis.CuberenceIssue180 = {");
  const end = source.indexOf("// Booking links always belong", start);
  assert.ok(start !== -1 && end > start);
  const calls = [];
  const ctx = vm.createContext({
    fetch: async (url, opts) => {
      calls.push({url, opts});
      return {ok: true, json: async () => ({proof: "signed.test"})};
    },
  });
  vm.runInContext(source.slice(start, end), ctx);
  const token = await ctx.CuberenceIssue180.issueLunaProof({
    pricingId: "1234", candidateId: "candidate-1",
  });
  assert.equal(token, "signed.test");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/luna/confirmation-authorization");
  assert.equal(calls[0].opts.credentials, "same-origin");
  assert.equal(calls[0].opts.cache, "no-store");
  assert.deepEqual(JSON.parse(calls[0].opts.body), {
    pricingId: "1234", candidateId: "candidate-1",
  });
});

test("baseline details selection submits once with no confirmation proof or provider request", async () => {
  const source = fs.readFileSync("static-flow.js", "utf8");
  const start = source.indexOf("  function baselineAuthorizationMessage() {");
  const end = source.indexOf("  // Fare-provider timestamps", start);
  assert.ok(start > 0 && end > start);
  const submitted = [];
  const input = {value: "", dispatchEvent() {}};
  const form = {requestSubmit() { submitted.push(input.value); }};
  const flowState = {baselineId: "baseline-1", baselineConfirmationPending: false};
  const ctx = vm.createContext({
    flowState,
    document: {getElementById: id => id === "message-input" ? input : id === "composer" ? form : null},
    Event: class Event {},
    renderFlow() {},
    CuberenceIssue180: {issueLunaProof: async () => {throw Error("Unexpected exact confirmation proof");}},
  });
  vm.runInContext(source.slice(start, end) + "\nthis.invoke = sendBaselineAuthorization;", ctx);
  await ctx.invoke();
  assert.equal(submitted.length, 1);
  assert.match(input.value, /call baselineDetails exactly once/i);
  assert.match(input.value, /read-only/i);
  assert.doesNotMatch(input.value, /Confirmation authorization proof:/);
  assert.doesNotMatch(input.value, /Advisor baseline confirmation authorization: YES/);
  await ctx.invoke();
  assert.equal(submitted.length, 1, "pending selection must not submit twice");
});

test("the off-page candidate approval also waits for a server-issued proof", async () => {
  const source = fs.readFileSync("static-issue95.js", "utf8");
  const start = source.indexOf("  async function sendAuthorization(candidate, checkbox) {");
  const end = source.indexOf("  function selectionControl(candidate)", start);
  assert.ok(start > 0 && end > start);
  let resume;
  const pending = new Promise(resolve => { resume = resolve; });
  const input = {value: "", dispatchEvent() {}};
  let submitted = 0;
  const form = {requestSubmit() {submitted += 1;}};
  const candidate = {id: "candidate-1"};
  const s = {pricingId: "pricing-1", selectedCandidateId: null, phases: {}};
  const ctx = vm.createContext({
    s, queue() {},
    document: {
      getElementById: id => id === "message-input" ? input : id === "composer" ? form : null,
      querySelectorAll: () => [],
    },
    Event: class Event {},
    canAuthorizeConfirmation: () => true,
    authorizationMessage: () => "Advisor confirmation authorization: YES",
    CuberenceIssue180: {issueLunaProof: async () => pending},
    alert() {},
  });
  vm.runInContext(source.slice(start, end) + "\nthis.invoke = sendAuthorization;", ctx);
  const promise = ctx.invoke(candidate, {checked:true});
  assert.equal(submitted, 0);
  resume("signed.proof");
  await promise;
  assert.equal(submitted, 1);
  assert.match(input.value, /Confirmation authorization proof: signed\.proof/);
});

test("H4: provider timeout allows a NEW checkbox approval; policy failures stay locked", () => {
  const source = fs.readFileSync("static-issue115.js", "utf8");
  const start = source.indexOf("  C.canAuthorizeConfirmation = (candidate) => {");
  const end = source.indexOf("\n  };", start);
  assert.ok(start >= 0 && end > start, "test the final candidate authorization gate");
  const C = {
    candidateStatus: candidate => candidate.pricingStatus,
    effectiveCandidate: candidate => candidate,
  };
  const s = {
    streamBusy: false, confirmationAuthorizedPending: false,
    phases: { summary: "complete", confirmation: "error" },
  };
  const ctx = vm.createContext({
    C, s,
    recordFor: candidate => ({ candidateStatus: candidate.candidateStatus }),
    STRUCTURALLY_USABLE: new Set(["VALID", "VALID_WITH_RISK"]),
    NON_ACTIONABLE_PRICING: new Set(["EXACT_CHECK_FAILED", "EXACT_PRICE_UNAVAILABLE", "EXACT_CHECK_PENDING", "CONFIRMED"]),
  });
  vm.runInContext(source.slice(start, end + 5), ctx);
  const candidate = (status, code) => ({
    pricingStatus: status, candidateStatus: "VALID",
    exactCheckFailure: code ? { code, message: "failure" } : undefined,
  });
  assert.equal(ctx.C.canAuthorizeConfirmation(candidate("PROXY")), true);
  assert.equal(ctx.C.canAuthorizeConfirmation(candidate("UNPRICED")), true);
  assert.equal(ctx.C.canAuthorizeConfirmation(candidate("EXACT_CHECK_FAILED", "SABRE_EXACT_CHECK_ERROR")), true);
  assert.equal(ctx.C.canAuthorizeConfirmation(candidate("EXACT_CHECK_FAILED", "KIWI_EXACT_CHECK_ERROR")), true);
  assert.equal(ctx.C.canAuthorizeConfirmation(candidate("EXACT_CHECK_FAILED", "DESTINATION_NIGHTS")), false);
  assert.equal(ctx.C.canAuthorizeConfirmation(candidate("EXACT_PRICE_UNAVAILABLE", "SABRE_EXACT_PRICE_UNAVAILABLE")), false);
  assert.equal(ctx.C.canAuthorizeConfirmation(candidate("CONFIRMED")), false);
  s.streamBusy = true;
  assert.equal(ctx.C.canAuthorizeConfirmation(candidate("EXACT_CHECK_FAILED", "KIWI_EXACT_CHECK_ERROR")), false);
});
