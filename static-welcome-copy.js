(() => {
  const SAMPLE_PROMPT = "My clients are flying from YUL to BEY 2026 October 10–15, staying 20–22 nights, and are open to a short European stopover.";

  function applyWelcomeCopy() {
    const card = document.querySelector(".welcome-card");
    if (!card) return;

    const heading = card.querySelector("h2");
    const example = card.querySelector("p");
    const button = card.querySelector(".sample-prompt");

    if (heading) heading.textContent = "Start with the client’s travel intent.";
    if (example) example.textContent = `For example: “${SAMPLE_PROMPT}”`;

    if (button) {
      button.textContent = "Use this example";
      if (!button.dataset.welcomeCopyBound) {
        button.dataset.welcomeCopyBound = "true";
        button.addEventListener("click", () => {
          const input = document.getElementById("message-input");
          if (!input) return;
          input.value = SAMPLE_PROMPT;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.focus();
        });
      }
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
