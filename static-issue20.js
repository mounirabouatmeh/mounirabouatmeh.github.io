(() => {
  const MIN_HEIGHT = 52;
  const MAX_HEIGHT = 120;

  function resizeComposerInput() {
    const input = document.getElementById("message-input");
    if (!input) return;

    input.style.height = "auto";
    const nextHeight = Math.max(MIN_HEIGHT, Math.min(input.scrollHeight, MAX_HEIGHT));
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }

  function start() {
    const input = document.getElementById("message-input");
    const form = document.getElementById("composer");
    if (!input) return;

    input.addEventListener("input", resizeComposerInput);
    window.addEventListener("resize", resizeComposerInput);
    form?.addEventListener("submit", () => requestAnimationFrame(resizeComposerInput));
    resizeComposerInput();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();