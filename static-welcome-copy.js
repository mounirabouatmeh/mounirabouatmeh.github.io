(() => {
  function applyWelcomeCopy() {
    const card = document.querySelector(".welcome-card");
    if (!card) return;

    const heading = card.querySelector("h2");
    const button = card.querySelector(".sample-prompt");

    // Issue #16 owns the sample prompt text and click behavior. This helper only
    // owns the stable heading/button labels so multiple MutationObservers never
    // compete over the same DOM content.
    if (heading && heading.textContent !== "Start with the client’s travel intent.") {
      heading.textContent = "Start with the client’s travel intent.";
    }
    if (button && button.textContent !== "Use this example") {
      button.textContent = "Use this example";
    }
  }

  function start() {
    applyWelcomeCopy();
    const conversation = document.getElementById("conversation");
    if (!conversation) return;
    new MutationObserver(() => queueMicrotask(applyWelcomeCopy)).observe(conversation, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
