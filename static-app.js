const CHAT_API = "https://cuberence-travel-api.vercel.app/api/v1/chat";

const state = {
  messages: [],
  busy: false,
  abortController: null,
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
    return `${value.currency ?? ""} ${value.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
  }
  return "—";
}

function toolLabel(part) {
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

function renderConversation() {
  el.conversation.replaceChildren();

  if (state.messages.length === 0) {
    const welcome = createNode("div", "welcome-card");
    welcome.append(createNode("div", "assistant-mark", "C"));
    const copy = createNode("div");
    copy.append(createNode("h2", null, "Start with the client’s travel intent."));
    copy.append(createNode("p", null, "For example: “My clients are flying from YUL to BEY October 10–20, staying 7–10 nights, and are open to a short European stopover.”"));
    const sample = createNode("button", "sample-prompt", "Use this example");
    sample.type = "button";
    sample.addEventListener("click", () => {
      el.input.value = "My clients are flying from YUL to BEY October 10–20, staying 7–10 nights, and are open to a short European stopover.";
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

function renderWorkspace() {
  const discoveryPart = latestToolPart("tool-discovery");
  const pricingPart = latestToolPart("tool-pricing");
  const discovery = discoveryPart?.output;
  const pricing = pricingPart?.output;
  const input = discoveryPart?.input;

  const fallbackCodes = [...allUserText().matchAll(/\b[A-Z]{3}\b/g)].map((match) => match[0]);
  const origin = input?.origin ?? fallbackCodes[0] ?? "Not set";
  const destination = input?.destination ?? fallbackCodes[1] ?? "Not set";

  el.intentOrigin.textContent = origin;
  el.intentDestination.textContent = destination;
  el.workspaceRoute.textContent = origin !== "Not set" || destination !== "Not set" ? `${origin} → ${destination}` : "New trip";

  if (input?.departureWindow?.from && input?.departureWindow?.to) {
    el.intentDates.textContent = `${input.departureWindow.from} → ${input.departureWindow.to}`;
  } else {
    el.intentDates.textContent = "Conversation context";
  }

  if (input?.destinationStay?.minNights && input?.destinationStay?.maxNights) {
    el.intentStay.textContent = `${input.destinationStay.minNights}–${input.destinationStay.maxNights} nights`;
  } else {
    el.intentStay.textContent = "Conversation context";
  }

  const hubs = Array.isArray(discovery?.hubs) ? discovery.hubs : [];
  const candidates = Array.isArray(pricing?.candidates) ? pricing.candidates : [];

  const priced = pricing?.phase === "completed";
  const discovered = discovery?.phase === "completed";
  el.workspaceStatus.textContent = priced ? "Priced" : discovered ? "Discovered" : "Planning";
  el.discoveryBadge.textContent = discovered ? `${hubs.length} hubs` : discoveryPart ? "Running" : "Not run";
  el.pricingBadge.textContent = priced ? `${candidates.length} candidates` : pricingPart ? "Running" : "Not run";

  el.discoveryContent.replaceChildren();
  if (hubs.length) {
    const list = createNode("div", "hub-list");
    for (const hub of hubs.slice(0, 18)) {
      const card = createNode("article", "hub-card");
      const top = createNode("div", "hub-card-top");
      top.append(createNode("strong", null, hub.city ?? hub.id ?? "Hub"));
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

  el.pricingContent.replaceChildren();
  if (candidates.length) {
    const list = createNode("div", "candidate-list");
    for (const candidate of candidates.slice(0, 14)) {
      const card = createNode("article", "candidate-card");
      const top = createNode("div", "candidate-top");
      const left = createNode("div");
      left.append(createNode("strong", null, candidate.hub?.city ?? candidate.hub?.id ?? pricing?.selectedHubs?.[0] ?? "Stopover"));
      left.append(createNode("span", null, candidate.strategy ?? pricing?.strategy ?? ""));
      top.append(left);
      top.append(createNode("b", null, money(candidate.totalPrice)));
      card.append(top);
      const facts = createNode("div", "candidate-facts");
      facts.append(createNode("span", null, `${candidate.hubNights ?? "—"} hub nights`));
      facts.append(createNode("span", null, `${candidate.usableCityHours ?? "—"} usable hours`));
      facts.append(createNode("span", null, `${candidate.destinationNights ?? "—"} destination nights`));
      card.append(facts);
      if (candidate.baselineDelta != null) card.append(createNode("small", null, `Vs baseline: ${money(candidate.baselineDelta)}`));
      list.append(card);
    }
    el.pricingContent.append(list);
  } else {
    const empty = createNode("div", "empty-workspace");
    empty.append(createNode("strong", null, pricing?.message ?? "No pricing results yet"));
    empty.append(createNode("p", null, "Choose one or more discovered hubs and a pricing strategy in the conversation."));
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
