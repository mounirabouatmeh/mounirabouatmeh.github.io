const CHAT_API = "https://cuberence-travel-api.vercel.app/api/v1/chat";

const state = {
  messages: [],
  busy: false,
  abortController: null,
  pricingNightFilter: "all",
  expandedCandidateIds: new Set(),
  lastPricingId: null,
};

const el = {
  conversation: document.getElementById("conversation"),
  form: document.getElementById("composer"),
  input: document.getElementById("message-input"),
  send: document.getElementById("send-button"),
  stop: document.getElementById("stop-button"),
  liveStatus: document.getElementById("live-status"),
  workspaceRoute: document.getElementById("workspace-route"),
  workspaceStatus: document.getElementById("workspace-status"),
  intentOrigin: document.getElementById("intent-origin"),
  intentDestination: document.getElementById("intent-destination"),
  intentDates: document.getElementById("intent-dates"),
  intentStay: document.getElementById("intent-stay"),
  intentReturn: document.getElementById("intent-return"),
  discoveryBadge: document.getElementById("discovery-badge"),
  discoveryContent: document.getElementById("discovery-content"),
  pricingBadge: document.getElementById("pricing-badge"),
  pricingContent: document.getElementById("pricing-content"),
};

function id(prefix = "msg") {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

function textParts(message) {
  return (message.parts ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
}

function allUserText() {
  return state.messages.filter((message) => message.role === "user").map(textParts).join(" ");
}

function latestUserText() {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    if (state.messages[index].role === "user") return textParts(state.messages[index]);
  }
  return "";
}

function latestToolPart(type) {
  for (let m = state.messages.length - 1; m >= 0; m -= 1) {
    const parts = state.messages[m].parts ?? [];
    for (let p = parts.length - 1; p >= 0; p -= 1) {
      if (parts[p].type === type) return parts[p];
    }
  }
  return null;
}

function money(value) {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof value.amount === "number") {
    return `${value.currency ?? ""} ${value.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  }
  return "—";
}

function toolLabel(part) {
  if (part.type === "tool-baseline") return "Baseline";
  if (part.type === "tool-discovery") return "Discovery";
  if (part.type === "tool-pricing") return "Pricing";
  return "Cuberence";
}

function toolStatusText(part) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return `Preparing ${toolLabel(part).toLowerCase()} request…`;
  }
  if (part.state === "output-error") return part.errorText || `${toolLabel(part)} failed.`;
  return part.output?.message || `${toolLabel(part)} is working…`;
}

function createNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function svgNode(tag, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function addDays(isoDate, days) {
  if (!isoDate || !Number.isFinite(days)) return null;
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (typeof value !== "string" || !value) return "—";
  return value.replace("T", " ").replace(/:00(?=[+-]|Z|$)/, "");
}

function renderConversation() {
  el.conversation.replaceChildren();

  if (state.messages.length === 0) {
    const welcome = createNode("div", "welcome-card");
    welcome.append(createNode("div", "assistant-mark", "C"));
    const copy = createNode("div");
    copy.append(createNode("h2", null, "Start with the client’s travel intent."));
    copy.append(createNode("p", null, "For example: “My clients are flying from YUL to BEY 2026 October 10–15, staying 20–22 nights, and are open to a short European stopover.”"));
    const sample = createNode("button", "sample-prompt", "Use this example");
    sample.type = "button";
    sample.addEventListener("click", () => {
      el.input.value = "My clients are flying from YUL to BEY 2026 October 10–15, staying 20–22 nights, and are open to a short European stopover.";
      el.input.focus();
      updateComposer();
    });
    copy.append(sample);
    welcome.append(copy);
    el.conversation.append(welcome);
  }

  for (const message of state.messages) {
    if (message.role === "user") {
      const row = createNode("div", "message-row user");
      row.append(createNode("div", "message-bubble user-bubble", textParts(message)));
      el.conversation.append(row);
      continue;
    }

    const text = textParts(message);
    if (text) {
      const row = createNode("div", "message-row assistant");
      row.append(createNode("div", "assistant-mark small", "C"));
      row.append(createNode("div", "message-bubble assistant-bubble", text));
      el.conversation.append(row);
    }

    for (const part of message.parts ?? []) {
      if (!part.type?.startsWith("tool-")) continue;
      const box = createNode("div", `tool-progress ${part.state === "output-error" ? "tool-error" : ""}`);
      box.append(createNode("span", "pulse-dot"));
      const copy = createNode("div", "tool-progress-copy");
      copy.append(createNode("strong", null, toolLabel(part)));
      copy.append(createNode("span", null, toolStatusText(part)));
      box.append(copy);
      el.conversation.append(box);
    }
  }

  if (state.busy) {
    const live = createNode("div", "live-status-inline");
    live.append(createNode("span", "pulse-dot"));
    live.append(createNode("span", null, "Cuberence is working…"));
    el.conversation.append(live);
  }

  requestAnimationFrame(() => {
    el.conversation.scrollTop = el.conversation.scrollHeight;
  });
}

function setConfirmedValue(element, value, confirmed) {
  if (!element) return;
  element.textContent = value;
  element.classList.toggle("confirmed-value", Boolean(confirmed));
}

function projectGeo(point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  return {
    x: ((point.lon + 180) / 360) * 720,
    y: ((90 - point.lat) / 180) * 320,
  };
}

function mapWorldBackground(svg) {
  const land = [
    "M42 74 L82 44 L145 46 L185 72 L171 108 L132 121 L116 154 L77 145 L54 114 Z",
    "M150 163 L184 176 L199 218 L184 278 L157 302 L143 255 L129 203 Z",
    "M337 62 L377 48 L410 67 L399 94 L365 105 L337 90 Z",
    "M355 111 L408 106 L435 145 L426 211 L397 258 L370 217 L348 165 Z",
    "M414 59 L486 43 L577 55 L647 91 L640 135 L592 146 L555 126 L522 151 L478 132 L453 100 Z",
    "M590 220 L633 207 L671 226 L660 264 L620 274 L590 249 Z",
    "M298 70 L320 60 L336 74 L328 93 L306 91 Z",
  ];
  for (const d of land) svg.append(svgNode("path", { d, class: "world-land" }));
  for (const x of [180, 360, 540]) svg.append(svgNode("line", { x1: x, y1: 12, x2: x, y2: 308, class: "world-grid" }));
  for (const y of [80, 160, 240]) svg.append(svgNode("line", { x1: 12, y1: y, x2: 708, y2: y, class: "world-grid" }));
}

function asksToRevisitHubs(hubs, priced) {
  if (!priced) return false;
  const text = latestUserText().toLowerCase();
  if (/\b(another|different|other)\s+(hub|stopover|city)\b/.test(text)) return true;
  const mentionsHub = hubs.some((hub) => {
    const terms = [hub.city, hub.id, ...(hub.airports ?? [])].filter(Boolean).map((value) => String(value).toLowerCase());
    return terms.some((term) => text.includes(term));
  });
  return mentionsHub && (/\b(price|try|check|use|switch|change|select|choose|test|run|instead)\b/.test(text) || /\bwhat about\b/.test(text));
}

function renderDiscoveryMap(discovery, hubs, selectedHubIds, priced) {
  const wrapper = createNode("section", "discovery-map-card");
  wrapper.setAttribute("aria-label", "Stayover hub map");
  const title = createNode("div", "discovery-map-heading");
  title.append(createNode("strong", null, "Possible stayover hubs"));

  const revisiting = asksToRevisitHubs(hubs, priced);
  const selected = revisiting ? new Set() : new Set(selectedHubIds);
  const visibleHubs = selected.size ? hubs.filter((hub) => selected.has(hub.id)) : hubs;
  title.append(createNode("span", null, selected.size ? `${visibleHubs.length} selected` : `${visibleHubs.length} feasible`));
  wrapper.append(title);

  const origin = discovery?.resolved?.origin;
  const destination = discovery?.resolved?.destination;
  const originPoint = projectGeo(origin?.coordinates);
  const destinationPoint = projectGeo(destination?.coordinates);
  const plottedHubs = visibleHubs.map((hub) => ({ hub, point: projectGeo(hub.coordinates) })).filter((item) => item.point);

  if (!originPoint && !destinationPoint && !plottedHubs.length) {
    const unavailable = createNode("div", "map-unavailable");
    unavailable.append(createNode("strong", null, "Map data unavailable for this discovery"));
    unavailable.append(createNode("p", null, "Run a new Discovery to use deterministic Cuberence city coordinates."));
    wrapper.append(unavailable);
    return wrapper;
  }

  const svg = svgNode("svg", { viewBox: "0 0 720 320", role: "img", "aria-label": "World map showing trip origin, destination and feasible stayover hubs" });
  svg.classList.add("discovery-world-map");
  mapWorldBackground(svg);

  if (originPoint && destinationPoint) {
    svg.append(svgNode("line", { x1: originPoint.x, y1: originPoint.y, x2: destinationPoint.x, y2: destinationPoint.y, class: "map-direct-route" }));
  }

  for (const { hub, point } of plottedHubs) {
    if (originPoint) svg.append(svgNode("line", { x1: originPoint.x, y1: originPoint.y, x2: point.x, y2: point.y, class: "map-hub-route" }));
    if (destinationPoint) svg.append(svgNode("line", { x1: point.x, y1: point.y, x2: destinationPoint.x, y2: destinationPoint.y, class: "map-hub-route" }));
    const group = svgNode("g", { class: selected.has(hub.id) ? "map-point selected-hub-point" : "map-point hub-point" });
    const circle = svgNode("circle", { cx: point.x, cy: point.y, r: selected.has(hub.id) ? 6 : 4.5 });
    const tooltip = svgNode("title");
    tooltip.textContent = `${hub.city ?? hub.id}${hub.airports?.length ? ` · ${hub.airports.join("/")}` : ""}`;
    group.append(circle, tooltip);
    if (selected.has(hub.id)) {
      const label = svgNode("text", { x: point.x + 8, y: point.y - 7, class: "map-label" });
      label.textContent = hub.city ?? hub.id;
      group.append(label);
    }
    svg.append(group);
  }

  const addEndpoint = (data, point, className) => {
    if (!data || !point) return;
    const group = svgNode("g", { class: `map-point ${className}` });
    const circle = svgNode("circle", { cx: point.x, cy: point.y, r: 6 });
    const label = svgNode("text", { x: point.x + 8, y: point.y + 4, class: "map-label endpoint-label" });
    label.textContent = data.name ?? data.id ?? "";
    group.append(circle, label);
    svg.append(group);
  };
  addEndpoint(origin, originPoint, "origin-point");
  addEndpoint(destination, destinationPoint, "destination-point");

  wrapper.append(svg);
  const legend = createNode("div", "map-legend");
  legend.append(createNode("span", "map-legend-origin", "Origin"));
  legend.append(createNode("span", "map-legend-hub", selected.size ? "Selected hub" : "Feasible hubs"));
  legend.append(createNode("span", "map-legend-destination", "Destination"));
  wrapper.append(legend);
  return wrapper;
}

function evaluationForCandidate(pricing, candidateId) {
  const evaluations = Array.isArray(pricing?.evaluations) ? pricing.evaluations : [];
  return evaluations.find((evaluation) => evaluation?.candidateId === candidateId) ?? null;
}

function recommendationLabel(value) {
  return String(value ?? "").toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function renderSegment(segment) {
  const row = createNode("div", "flight-segment-row");
  const carrier = [segment.marketingCarrier, segment.flightNumber].filter(Boolean).join("") || "Flight";
  row.append(createNode("strong", null, carrier));
  row.append(createNode("span", null, `${segment.origin ?? "—"} → ${segment.destination ?? "—"}`));
  row.append(createNode("span", null, `${formatDateTime(segment.departure)} → ${formatDateTime(segment.arrival)}`));
  return row;
}

function renderCandidateDetails(candidate, evaluation) {
  const detail = createNode("div", "candidate-detail");
  const overview = createNode("div", "candidate-detail-grid");
  const fact = (label, value, emphasized = false) => {
    const item = createNode("div", "candidate-detail-fact");
    item.append(createNode("span", null, label));
    item.append(createNode("strong", emphasized ? "result-value" : null, value));
    overview.append(item);
  };
  fact("Total", money(candidate.totalPrice), true);
  fact("Hub stay", `${candidate.hubNights ?? "—"} night${candidate.hubNights === 1 ? "" : "s"}`, true);
  fact("Usable city time", `${candidate.usableCityHours ?? "—"} hours`, true);
  fact("Destination stay", `${candidate.destinationNights ?? "—"} nights`);
  if (candidate.baselineDelta) fact("Vs baseline", money(candidate.baselineDelta), true);
  fact("Candidate status", candidate.candidateStatus ?? "VALID", candidate.candidateStatus === "VALID");
  if (candidate.facts?.returnSelfConnectMinutes != null) fact("Return self-connect", `${candidate.facts.returnSelfConnectMinutes} min`);
  fact("Ticket structure", candidate.strategy === "SPLIT" ? `${candidate.offers?.length ?? 0} separate priced ticket${candidate.offers?.length === 1 ? "" : "s"}` : candidate.strategy ?? "—");
  detail.append(overview);

  if (evaluation) {
    const evaluationBlock = createNode("div", "candidate-evaluation");
    const heading = createNode("div", "candidate-evaluation-heading");
    heading.append(createNode("strong", null, `${recommendationLabel(evaluation.recommendation)} · ${evaluation.overallScore ?? "—"}/100`));
    const labels = (evaluation.recommendationLabels ?? []).map(recommendationLabel).join(" · ");
    if (labels) heading.append(createNode("span", null, labels));
    evaluationBlock.append(heading);
    for (const reason of evaluation.reasons ?? []) evaluationBlock.append(createNode("p", null, reason));
    for (const tradeoff of evaluation.tradeoffs ?? []) evaluationBlock.append(createNode("p", "candidate-tradeoff", `Trade-off: ${tradeoff}`));
    detail.append(evaluationBlock);
  }

  const offers = Array.isArray(candidate.offers) ? candidate.offers : [];
  for (const [offerIndex, offer] of offers.entries()) {
    const ticket = createNode("section", "ticket-detail");
    const ticketHead = createNode("div", "ticket-detail-heading");
    ticketHead.append(createNode("strong", null, `Ticket ${offerIndex + 1}`));
    ticketHead.append(createNode("span", "result-value", money(offer.price)));
    ticket.append(ticketHead);
    const legs = Array.isArray(offer.legs) ? offer.legs : [];
    for (const [legIndex, leg] of legs.entries()) {
      const legBlock = createNode("div", "flight-leg-block");
      legBlock.append(createNode("b", null, `Leg ${legIndex + 1}: ${leg.origin ?? "—"} → ${leg.destination ?? "—"}`));
      const segments = Array.isArray(leg.segments) ? leg.segments : [];
      if (segments.length) {
        for (const segment of segments) legBlock.append(renderSegment(segment));
      } else {
        legBlock.append(createNode("span", null, `${formatDateTime(leg.departure)} → ${formatDateTime(leg.arrival)}`));
      }
      ticket.append(legBlock);
    }
    detail.append(ticket);
  }

  const risks = Array.isArray(candidate.risks) ? candidate.risks : [];
  if (risks.length) {
    const riskBlock = createNode("div", "candidate-risk-block");
    riskBlock.append(createNode("strong", null, "Validation / risk flags"));
    riskBlock.append(createNode("span", null, risks.map((risk) => String(risk).replaceAll("_", " ")).join(" · ")));
    detail.append(riskBlock);
  }
  return detail;
}

function renderPricingCandidates(pricing, candidates) {
  const container = createNode("div", "interactive-pricing");
  const filters = createNode("div", "pricing-filters");
  filters.setAttribute("aria-label", "Filter by hub nights");
  const choices = [
    { key: "all", label: "All" },
    { key: "1", label: "1 night" },
    { key: "2", label: "2 nights" },
    { key: "3", label: "3 nights" },
  ];
  for (const choice of choices) {
    const count = choice.key === "all" ? candidates.length : candidates.filter((candidate) => String(candidate.hubNights) === choice.key).length;
    const button = createNode("button", `pricing-filter ${state.pricingNightFilter === choice.key ? "active" : ""}`, `${choice.label} · ${count}`);
    button.type = "button";
    button.disabled = choice.key !== "all" && count === 0;
    button.setAttribute("aria-pressed", String(state.pricingNightFilter === choice.key));
    button.addEventListener("click", () => {
      state.pricingNightFilter = choice.key;
      renderWorkspace();
    });
    filters.append(button);
  }
  container.append(filters);

  const filtered = state.pricingNightFilter === "all"
    ? candidates
    : candidates.filter((candidate) => String(candidate.hubNights) === state.pricingNightFilter);

  const list = createNode("div", "candidate-list enhanced-candidate-list");
  for (const candidate of filtered) {
    const candidateId = candidate.id ?? `${candidate.hub?.id ?? "hub"}-${candidate.hubNights}-${candidate.totalPrice?.amount}`;
    const expanded = state.expandedCandidateIds.has(candidateId);
    const evaluation = evaluationForCandidate(pricing, candidate.id);
    const card = createNode("article", `candidate-card interactive-candidate ${expanded ? "expanded" : ""}`);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-expanded", String(expanded));

    const top = createNode("div", "candidate-top");
    const left = createNode("div");
    left.append(createNode("strong", "result-value", candidate.hub?.name ?? candidate.hub?.city ?? candidate.hub?.id ?? pricing?.selectedHubs?.[0] ?? "Stopover"));
    const subline = [candidate.strategy ?? pricing?.strategy, evaluation?.recommendation ? recommendationLabel(evaluation.recommendation) : null].filter(Boolean).join(" · ");
    left.append(createNode("span", null, subline));
    top.append(left);
    top.append(createNode("b", "candidate-price result-value", money(candidate.totalPrice)));
    card.append(top);

    const facts = createNode("div", "candidate-facts");
    facts.append(createNode("span", "result-value", `${candidate.hubNights ?? "—"} hub night${candidate.hubNights === 1 ? "" : "s"}`));
    facts.append(createNode("span", "result-value", `${candidate.usableCityHours ?? "—"} usable hours`));
    facts.append(createNode("span", null, `${candidate.destinationNights ?? "—"} destination nights`));
    if (evaluation?.overallScore != null) facts.append(createNode("span", null, `Stayover ${evaluation.overallScore}/100`));
    card.append(facts);
    if (candidate.baselineDelta != null) card.append(createNode("small", "result-value", `Vs baseline: ${money(candidate.baselineDelta)}`));
    card.append(createNode("span", "candidate-expand-hint", expanded ? "Hide flight details ↑" : "View flight details ↓"));
    if (expanded) card.append(renderCandidateDetails(candidate, evaluation));

    const toggle = () => {
      if (state.expandedCandidateIds.has(candidateId)) state.expandedCandidateIds.delete(candidateId);
      else state.expandedCandidateIds.add(candidateId);
      renderWorkspace();
    };
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      toggle();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
    list.append(card);
  }

  if (!filtered.length) {
    const empty = createNode("div", "empty-workspace compact-empty");
    empty.append(createNode("strong", null, `No ${state.pricingNightFilter}-night candidates`));
    empty.append(createNode("p", null, "Choose another hub-night filter to view available priced candidates."));
    container.append(empty);
  } else {
    container.append(list);
  }
  return container;
}

function renderWorkspace() {
  const baselinePart = latestToolPart("tool-baseline");
  const discoveryPart = latestToolPart("tool-discovery");
  const pricingPart = latestToolPart("tool-pricing");
  const discovery = discoveryPart?.output;
  const pricing = pricingPart?.output;
  const input = discoveryPart?.input ?? baselinePart?.input;

  const fallbackCodes = [...allUserText().matchAll(/\b[A-Z]{3}\b/g)].map((match) => match[0]);
  const origin = input?.origin ?? fallbackCodes[0] ?? "Not set";
  const destination = input?.destination ?? fallbackCodes[1] ?? "Not set";

  setConfirmedValue(el.intentOrigin, origin, origin !== "Not set");
  setConfirmedValue(el.intentDestination, destination, destination !== "Not set");
  el.workspaceRoute.textContent = origin !== "Not set" || destination !== "Not set" ? `${origin} → ${destination}` : "New trip";

  if (input?.departureWindow?.from && input?.departureWindow?.to) {
    setConfirmedValue(el.intentDates, `${input.departureWindow.from} → ${input.departureWindow.to}`, true);
  } else {
    setConfirmedValue(el.intentDates, "Conversation context", false);
  }

  if (input?.destinationStay?.minNights != null && input?.destinationStay?.maxNights != null) {
    setConfirmedValue(el.intentStay, `${input.destinationStay.minNights}–${input.destinationStay.maxNights} nights`, true);
    const earliest = addDays(input.departureWindow?.from, Number(input.destinationStay.minNights));
    const latest = addDays(input.departureWindow?.to, Number(input.destinationStay.maxNights));
    if (earliest && latest) setConfirmedValue(el.intentReturn, `${earliest} → ${latest}`, true);
  } else {
    setConfirmedValue(el.intentStay, "Conversation context", false);
    if (el.intentReturn && !el.intentReturn.classList.contains("confirmed-value")) setConfirmedValue(el.intentReturn, "Conversation context", false);
  }

  const hubs = Array.isArray(discovery?.hubs) ? discovery.hubs : [];
  const candidates = Array.isArray(pricing?.candidates) ? pricing.candidates : [];
  const selectedHubIds = pricingPart?.input?.selectedHubs ?? pricing?.selectedHubs ?? [];

  const priced = pricing?.phase === "completed";
  const discovered = discovery?.phase === "completed";
  if (pricing?.pricingId && pricing.pricingId !== state.lastPricingId) {
    state.lastPricingId = pricing.pricingId;
    state.pricingNightFilter = "all";
    state.expandedCandidateIds.clear();
  }

  el.workspaceStatus.textContent = priced ? "Priced" : discovered ? "Discovered" : "Planning";
  el.discoveryBadge.textContent = discovered ? `${hubs.length} hubs` : discoveryPart ? "Running" : "Not run";
  el.pricingBadge.textContent = priced ? `${candidates.length} candidates` : pricingPart ? "Running" : "Not run";

  el.discoveryContent.replaceChildren();
  if (hubs.length) {
    el.discoveryContent.append(renderDiscoveryMap(discovery, hubs, selectedHubIds, priced));
    const list = createNode("div", "hub-list");
    const selectedSet = new Set(selectedHubIds);
    const visibleCards = selectedSet.size && !asksToRevisitHubs(hubs, priced) ? hubs.filter((hub) => selectedSet.has(hub.id)) : hubs;
    for (const hub of visibleCards.slice(0, 18)) {
      const card = createNode("article", `hub-card ${selectedSet.has(hub.id) ? "selected-hub-card" : ""}`);
      const top = createNode("div", "hub-card-top");
      top.append(createNode("strong", selectedSet.has(hub.id) ? "result-value" : null, hub.city ?? hub.id ?? "Hub"));
      top.append(createNode("span", null, hub.countryCode ?? ""));
      card.append(top);
      const airports = Array.isArray(hub.airports) && hub.airports.length ? ` · ${hub.airports.join("/")}` : "";
      const nights = Array.isArray(hub.feasibleHubNights) ? `${hub.feasibleHubNights.join(", ")} night options` : "Feasible stopover";
      card.append(createNode("small", null, `${nights}${airports}`));
      list.append(card);
    }
    el.discoveryContent.append(list);
  } else {
    const empty = createNode("div", "empty-workspace");
    empty.append(createNode("strong", null, discovery?.message ?? "No hub results yet"));
    empty.append(createNode("p", null, "Live Cuberence discovery results will appear here as the conversation continues."));
    el.discoveryContent.append(empty);
  }

  const existingSummary = priced ? el.pricingContent.querySelector("[data-pricing-summary]") : null;
  el.pricingContent.replaceChildren();
  if (existingSummary) el.pricingContent.append(existingSummary);
  if (candidates.length) {
    el.pricingContent.append(renderPricingCandidates(pricing, candidates));
  } else {
    const empty = createNode("div", "empty-workspace");
    empty.append(createNode("strong", null, pricing?.message ?? "No pricing results yet"));
    empty.append(createNode("p", null, "Choose one or more discovered hubs in the conversation to run SPLIT pricing."));
    el.pricingContent.append(empty);
  }
}

function render() {
  renderConversation();
  renderWorkspace();
  updateComposer();
}

function updateComposer() {
  el.send.disabled = state.busy || !el.input.value.trim();
  el.send.hidden = state.busy;
  el.stop.hidden = !state.busy;
  el.input.disabled = state.busy;
  el.liveStatus.textContent = state.busy ? "Live agent connected" : "Ready";
}

function rebuildMaps(message) {
  const text = new Map();
  const tools = new Map();
  for (let i = 0; i < message.parts.length; i += 1) {
    const part = message.parts[i];
    if (part.type === "text" && part._streamId) text.set(part._streamId, i);
    if (part.type?.startsWith("tool-") && part.toolCallId) tools.set(part.toolCallId, i);
  }
  return { text, tools };
}

function applyChunk(message, chunk, streamState) {
  if (!chunk || typeof chunk.type !== "string") return;

  if (chunk.type === "start" && chunk.messageId) {
    message.id = chunk.messageId;
    return;
  }

  if (chunk.type === "start-step") {
    streamState.stepStart = message.parts.length;
    return;
  }

  if (chunk.type === "reset-step") {
    message.parts.splice(streamState.stepStart ?? message.parts.length);
    const rebuilt = rebuildMaps(message);
    streamState.text = rebuilt.text;
    streamState.tools = rebuilt.tools;
    return;
  }

  if (chunk.type === "text-start") {
    const part = { type: "text", text: "", _streamId: chunk.id };
    streamState.text.set(chunk.id, message.parts.length);
    message.parts.push(part);
    return;
  }

  if (chunk.type === "text-delta") {
    let index = streamState.text.get(chunk.id);
    if (index == null) {
      index = message.parts.length;
      streamState.text.set(chunk.id, index);
      message.parts.push({ type: "text", text: "", _streamId: chunk.id });
    }
    message.parts[index].text += chunk.delta ?? "";
    return;
  }

  if (chunk.type === "tool-input-start") {
    const part = {
      type: `tool-${chunk.toolName}`,
      toolCallId: chunk.toolCallId,
      state: "input-streaming",
      input: undefined,
      _inputText: "",
    };
    streamState.tools.set(chunk.toolCallId, message.parts.length);
    message.parts.push(part);
    return;
  }

  if (chunk.type === "tool-input-delta") {
    const index = streamState.tools.get(chunk.toolCallId);
    if (index != null) message.parts[index]._inputText = `${message.parts[index]._inputText ?? ""}${chunk.inputTextDelta ?? ""}`;
    return;
  }

  if (chunk.type === "tool-input-available" || chunk.type === "tool-input-error") {
    let index = streamState.tools.get(chunk.toolCallId);
    if (index == null) {
      index = message.parts.length;
      streamState.tools.set(chunk.toolCallId, index);
      message.parts.push({ type: `tool-${chunk.toolName}`, toolCallId: chunk.toolCallId });
    }
    const part = message.parts[index];
    part.type = `tool-${chunk.toolName}`;
    part.input = chunk.input;
    part.state = chunk.type === "tool-input-error" ? "output-error" : "input-available";
    if (chunk.errorText) part.errorText = chunk.errorText;
    return;
  }

  if (chunk.type === "tool-output-available" || chunk.type === "tool-output-error") {
    const index = streamState.tools.get(chunk.toolCallId);
    if (index == null) return;
    const part = message.parts[index];
    if (chunk.type === "tool-output-error") {
      part.state = "output-error";
      part.errorText = chunk.errorText;
    } else {
      part.state = "output-available";
      part.output = chunk.output;
      part.preliminary = Boolean(chunk.preliminary);
    }
    return;
  }

  if (chunk.type === "error") {
    message.parts.push({ type: "text", text: `Cuberence error: ${chunk.errorText}` });
  }
}

function cleanMessageForServer(message) {
  return {
    id: message.id,
    role: message.role,
    parts: (message.parts ?? []).map((part) => {
      const clean = { ...part };
      delete clean._streamId;
      delete clean._inputText;
      delete clean.preliminary;
      return clean;
    }),
  };
}

async function* readSse(response) {
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
      const rawEvent = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data = rawEvent.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (!data || data === "[DONE]") continue;
      yield JSON.parse(data);
    }
  }
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || state.busy) return;

  const userMessage = { id: id("user"), role: "user", parts: [{ type: "text", text: trimmed }] };
  state.messages.push(userMessage);
  const requestMessages = state.messages.map(cleanMessageForServer);
  const assistantMessage = { id: id("assistant"), role: "assistant", parts: [] };
  state.messages.push(assistantMessage);

  state.busy = true;
  state.abortController = new AbortController();
  el.input.value = "";
  render();

  const streamState = { text: new Map(), tools: new Map(), stepStart: 0 };

  try {
    const response = await fetch(CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: requestMessages }),
      signal: state.abortController.signal,
      mode: "cors",
      credentials: "omit",
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `HTTP ${response.status}`);
    }
    if (!response.body) throw new Error("Cuberence returned an empty stream.");

    for await (const chunk of readSse(response)) {
      applyChunk(assistantMessage, chunk, streamState);
      render();
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      assistantMessage.parts.push({ type: "text", text: `I couldn’t complete that request. ${error?.message ?? "Unknown error"}` });
    }
  } finally {
    state.busy = false;
    state.abortController = null;
    render();
  }
}

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(el.input.value);
});

el.input.addEventListener("input", updateComposer);
el.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    el.form.requestSubmit();
  }
});

el.stop.addEventListener("click", () => state.abortController?.abort());

render();
