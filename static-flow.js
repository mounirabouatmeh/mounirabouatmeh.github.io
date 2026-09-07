(() => {
  const previousFetch = globalThis.fetch.bind(globalThis);
  const flowState = {
    hubs: [],
    selectedHubIds: [],
    strategy: null,
    currency: null,
    intentInput: null,
    baselineId: null,
    baselinePhase: null,
    baselineMessage: null,
    baselineWarnings: [],
    baseline: null,
    discoveryPhase: null,
    pricingPhase: null,
  };

  function isChatRequest(input) {
    const url = typeof input === "string" ? input : input?.url;
    return typeof url === "string" && url.includes("cuberence-travel-api.vercel.app/api/v1/chat");
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function money(price) {
    if (!price || typeof price.amount !== "number") return "—";
    return `${price.currency ?? ""} ${price.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  }

  function addDays(isoDate, days) {
    if (typeof isoDate !== "string" || !Number.isFinite(days)) return null;
    const date = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function returnWindow(input) {
    const from = input?.departureWindow?.from;
    const to = input?.departureWindow?.to;
    const minNights = Number(input?.destinationStay?.minNights);
    const maxNights = Number(input?.destinationStay?.maxNights);
    if (!from || !to || !Number.isFinite(minNights) || !Number.isFinite(maxNights)) return null;
    const earliest = addDays(from, minNights);
    const latest = addDays(to, maxNights);
    return earliest && latest ? `${earliest} → ${latest}` : null;
  }

  function selectedHubLabel(id) {
    const hub = flowState.hubs.find((item) => item?.id === id);
    if (!hub) return id;
    const airports = Array.isArray(hub.airports) && hub.airports.length ? ` · ${hub.airports.join("/")}` : "";
    return `${hub.city ?? id}${airports}`;
  }

  function renderIntent() {
    const input = flowState.intentInput;
    if (!input) return;

    const origin = document.getElementById("intent-origin");
    const destination = document.getElementById("intent-destination");
    const dates = document.getElementById("intent-dates");
    const stay = document.getElementById("intent-stay");
    const returns = document.getElementById("intent-return");
    const route = document.getElementById("workspace-route");

    if (origin && input.origin) origin.textContent = input.origin;
    if (destination && input.destination) destination.textContent = input.destination;
    if (route && input.origin && input.destination) route.textContent = `${input.origin} → ${input.destination}`;

    if (dates && input.departureWindow?.from && input.departureWindow?.to) {
      dates.textContent = `${input.departureWindow.from} → ${input.departureWindow.to}`;
    }

    if (stay && input.destinationStay?.minNights != null && input.destinationStay?.maxNights != null) {
      stay.textContent = `${input.destinationStay.minNights}–${input.destinationStay.maxNights} nights`;
    }

    const derivedReturn = returnWindow(input);
    if (returns && derivedReturn) returns.textContent = derivedReturn;
  }

  function renderBaseline() {
    const target = document.getElementById("baseline-content");
    if (!target) return;
    target.replaceChildren();

    const baseline = flowState.baseline;
    if (!baseline?.price) {
      const empty = node("div", "empty-workspace compact-empty");
      if (["starting", "queued", "running"].includes(flowState.baselinePhase)) {
        empty.append(node("strong", null, "Pricing baseline…"));
        empty.append(node("p", null, flowState.baselineMessage ?? "Finding the cheapest standard trip. Hub discovery will start after the baseline completes."));
      } else if (flowState.baselinePhase === "completed") {
        empty.append(node("strong", null, "No valid baseline found"));
        const warning = flowState.baselineWarnings[0];
        empty.append(node("p", null, warning ?? "The baseline search completed without a valid standard round trip for the requested window and stay."));
      } else {
        empty.append(node("strong", null, "Baseline not priced yet"));
        empty.append(node("p", null, "After trip intent and currency are confirmed, Cuberence prices the cheapest standard trip first, then starts hub discovery."));
      }
      target.append(empty);
      return;
    }

    const card = node("article", "baseline-overview-card");
    const top = node("div", "baseline-overview-top");
    const copy = node("div");
    copy.append(node("span", "baseline-kicker", "Cheapest standard trip"));
    copy.append(node("strong", "baseline-price", money(baseline.price)));
    top.append(copy);
    top.append(node("span", "baseline-provider", `${baseline.provider ?? "Sabre"}${baseline.environment ? ` ${baseline.environment}` : ""}`));
    card.append(top);

    const legs = Array.isArray(baseline.legs) ? baseline.legs : [];
    if (legs.length >= 2) {
      const outbound = legs[0];
      const inbound = legs[legs.length - 1];
      const facts = node("div", "baseline-facts");
      facts.append(node("span", null, `${outbound?.origin ?? ""} → ${outbound?.destination ?? ""}`));
      facts.append(node("span", null, `Depart ${outbound?.departure?.slice?.(0, 10) ?? "—"}`));
      facts.append(node("span", null, `Return ${inbound?.departure?.slice?.(0, 10) ?? "—"}`));
      if (baseline.validatingCarrier) facts.append(node("span", null, `Carrier ${baseline.validatingCarrier}`));
      card.append(facts);
    }

    target.append(card);
  }

  function renderSelectedHubs() {
    const target = document.getElementById("selected-hubs-content");
    if (!target) return;
    target.replaceChildren();

    if (!flowState.selectedHubIds.length) {
      if (flowState.discoveryPhase === "completed" && flowState.hubs.length) {
        const next = node("div", "next-step-callout");
        next.append(node("strong", null, "Next step"));
        next.append(node("p", null, "Select one or more hubs for SPLIT pricing. Tell Cuberence which hub or hubs you want to price."));
        target.append(next);
      } else {
        const empty = node("div", "empty-workspace compact-empty");
        empty.append(node("strong", null, "No hubs selected yet"));
        empty.append(node("p", null, "The hub or hubs chosen in the conversation will appear here before pricing results."));
        target.append(empty);
      }
      return;
    }

    const chips = node("div", "selected-hub-list");
    for (const id of flowState.selectedHubIds) chips.append(node("span", "selected-hub-chip", selectedHubLabel(id)));
    target.append(chips);

    const meta = node("div", "selection-meta");
    if (flowState.strategy) meta.append(node("span", null, `Strategy: ${flowState.strategy}`));
    if (flowState.currency) meta.append(node("span", null, `Currency: ${flowState.currency}`));
    if (meta.childNodes.length) target.append(meta);
  }

  function latestAssistantText() {
    const conversation = document.getElementById("conversation");
    if (!conversation) return "";
    const bubbles = conversation.querySelectorAll(".assistant-bubble");
    return bubbles.length ? bubbles[bubbles.length - 1].textContent ?? "" : "";
  }

  function updateComposerGuidance() {
    const input = document.getElementById("message-input");
    const guidance = document.getElementById("composer-guidance");
    if (!input || !guidance) return;

    let placeholder = "Describe the client’s trip, constraints, or what you want to compare…";
    let message = "Start with the client’s origin, destination, departure window, and destination stay.";
    let isNextStep = false;

    if (flowState.pricingPhase === "completed") {
      placeholder = "Ask to compare the results, explain a trade-off, or price another hub…";
      message = "Pricing is complete. Review the results or select another hub to compare.";
    } else if (["starting", "queued", "running"].includes(flowState.pricingPhase)) {
      placeholder = "SPLIT pricing is running…";
      message = "Cuberence is pricing the selected hub or hubs.";
    } else if (flowState.discoveryPhase === "completed" && flowState.hubs.length && !flowState.selectedHubIds.length) {
      placeholder = "Select hubs to price, for example: Milan and Rome…";
      message = "Next step: Select one or more hubs for SPLIT pricing.";
      isNextStep = true;
    } else if (["starting", "queued", "running"].includes(flowState.discoveryPhase)) {
      placeholder = "Hub discovery is running…";
      message = "Cuberence is finding feasible stayover hubs. Hub selection comes next.";
    } else if (flowState.baselinePhase === "completed") {
      placeholder = "Discovery will start automatically…";
      message = "Baseline is complete. Cuberence is moving to hub discovery next.";
    } else if (["starting", "queued", "running"].includes(flowState.baselinePhase)) {
      placeholder = "Baseline pricing is running…";
      message = "Cuberence is pricing the cheapest standard trip first. Discovery will start automatically afterward.";
    } else if (/currency/i.test(latestAssistantText())) {
      placeholder = "Enter the pricing currency, for example CAD or USD…";
      message = "Next step: Choose the currency to use for Baseline and SPLIT pricing.";
      isNextStep = true;
    }

    if (input.placeholder !== placeholder) input.placeholder = placeholder;
    if (guidance.textContent !== message) guidance.textContent = message;
    guidance.classList.toggle("stage-next", isNextStep);
  }

  function renderFlow() {
    renderIntent();
    renderBaseline();
    renderSelectedHubs();
    updateComposerGuidance();
  }

  function captureEvent(event) {
    if (event?.type === "tool-input-available" && event.toolName === "baseline" && event.input) {
      flowState.intentInput = event.input;
      flowState.currency = typeof event.input.currency === "string" ? event.input.currency.toUpperCase() : flowState.currency;
      flowState.baselinePhase = "starting";
      flowState.baselineMessage = "Preparing the standard-trip baseline first. Hub discovery will start after it completes.";
      renderFlow();
      return;
    }

    if (event?.type === "tool-input-available" && event.toolName === "discovery" && event.input) {
      flowState.intentInput = event.input;
      flowState.discoveryPhase = "starting";
      renderFlow();
      return;
    }

    if (event?.type === "tool-input-available" && event.toolName === "pricing" && event.input) {
      flowState.selectedHubIds = Array.isArray(event.input.selectedHubs) ? event.input.selectedHubs : [];
      flowState.strategy = event.input.strategy ?? null;
      flowState.currency = typeof event.input.currency === "string" ? event.input.currency.toUpperCase() : flowState.currency;
      flowState.baselineId = event.input.baselineId ?? flowState.baselineId;
      flowState.pricingPhase = "starting";
      renderFlow();
      return;
    }

    if (event?.type !== "tool-output-available" || !event.output) return;
    const output = event.output;

    if (output.baselineId && !output.pricingId) {
      flowState.baselineId = output.baselineId;
      flowState.baselinePhase = output.phase ?? flowState.baselinePhase;
      flowState.baselineMessage = output.message ?? flowState.baselineMessage;
      if (Array.isArray(output.warnings)) flowState.baselineWarnings = output.warnings;
      if (output.baseline) flowState.baseline = output.baseline;
      renderFlow();
      return;
    }

    if (output.discoveryId) {
      flowState.discoveryPhase = output.phase ?? flowState.discoveryPhase;
      if (Array.isArray(output.hubs)) flowState.hubs = output.hubs;
      renderFlow();
      return;
    }

    if (output.pricingId) {
      flowState.pricingPhase = output.phase ?? flowState.pricingPhase;
      flowState.selectedHubIds = Array.isArray(output.selectedHubs) ? output.selectedHubs : flowState.selectedHubIds;
      flowState.strategy = output.strategy ?? flowState.strategy;
      flowState.baselineId = output.baselineId ?? flowState.baselineId;
      if (output.baseline) flowState.baseline = output.baseline;
      renderFlow();
    }
  }

  async function inspectStream(response) {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const match = buffer.match(/\r?\n\r?\n/);
        if (!match || match.index == null) break;
        const raw = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!data || data === "[DONE]") continue;
        try { captureEvent(JSON.parse(data)); } catch { /* Primary app owns malformed-stream handling. */ }
      }
    }
  }

  function decorateCompletedProgress() {
    const conversation = document.getElementById("conversation");
    if (!conversation) return;

    for (const box of conversation.querySelectorAll(".tool-progress")) {
      const copy = box.querySelector(".tool-progress-copy");
      const label = copy?.querySelector("strong");
      const detail = copy?.querySelector("span");
      if (!label || !detail) continue;

      const detailText = detail.textContent ?? "";
      if (/baseline|standard round-trip|standard trip/i.test(detailText) && label.textContent !== "Baseline") {
        label.textContent = "Baseline";
      }

      const completed = /baseline complete|discovery complete/i.test(detailText);
      if (!completed) continue;

      if (!box.classList.contains("tool-complete")) box.classList.add("tool-complete");
      const pulse = box.querySelector(".pulse-dot");
      if (pulse) {
        pulse.className = "complete-check";
        pulse.textContent = "✓";
        pulse.setAttribute("aria-label", "Completed");
      }
    }
  }

  globalThis.fetch = async (...args) => {
    const response = await previousFetch(...args);
    if (isChatRequest(args[0]) && response.body) inspectStream(response.clone()).catch(() => {});
    return response;
  };

  const start = () => {
    renderFlow();
    const conversation = document.getElementById("conversation");
    if (conversation) {
      new MutationObserver(() => queueMicrotask(() => {
        decorateCompletedProgress();
        updateComposerGuidance();
      })).observe(conversation, { childList: true, subtree: true, characterData: true });
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();