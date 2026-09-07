(() => {
  const stageOrder = ["baseline", "discovery", "pricing"];
  const stageNumbers = { baseline: "1", discovery: "2", pricing: "3" };

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
      running: { icon: "•", status: "Running" },
      complete: { icon: "✓", status: "Complete" },
      ready: { icon: "→", status: stage === "pricing" ? "Select hub" : "Next" },
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

    const states = { baseline: "waiting", discovery: "waiting", pricing: "waiting" };
    for (const box of conversation.querySelectorAll(".tool-progress")) {
      const stage = stageForBox(box);
      if (!stage) continue;
      states[stage] = stateForBox(box, stage);
    }

    if (states.baseline === "complete" && states.discovery === "waiting") states.discovery = "ready";
    if (states.discovery === "complete" && states.pricing === "waiting") states.pricing = "ready";

    const guidance = document.getElementById("composer-guidance")?.textContent ?? "";
    if (states.baseline === "waiting" && /currency/i.test(guidance)) {
      setStep("baseline", "ready", "Choose currency");
    } else {
      setStep("baseline", states.baseline);
    }
    setStep("discovery", states.discovery);
    setStep("pricing", states.pricing);
    updateConnectors(states);
  }

  function start() {
    updateProgress();
    const conversation = document.getElementById("conversation");
    if (!conversation) return;
    new MutationObserver(() => queueMicrotask(updateProgress))
      .observe(conversation, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
