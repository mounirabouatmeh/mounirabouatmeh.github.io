const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const app = fs.readFileSync("static-app.js", "utf8");
const promptContext = vm.createContext({});
vm.runInContext(app.slice(app.indexOf("function sampleTravelPrompt("), app.indexOf("function renderConversation(")), promptContext);

test("the welcome example uses future dates with the requested return cadence", () => {
  assert.equal(promptContext.sampleTravelPrompt(new Date(2026, 9, 12)),
    "I have a client: 1 adult flying from YUL to BEY October 26–28, 2026, returning November 16–17, and open to a short European stopover. Economy class, pricing in CAD.");
  assert.match(promptContext.sampleTravelPrompt(new Date(2027, 0, 1)), /January 15–17, 2027, returning February 5–6/);
});

test("the welcome example includes years when the trip crosses New Year", () => {
  assert.match(promptContext.sampleTravelPrompt(new Date(2026, 11, 15)), /December 29–31, 2026, returning January 19–20, 2027/);
  assert.match(promptContext.sampleTravelPrompt(new Date(2026, 11, 22)), /January 5–7, 2027, returning January 26–27/);
});

test("late-month welcome windows roll across month boundaries cleanly", () => {
  assert.match(promptContext.sampleTravelPrompt(new Date(2026, 10, 16)),
    /November 30–December 2, 2026, returning December 21–22/);
});

test("legacy candidate-selection enhancement does not replace the sample or intercept its button", () => {
  const selection = fs.readFileSync("static-issue23-selection.js", "utf8");
  assert.doesNotMatch(selection, /const SAMPLE|function syncWelcome|dataset\\.issue23Bound|stopImmediatePropagation/);
});

function node(tag, className, text) {
  return { tag, className, textContent: text, children: [], listeners: {}, dataset: {},
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(type, handler) { this.listeners[type] = handler; } };
}

test("Use this example copies the displayed request and refreshes dates after midnight", () => {
  let currentDate = new Date(2026, 9, 12);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [currentDate])); }
  }
  const conversation = node("div");
  const input = { focus() {} };
  const ctx = vm.createContext({ Date: Clock, createNode: node, state: { messages: [] },
    el: { conversation, input }, updateComposer() {} });
  vm.runInContext(app.slice(app.indexOf("function sampleTravelPrompt("), app.indexOf("function setConfirmedValue(")), ctx);
  ctx.renderConversation();
  const copy = conversation.children[0].children[1];
  const example = copy.children[1];
  const button = copy.children[2];
  button.listeners.click();
  assert.equal(example.textContent, `For example: “${input.value}”`);
  assert.match(input.value, /October 26–28/);
  currentDate = new Date(2026, 9, 13);
  button.listeners.click();
  assert.equal(example.textContent, `For example: “${input.value}”`);
  assert.match(input.value, /October 27–29/);
});
const kiwi = url => ({ provider: "KIWI", kiwi: { bookingUrl: url }, price: { amount: 1900, currency: "CAD" }, legs: [] });
function flowHarness() {
  const target = node("div");
  const events = {};
  const ctx = vm.createContext({ URL, Event, dispatchEvent() {}, createNode: node,
    fetch: async () => {}, addEventListener(name, fn) { events[name] = fn; },
    document: { readyState: "loading", addEventListener() {}, createElement: tag => node(tag),
      getElementById: id => id === "baseline-content" ? target : null } });
  vm.runInContext(app.slice(app.indexOf("function kiwiTicketLink("), app.indexOf("\nconst state")), ctx);
  const flow = fs.readFileSync("static-flow.js", "utf8");
  vm.runInContext(flow.replace("  const start = () => {", "  globalThis.views = { flowState, renderBaseline, captureEvent };\n  const start = () => {"), ctx);
  return { ctx, target, events, view: ctx.views };
}
function linksIn(element) {
  return [element, ...element.children.flatMap(linksIn)].filter(item => item.tag === "a");
}

test("baseline renders its Kiwi link while collapsed and replaces it with the exact link", () => {
  const { target, view } = flowHarness();
  view.captureEvent({ type: "tool-output-available", output: { baselineId: "first", phase: "completed", baseline: kiwi("https://www.kiwi.com/baseline") } });
  assert.equal(linksIn(target)[0].href, "https://www.kiwi.com/baseline");
  view.captureEvent({ type: "tool-output-available", output: { baselineId: "first", status: "CONFIRMED", confirmedOffer: kiwi("https://www.kiwi.com/exact") } });
  assert.equal(linksIn(target)[0].href, "https://www.kiwi.com/exact");
  view.flowState.baselineConfirmation.confirmedOffer = kiwi(null);
  view.renderBaseline();
  assert.equal(linksIn(target)[0].href, "https://www.kiwi.com/baseline");
  assert.match(linksIn(target)[0].textContent, /indicative/);
});

test("a new baseline clears the previous confirmation and never inherits its link", () => {
  const { target, view } = flowHarness();
  view.flowState.baselineId = "previous";
  view.flowState.baselineConfirmation = { confirmedOffer: kiwi("https://www.kiwi.com/previous") };
  view.captureEvent({ type: "tool-input-available", toolName: "baseline", input: {} });
  assert.equal(view.flowState.baselineConfirmation, null);
  view.captureEvent({ type: "tool-output-available", output: { baselineId: "new", baseline: { ...kiwi("https://www.kiwi.com/unused"), provider: "SABRE" } } });
  assert.equal(linksIn(target).length, 0);
});

test("baseline link renders when the shared link helper becomes available", () => {
  const { ctx, events, target, view } = flowHarness();
  view.flowState.baseline = kiwi("https://www.kiwi.com/baseline");
  const helper = ctx.CuberenceKiwiTicketLink;
  ctx.CuberenceKiwiTicketLink = undefined;
  view.renderBaseline();
  assert.equal(linksIn(target).length, 0);
  ctx.CuberenceKiwiTicketLink = helper;
  events["cuberence-kiwi-links-ready"]();
  assert.equal(linksIn(target)[0].href, "https://www.kiwi.com/baseline");
});

async function providerBadge(config, ok = true) {
  const badges = [node("span"), node("span")];
  const ctx = vm.createContext({
    CuberenceIssue23: { s: {}, node, syncFns: [] }, requestAnimationFrame() {},
    fetch: async () => ({ ok, status: ok ? 200 : 401, json: async () => config }),
    document: { readyState: "loading", addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return badges; } }
  });
  const source = fs.readFileSync("static-issue115.js", "utf8");
  vm.runInContext(source.replace("  const start = () => {", "  globalThis.environmentViews = { loadEnvironment, syncEnvironment };\n  const start = () => {"), ctx);
  await ctx.environmentViews.loadEnvironment();
  ctx.environmentViews.syncEnvironment();
  return badges;
}

test("Kiwi agencies show Kiwi pricing in both badges despite retained Sabre CERT credentials", async () => {
  const badges = await providerBadge({ providers: { pricingProvider: "KIWI", sabreEnvironment: "CERT" } });
  for (const badge of badges) {
    assert.equal(badge.textContent, "Kiwi pricing");
    assert.match(badge.className, /is-kiwi/);
    assert.doesNotMatch(badge.title, /Sabre|CERT/);
  }
});

test("provider badges display supplier rather than internal Sabre environment", async () => {
  const cert = (await providerBadge({ providers: { pricingProvider: "SABRE", sabreEnvironment: "CERT" } }))[0];
  const prod = (await providerBadge({ providers: { pricingProvider: "SABRE", sabreEnvironment: "PRODUCTION" } }))[0];
  const unknown = (await providerBadge({ providers: { pricingProvider: "KIWI" } }, false))[0];
  assert.equal(cert.textContent, "Sabre pricing");
  assert.equal(prod.textContent, "Sabre pricing");
  assert.equal(unknown.textContent, "Sabre pricing");
  assert.doesNotMatch(cert.textContent, /CERT|PROD|UNKNOWN/);
  assert.match(cert.title, /Sabre is the active pricing provider/);
});
