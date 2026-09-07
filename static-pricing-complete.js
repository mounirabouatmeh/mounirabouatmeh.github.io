(() => {
  function decorateCompletedPricing() {
    const conversation = document.getElementById("conversation");
    if (!conversation) return;

    for (const box of conversation.querySelectorAll(".tool-progress")) {
      const copy = box.querySelector(".tool-progress-copy");
      const label = copy?.querySelector("strong");
      const detail = copy?.querySelector("span");
      if (!label || !detail) continue;

      const isPricing = label.textContent?.trim() === "Pricing";
      const isCompleted = /pricing complete/i.test(detail.textContent ?? "");
      if (!isPricing || !isCompleted) continue;

      if (!box.classList.contains("tool-complete")) box.classList.add("tool-complete");
      const pulse = box.querySelector(".pulse-dot");
      if (pulse) {
        pulse.className = "complete-check";
        pulse.textContent = "✓";
        pulse.setAttribute("aria-label", "Completed");
      }
    }
  }

  function start() {
    decorateCompletedPricing();
    const conversation = document.getElementById("conversation");
    if (!conversation) return;
    new MutationObserver(() => queueMicrotask(decorateCompletedPricing))
      .observe(conversation, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
