(() => {
  const stageOrder = ["baseline", "discovery", "hubselected", "pricing", "summary"];
  const stageNumbers = { baseline: "1", discovery: "2", hubselected: "3", pricing: "4", summary: "5" };

  function stageForBox(box) {
    const label = box.querySelector(".tool-progress-copy strong")?.textContent ?? "";
    const detail = box.querySelector(".tool-progress-copy span")?.textContent ?? "";
    const text = `${label} ${detail}`.toLowerCase();

    if (/baseline|standard round-trip|standard trip/.test(text)) return "baseline";
    if (/discovery/.test(text)) return "discovery";
    if (/pricing/.test(text)) return "pricing";
    return null;
  }

  function stateForBox(box, stage) {
    const text = box.textContent?.toLowerCase() ?? "";
    if (box.classList.contains("tool-error")) return "error";
    if (box.classList.contains("tool-complete") || text.includes(`${stage} complete`)) return "complete";
    return "running";
  }

  function latestStageBox(stage) {
    const boxes = [...document.querySelectorAll("#conversation .tool-progress")]
      .filter((box) => stageForBox(box) === stage);
    return boxes.length ? boxes[boxes.length - 1] : null;
  }

  function latestUserBubble() {
    const bubbles = document.querySelectorAll("#conversation .message-row.user .user-bubble");
    return bubbles.length ? bubbles[bubbles.length - 1] : null;
  }

  function appearsAfter(node, reference) {
    if (!node || !reference) return false;
    return Boolean(reference.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function discoveredHubTerms() {
    const terms = [];
    for (const card of document.querySelectorAll("#discovery-content .hub-card")) {
      const city = card.querySelector("strong")?.textContent?.trim().toLowerCase();
      if (city) terms.push(city);

      const detail = card.querySelector("small")?.textContent ?? "";
      for (const code of detail.match(/\b[A-Z]{3}\b/g) ?? []) terms.push(code.toLowerCase());
    }
    return [...new Set(terms)];
  }

  function mentionsHubSelection(text) {
    const normalized = (text ?? "").trim().toLowerCase();
    if (!normalized) return false;

    const hasHub = discoveredHubTerms().some((term) => normalized.includes(term));
    if (!hasHub) return false;

    return /\b(price|try|check|use|switch|change|select|choose|test|run)\b/.test(normalized)
      || /\bwhat about\b/.test(normalized);
  }

  function asksToRevisitHubs(text) {
    const normalized = (text ?? "").trim().toLowerCase();
    if (!normalized) return false;

    if (/\b(another|different|other)\s+(hub|stopover|city)\b/.test(normalized)) return true;
    return mentionsHubSelection(normalized);
  }

  function hasSelectedHub() {
    if (document.querySelector("#selected-hubs-content .selected-hub-chip")) return true;
    return Boolean(latestStageBox("pricing"));
  }

  function setStep(stage, state, statusOverride = null) {
    const step = document.querySelector(`.trip-progress-step[data-stage="${stage}"]`);
    if (!step) return;

    const icon = step.querySelector(".trip-progress-icon");
    const status = step.querySelector(".trip-progress-status");
    if (!icon || !status) return;

    step.classList.remove("is-waiting", "is-running", "is-complete", "is-ready", "is-error", "is-current");
    step.classList.add(`is-${state}`);

    const display = {
      waiting: { icon: stageNumbers[stage], status: "Waiting" },
      running: { icon: "•", status: stage === "summary" ? "Summarizing" : "Running" },
      complete: { icon: "✓", status: stage === "hubselected" ? "Selected" : "Complete" },
      ready: {
        icon: "→",
        status: stage === "discovery"
          ? "Review hubs"
          : stage === "hubselected"
            ? "Select hub"
            : stage === "pricing"
              ? "Ready to price"
              : stage === "summary"
                ? "Summarize"
                : "Next",
      },
      error: { icon: "!", status: "Needs attention" },
    }[state];

    icon.textContent = display.icon;
    status.textContent = statusOverride ?? display.status;
    if (state === "running" || state === "ready" || state === "error") step.classList.add("is-current");
  }

  function updateConnectors(states) {
    const connectors = document.querySelectorAll(".trip-progress-connector");
    connectors.forEach((connector, index) => {
      const priorStage = stageOrder[index];
      connector.classList.toggle("is-complete", states[priorStage] === "complete");
    });
  }

  function updateProgress() {
    const conversation = document.getElementById("conversation");
    if (!conversation) return;

    const states = {
      baseline: "waiting",
      discovery: "waiting",
      hubselected: "waiting",
      pricing: "waiting",
      summary: "waiting",
    };

    for (const stage of ["baseline", "discovery", "pricing"]) {
      const box = latestStageBox(stage);
      if (box) states[stage] = stateForBox(box, stage);
    }

    const baselineBox = latestStageBox("baseline");
    const discoveryBox = latestStageBox("discovery");
    const pricingBox = latestStageBox("pricing");

    // A new upstream run invalidates the visible downstream workflow position,
    // while historical results remain available in the conversation/workspace.
    if (baselineBox && discoveryBox && appearsAfter(baselineBox, discoveryBox) && states.baseline !== "complete") {
      states.discovery = "waiting";
      states.hubselected = "waiting";
      states.pricing = "waiting";
    }
    if (discoveryBox && pricingBox && appearsAfter(discoveryBox, pricingBox) && states.discovery !== "complete") {
      states.hubselected = "waiting";
      states.pricing = "waiting";
    }

    if (states.baseline === "complete" && states.discovery === "waiting") states.discovery = "ready";

    const latestUser = latestUserBubble();
    const userAfterDiscovery = discoveryBox && latestUser && appearsAfter(latestUser, discoveryBox);
    const userAfterPricing = pricingBox && latestUser && appearsAfter(latestUser, pricingBox);
    const revisitingHubs = Boolean(userAfterPricing && asksToRevisitHubs(latestUser.textContent));
    const currentSelectionRequest = Boolean(userAfterDiscovery && !userAfterPricing && mentionsHubSelection(latestUser.textContent));

    if (revisitingHubs) {
      // A request for another hub intentionally moves the workflow back to Discovery.
      states.discovery = "ready";
      states.hubselected = "waiting";
      states.pricing = "waiting";
      states.summary = "waiting";
    } else {
      if (states.discovery === "complete") {
        states.hubselected = hasSelectedHub() || currentSelectionRequest ? "complete" : "ready";
      }

      if (states.hubselected === "complete" && states.pricing === "waiting") states.pricing = "ready";

      if (states.pricing === "complete") {
        const agentWorking = Boolean(conversation.querySelector(".live-status-inline"));
        states.summary = agentWorking ? "running" : "complete";
      }
    }

    if (states.pricing === "running" || states.pricing === "error") states.summary = "waiting";

    const guidance = document.getElementById("composer-guidance")?.textContent ?? "";
    if (states.baseline === "waiting" && /currency/i.test(guidance)) {
      setStep("baseline", "ready", "Choose currency");
    } else {
      setStep("baseline", states.baseline);
    }

    setStep("discovery", states.discovery, revisitingHubs ? "Review hubs" : null);
    setStep("hubselected", states.hubselected);
    setStep("pricing", states.pricing);
    setStep("summary", states.summary);
    updateConnectors(states);
  }

  function start() {
    updateProgress();
    const conversation = document.getElementById("conversation");
    const discovery = document.getElementById("discovery-content");
    const selectedHubs = document.getElementById("selected-hubs-content");

    const observer = new MutationObserver(() => queueMicrotask(updateProgress));
    if (conversation) {
      observer.observe(conversation, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    if (discovery) observer.observe(discovery, { childList: true, subtree: true, characterData: true });
    if (selectedHubs) observer.observe(selectedHubs, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
