(() => {
  const SAMPLE_PROMPT = "I have a client: 1 adult flying from YUL to BEY 2026 October 10–15, staying 20–22 nights, and is open to a short European stopover. Economy class, pricing in CAD.";
  const previousFetch = globalThis.fetch.bind(globalThis);
  const state = {
    pricing: null,
    pricingId: null,
    selectedCandidateId: null,
    lastSentCandidateId: null,
    pendingTimer: null,
    syncQueued: false,
    composerQueued: false,
  };

  function isChatRequest(input) {
    const url = typeof input === "string" ? input : input?.url;
    return typeof url === "string" && url.includes("cuberence-travel-api.vercel.app/api/v1/chat");
  }

  function money(value) {
    if (!value || typeof value.amount !== "number") return "—";
    return `${value.currency ?? ""} ${value.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  }

  function latestEvaluation(candidateId) {
    const evaluations = Array.isArray(state.pricing?.evaluations) ? state.pricing.evaluations : [];
    return evaluations.find((item) => item?.candidateId === candidateId) ?? null;
  }

  function candidateName(candidate) {
    return candidate?.hub?.name ?? candidate?.hub?.city ?? candidate?.hub?.id ?? "Stayover";
  }

  function activeNightFilter() {
    const active = document.querySelector("#pricing-content .pricing-filter.active");
    const text = active?.textContent?.trim().toLowerCase() ?? "";
    if (text.startsWith("1 night")) return 1;
    if (text.startsWith("2 nights")) return 2;
    if (text.startsWith("3 nights")) return 3;
    return null;
  }

  function visibleCandidates() {
    const candidates = Array.isArray(state.pricing?.candidates) ? state.pricing.candidates : [];
    const nights = activeNightFilter();
    return nights == null ? candidates : candidates.filter((candidate) => Number(candidate?.hubNights) === nights);
  }

  function setComposer(placeholder, guidance, isNext = false) {
    const input = document.getElementById("message-input");
    const copy = document.getElementById("composer-guidance");
    if (!input || !copy) return;
    if (input.placeholder !== placeholder) input.placeholder = placeholder;
    if (copy.textContent !== guidance) copy.textContent = guidance;
    copy.classList.toggle("stage-next", Boolean(isNext));
  }

  function stageStatus(name) {
    const step = document.querySelector(`.trip-progress-step[data-stage="${name}"]`);
    return {
      running: Boolean(step?.classList.contains("is-running")),
      complete: Boolean(step?.classList.contains("is-complete")),
      ready: Boolean(step?.classList.contains("is-ready")),
      text: (step?.querySelector(".trip-progress-status")?.textContent ?? "").trim().toLowerCase(),
    };
  }

  function isSelectedItineraryMessage(text) {
    return /selected the following exact stayover pricing itinerary/i.test(text ?? "") || /candidate id:/i.test(text ?? "");
  }

  function latestUserText() {
    const bubbles = document.querySelectorAll("#conversation .message-row.user .user-bubble");
    return bubbles.length ? bubbles[bubbles.length - 1].textContent ?? "" : "";
  }

  function syncComposer() {
    state.composerQueued = false;
    const discovery = stageStatus("discovery");
    const hub = stageStatus("hubselected");
    const pricing = stageStatus("pricing");
    const analysis = stageStatus("summary");
    const busy = Boolean(document.querySelector("#conversation .live-status-inline"));
    const drilldown = isSelectedItineraryMessage(latestUserText());

    if (analysis.complete && busy && drilldown) {
      setComposer(
        "Luna is analyzing the selected itinerary…",
        "Detailed itinerary analysis is in progress. No new pricing search is being run.",
      );
      return;
    }

    if (analysis.complete && !busy) {
      setComposer(
        "Select a priced trip in the workspace, or ask a follow-up…",
        "Analysis & recommendation complete. Select a trip in Stayover pricing for a detailed breakdown.",
        true,
      );
      return;
    }

    if (analysis.running || (pricing.complete && busy)) {
      setComposer(
        "Cuberence is analyzing the priced stayovers…",
        "Stayover pricing is complete. Cuberence is preparing the analysis & recommendation.",
      );
      return;
    }

    if (pricing.running || pricing.text.includes("running")) {
      setComposer(
        "Stayover pricing is running…",
        "Cuberence is pricing travel options around the selected hub or hubs.",
      );
      return;
    }

    if (discovery.ready || discovery.text.includes("review hubs") || (discovery.complete && hub.ready)) {
      setComposer(
        "Select or change a hub, for example Milan or Rome…",
        "Next step: choose one or more feasible hubs for Stayover pricing.",
        true,
      );
      return;
    }

    if (hub.complete && pricing.ready) {
      setComposer(
        "Cuberence is ready to price the selected hub…",
        "Hub selection is complete. Stayover pricing is the next step.",
      );
    }
  }

  function queueComposerSync() {
    if (state.composerQueued) return;
    state.composerQueued = true;
    requestAnimationFrame(syncComposer);
  }

  function syncWelcomePrompt() {
    const welcome = document.querySelector("#conversation .welcome-card");
    if (!welcome) return;
    const paragraph = welcome.querySelector("p");
    if (paragraph) paragraph.textContent = `For example: “${SAMPLE_PROMPT}”`;

    const sample = welcome.querySelector(".sample-prompt");
    if (!sample || sample.dataset.issue16Bound === "true") return;
    sample.dataset.issue16Bound = "true";
    sample.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const input = document.getElementById("message-input");
      if (!input) return;
      input.value = SAMPLE_PROMPT;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }, true);
  }

  function syncToolLabels() {
    for (const box of document.querySelectorAll("#conversation .tool-progress")) {
      const label = box.querySelector(".tool-progress-copy strong");
      if (!label) continue;
      if (label.textContent === "Discovery") label.textContent = "Hub discovery";
      if (label.textContent === "Pricing") label.textContent = "Stayover pricing";
    }
  }

  function itineraryMessage(candidate, evaluation) {
    const parts = [
      "I selected the following exact Stayover pricing itinerary for detailed analysis.",
      `Candidate ID: ${candidate.id}`,
      state.pricingId ? `Pricing ID: ${state.pricingId}` : null,
      `Hub: ${candidateName(candidate)}`,
      `Hub stay: ${candidate.hubNights ?? "—"} night${candidate.hubNights === 1 ? "" : "s"}`,
      `Usable city time: ${candidate.usableCityHours ?? "—"} hours`,
      `Total price: ${money(candidate.totalPrice)}`,
      candidate.baselineDelta ? `Baseline delta: ${money(candidate.baselineDelta)}` : null,
      evaluation?.overallScore != null ? `Stayover evaluation: ${evaluation.overallScore}/100 (${evaluation.recommendation ?? ""})` : null,
      "Use the exact candidate and Stayover Evaluation already returned in the most recent completed Pricing result. Do not rerun Baseline, Hub discovery, or Stayover pricing. Explain the flight schedule and carriers, ticket structure, price versus baseline, usable city time, self-connect/separate-ticket implications, evaluation reasons and trade-offs, and the recommendation. Do not invent missing facts.",
    ].filter(Boolean);
    return parts.join("\n");
  }

  function sendSelectedCandidate(candidateId) {
    if (!candidateId || candidateId !== state.selectedCandidateId || candidateId === state.lastSentCandidateId) return;
    if (document.querySelector("#conversation .live-status-inline")) return;

    const candidate = (state.pricing?.candidates ?? []).find((item) => item?.id === candidateId);
    if (!candidate) return;
    const evaluation = latestEvaluation(candidateId);
    const input = document.getElementById("message-input");
    const form = document.getElementById("composer");
    if (!input || !form) return;

    state.lastSentCandidateId = candidateId;
    input.value = itineraryMessage(candidate, evaluation);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.requestSubmit();
  }

  function selectCandidate(candidateId) {
    if (state.pendingTimer) clearTimeout(state.pendingTimer);
    state.selectedCandidateId = candidateId;
    queuePricingSync();
    state.pendingTimer = setTimeout(() => {
      state.pendingTimer = null;
      if (state.selectedCandidateId === candidateId) sendSelectedCandidate(candidateId);
    }, 220);
  }

  function deselectCandidate(candidateId) {
    if (state.selectedCandidateId !== candidateId) return;
    state.selectedCandidateId = null;
    state.lastSentCandidateId = null;
    if (state.pendingTimer) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = null;
    }
    queuePricingSync();
  }

  function makeSelectionControl(candidate) {
    const control = document.createElement("label");
    control.className = "issue16-selection-control";
    control.addEventListener("click", (event) => event.stopPropagation());

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "issue16-itinerary-checkbox";
    checkbox.setAttribute("aria-label", `Select ${candidateName(candidate)} itinerary for Luna analysis`);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", (event) => {
      event.stopPropagation();
      if (checkbox.checked) selectCandidate(candidate.id);
      else deselectCandidate(candidate.id);
    });

    const copy = document.createElement("span");
    copy.className = "issue16-selection-copy";
    const strong = document.createElement("strong");
    strong.textContent = "Select this trip for Luna analysis";
    const small = document.createElement("small");
    small.textContent = "Selecting it sends this exact candidate ID back to the chat for a detailed breakdown.";
    copy.append(strong, small);
    control.append(checkbox, copy);
    return control;
  }

  function syncPricingCards() {
    state.syncQueued = false;
    if (!state.pricing || state.pricing.phase !== "completed") return;

    const cards = [...document.querySelectorAll("#pricing-content .interactive-candidate")];
    const candidates = visibleCandidates();
    cards.forEach((card, index) => {
      const candidate = candidates[index];
      if (!candidate?.id) return;
      card.dataset.candidateId = candidate.id;
      const selected = state.selectedCandidateId === candidate.id;
      card.classList.toggle("is-itinerary-selected", selected);

      const detail = card.querySelector(".candidate-detail");
      if (!detail) return;
      let control = detail.querySelector(".issue16-selection-control");
      if (!control) {
        control = makeSelectionControl(candidate);
        detail.prepend(control);
      }
      const checkbox = control.querySelector(".issue16-itinerary-checkbox");
      if (checkbox) checkbox.checked = selected;
    });
  }

  function queuePricingSync() {
    if (state.syncQueued) return;
    state.syncQueued = true;
    requestAnimationFrame(syncPricingCards);
  }

  function captureEvent(event) {
    if (event?.type === "tool-input-available" && event.toolName === "pricing") {
      state.pricing = null;
      state.pricingId = null;
      state.selectedCandidateId = null;
      state.lastSentCandidateId = null;
      if (state.pendingTimer) clearTimeout(state.pendingTimer);
      state.pendingTimer = null;
      queuePricingSync();
      queueComposerSync();
      return;
    }

    if (event?.type !== "tool-output-available" || !event.output?.pricingId) return;
    if (event.output.phase === "completed" && Array.isArray(event.output.candidates)) {
      state.pricing = event.output;
      state.pricingId = event.output.pricingId;
    }
    queuePricingSync();
    queueComposerSync();
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
        const data = raw.split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        try { captureEvent(JSON.parse(data)); } catch { /* Primary app owns stream errors. */ }
      }
    }
    queuePricingSync();
    queueComposerSync();
  }

  globalThis.fetch = async (...args) => {
    const response = await previousFetch(...args);
    if (isChatRequest(args[0]) && response.body) inspectStream(response.clone()).catch(() => {});
    return response;
  };

  function start() {
    syncWelcomePrompt();
    syncToolLabels();
    queuePricingSync();
    queueComposerSync();

    const conversation = document.getElementById("conversation");
    const pricing = document.getElementById("pricing-content");
    const tracker = document.getElementById("trip-progress");

    if (conversation) {
      new MutationObserver(() => queueMicrotask(() => {
        syncWelcomePrompt();
        syncToolLabels();
        queueComposerSync();
        if (state.selectedCandidateId !== state.lastSentCandidateId) sendSelectedCandidate(state.selectedCandidateId);
      })).observe(conversation, { childList: true, subtree: true, characterData: true });
    }

    if (pricing) {
      new MutationObserver(queuePricingSync).observe(pricing, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-pressed"],
      });
    }

    if (tracker) {
      new MutationObserver(queueComposerSync).observe(tracker, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
