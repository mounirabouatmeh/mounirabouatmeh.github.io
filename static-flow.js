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
    baselineExpanded: false,
    baselineConfirmation: null,
    baselineConfirmationPending: false,
    discoveryPhase: null,
    discoveryMode: null,
    discoveryValidationStatus: null,
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
    if (input?.returnWindow?.from && input?.returnWindow?.to) {
      return `${input.returnWindow.from} → ${input.returnWindow.to}`;
    }
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
      stay.textContent = `${input.destinationStay.minNights}–${input.destinationStay.maxNights} nights${input.returnWindow ? " · derived" : ""}`;
    }

    const derivedReturn = returnWindow(input);
    if (returns && derivedReturn) returns.textContent = derivedReturn;
  }

  function baselineAuthorizationMessage() {
    return [
      "I selected the standard Baseline for Luna analysis and exact price confirmation.",
      flowState.baselineId ? `Baseline ID: ${flowState.baselineId}` : null,
      "Advisor baseline confirmation authorization: YES",
      "This checkbox selection is my explicit authorization to analyze and exact-confirm this standard no-mini-destination trip only. Call baselineConfirmation exactly once for this baselineId. Do not start or rerun Hub Discovery, Indicative Pricing, or candidate confirmation as a side effect.",
    ].filter(Boolean).join("\n");
  }

  function sendBaselineAuthorization() {
    if (!flowState.baselineId || flowState.baselineConfirmationPending) return;
    const input = document.getElementById("message-input");
    const form = document.getElementById("composer");
    if (!input || !form) return;
    flowState.baselineConfirmationPending = true;
    input.value = baselineAuthorizationMessage();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.requestSubmit();
    renderFlow();
  }

  function renderBaselineSegment(segment) {
    const row = node("div", "baseline-segment-row");
    const carrier = [segment?.marketingCarrier, segment?.flightNumber].filter(Boolean).join("");
    row.append(node("strong", null, carrier || "Flight"));
    row.append(node("span", null, `${segment?.origin ?? "—"} → ${segment?.destination ?? "—"}`));
    row.append(node("small", null, `${segment?.departure?.replace?.("T", " ").slice?.(0, 16) ?? "—"} → ${segment?.arrival?.replace?.("T", " ").slice?.(0, 16) ?? "—"}`));
    return row;
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
        empty.append(node("p", null, flowState.baselineMessage ?? "Finding the cheapest standard trip. Luna will ask before any mini-destination exploration begins."));
      } else if (flowState.baselinePhase === "completed") {
        empty.append(node("strong", null, "No valid baseline found"));
        const warning = flowState.baselineWarnings[0];
        empty.append(node("p", null, warning ?? "The baseline search completed without a valid standard round trip for the requested dates."));
      } else {
        empty.append(node("strong", null, "Baseline not priced yet"));
        empty.append(node("p", null, "After trip intent and currency are confirmed, Cuberence prices the standard trip first. Luna then asks whether to explore 1–3 night mini-destinations."));
      }
      target.append(empty);
      return;
    }

    const card = node("article", `baseline-overview-card issue135-baseline-card ${flowState.baselineExpanded ? "is-expanded" : ""}`);
    const top = node("div", "baseline-overview-top");
    const copy = node("div");
    copy.append(node("span", "baseline-kicker", "Standard trip · no mini-destination"));
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

    const expand = node("button", "issue135-baseline-expand", flowState.baselineExpanded ? "Hide flight details" : "View flight details");
    expand.type = "button";
    expand.setAttribute("aria-expanded", String(flowState.baselineExpanded));
    expand.addEventListener("click", () => {
      flowState.baselineExpanded = !flowState.baselineExpanded;
      renderBaseline();
    });
    card.append(expand);

    if (flowState.baselineExpanded) {
      const details = node("div", "issue135-baseline-details");
      legs.forEach((leg, index) => {
        const legBlock = node("section", "issue135-baseline-leg");
        legBlock.append(node("b", null, `Leg ${index + 1}: ${leg?.origin ?? "—"} → ${leg?.destination ?? "—"}`));
        const segments = Array.isArray(leg?.segments) ? leg.segments : [];
        if (segments.length) segments.forEach((segment) => legBlock.append(renderBaselineSegment(segment)));
        else legBlock.append(node("span", null, `${leg?.departure ?? "—"} → ${leg?.arrival ?? "—"}`));
        details.append(legBlock);
      });
      card.append(details);
    }

    const selection = node("label", "issue23-selection-control issue135-baseline-selection");
    const checkbox = node("input", "issue135-baseline-checkbox");
    checkbox.type = "checkbox";
    checkbox.checked = flowState.baselineConfirmationPending || ["CONFIRMED", "EXACT_PRICE_UNAVAILABLE"].includes(flowState.baselineConfirmation?.status);
    checkbox.disabled = flowState.baselineConfirmationPending || Boolean(flowState.baselineConfirmation);
    const selectionCopy = node("span", "issue23-selection-copy");
    selectionCopy.append(node("strong", null, "Select this trip for Luna analysis & exact price confirmation"));
    selectionCopy.append(node("small", null, "The standard baseline is not exact-confirmed until you select it."));
    selection.append(checkbox, selectionCopy);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) sendBaselineAuthorization();
    });
    card.append(selection);

    if (flowState.baselineConfirmationPending) {
      card.append(node("p", "issue135-baseline-confirmation is-running", "Exact-confirming the selected standard trip…"));
    } else if (flowState.baselineConfirmation?.status === "CONFIRMED") {
      card.append(node("p", "issue135-baseline-confirmation is-confirmed", `Exact fare confirmed: ${money(flowState.baselineConfirmation.confirmedOffer?.price)}`));
    } else if (flowState.baselineConfirmation?.status === "EXACT_PRICE_UNAVAILABLE") {
      card.append(node("p", "issue135-baseline-confirmation is-unavailable", flowState.baselineConfirmation.message ?? "Exact matching fare unavailable; the original baseline remains the benchmark."));
    } else if (flowState.baselineConfirmation?.status === "EXACT_CHECK_FAILED") {
      card.append(node("p", "issue135-baseline-confirmation is-failed", flowState.baselineConfirmation.message ?? "Exact baseline confirmation needs attention."));
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
    } else if (flowState.discoveryPhase === "completed" && flowState.discoveryValidationStatus === "IDENTIFIED") {
      placeholder = "Choose one, several, or all identified hubs to validate…";
      message = "Hubs are identified, not yet validated. Tell Luna which hubs to check, or say “check all”.";
      isNextStep = true;
    } else if (["starting", "queued", "running"].includes(flowState.discoveryPhase)) {
      placeholder = flowState.discoveryMode === "VALIDATE" ? "Validating the selected hubs…" : "Identifying mini-destination hubs…";
      message = flowState.discoveryMode === "VALIDATE"
        ? "Cuberence is validating complete 1–3 night itineraries only for the hubs you selected."
        : "Cuberence is identifying route-relevant hubs. Feasibility will be checked only after you select hubs.";
    } else if (flowState.baselinePhase === "completed") {
      placeholder = "Answer Luna’s mini-destination question…";
      message = "Baseline is complete. Luna must get your confirmation before Step 3 can identify mini-destinations.";
      isNextStep = true;
    } else if (["starting", "queued", "running"].includes(flowState.baselinePhase)) {
      placeholder = "Baseline pricing is running…";
      message = "Cuberence is pricing the standard trip first. Luna will ask before any mini-destination exploration begins.";
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
      flowState.baselineMessage = "Preparing the standard-trip baseline first. Luna will ask before any mini-destination exploration begins.";
      renderFlow();
      return;
    }

    if (event?.type === "tool-input-available" && event.toolName === "discovery" && event.input) {
      flowState.intentInput = event.input;
      flowState.discoveryMode = event.input.mode ?? null;
      flowState.selectedHubIds = Array.isArray(event.input.selectedHubs) ? event.input.selectedHubs : [];
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

    if (output.baselineId && ["CONFIRMED", "EXACT_PRICE_UNAVAILABLE", "EXACT_CHECK_FAILED"].includes(output.status)) {
      flowState.baselineId = output.baselineId;
      flowState.baselineConfirmation = output;
      flowState.baselineConfirmationPending = false;
      renderFlow();
      return;
    }

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
      flowState.discoveryMode = output.mode ?? flowState.discoveryMode;
      flowState.discoveryValidationStatus = output.validationStatus ?? flowState.discoveryValidationStatus;
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