(() => {
  const previousFetch = globalThis.fetch.bind(globalThis);
  const flowState = {
    hubs: [],
    selectedHubIds: [],
    strategy: null,
    currency: null,
    baseline: null,
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

  function selectedHubLabel(id) {
    const hub = flowState.hubs.find((item) => item?.id === id);
    if (!hub) return id;
    const airports = Array.isArray(hub.airports) && hub.airports.length ? ` · ${hub.airports.join("/")}` : "";
    return `${hub.city ?? id}${airports}`;
  }

  function renderBaseline() {
    const target = document.getElementById("baseline-content");
    if (!target) return;
    target.replaceChildren();

    const baseline = flowState.baseline;
    if (!baseline?.price) {
      const empty = node("div", "empty-workspace compact-empty");
      empty.append(node("strong", null, "Baseline not priced yet"));
      empty.append(node("p", null, "The cheapest standard trip will appear here when the first pricing run establishes the baseline."));
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
      const empty = node("div", "empty-workspace compact-empty");
      empty.append(node("strong", null, "No hubs selected yet"));
      empty.append(node("p", null, "The hub or hubs chosen in the conversation will appear here before pricing results."));
      target.append(empty);
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

  function renderFlow() {
    renderBaseline();
    renderSelectedHubs();
  }

  function captureEvent(event) {
    if (event?.type === "tool-input-available" && event.toolName === "pricing" && event.input) {
      flowState.selectedHubIds = Array.isArray(event.input.selectedHubs) ? event.input.selectedHubs : [];
      flowState.strategy = event.input.strategy ?? null;
      flowState.currency = typeof event.input.currency === "string" ? event.input.currency.toUpperCase() : null;
      renderFlow();
      return;
    }

    if (event?.type !== "tool-output-available" || !event.output) return;
    const output = event.output;
    if (output.phase === "completed" && output.discoveryId && Array.isArray(output.hubs)) {
      flowState.hubs = output.hubs;
      renderSelectedHubs();
      return;
    }
    if (output.phase === "completed" && output.pricingId) {
      flowState.selectedHubIds = Array.isArray(output.selectedHubs) ? output.selectedHubs : flowState.selectedHubIds;
      flowState.strategy = output.strategy ?? flowState.strategy;
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

  function cleanRawBoldMarkers() {
    const conversation = document.getElementById("conversation");
    if (!conversation) return;
    for (const bubble of conversation.querySelectorAll(".assistant-bubble:not(.markdown-body):not([data-clean-bold])")) {
      const raw = bubble.textContent ?? "";
      if (!raw.includes("**")) continue;
      const parts = raw.split(/(\*\*[^*]+\*\*)/g);
      bubble.replaceChildren();
      for (const part of parts) {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) bubble.append(node("strong", null, part.slice(2, -2)));
        else bubble.append(document.createTextNode(part));
      }
      bubble.dataset.cleanBold = "true";
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
    if (conversation) new MutationObserver(() => queueMicrotask(cleanRawBoldMarkers)).observe(conversation, { childList: true, subtree: true, characterData: true });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
