(() => {
  let scheduled = false;

  function decorateCompletedPricing() {
    scheduled = false;
    const conversation = document.getElementById("conversation");
    if (!conversation) return;

    for (const box of conversation.querySelectorAll(".tool-progress")) {
      const text = (box.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!/pricing complete\.?/i.test(text)) continue;

      if (!box.classList.contains("tool-complete")) box.classList.add("tool-complete");

      const pulse = box.querySelector(".pulse-dot");
      if (pulse) {
        pulse.className = "complete-check";
        pulse.textContent = "✓";
        pulse.setAttribute("aria-label", "Completed");
      }
    }
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorateCompletedPricing);
  }

  function start() {
    decorateCompletedPricing();
    const conversation = document.getElementById("conversation");
    if (!conversation) return;
    new MutationObserver(scheduleDecorate)
      .observe(conversation, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
