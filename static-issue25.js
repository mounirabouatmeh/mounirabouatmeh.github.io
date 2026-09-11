(() => {
  const STORAGE_KEY = "cuberence-luna-font-size";
  const DEFAULT_SIZE = 15;
  const MIN_SIZE = 13;
  const MAX_SIZE = 20;
  const STEP = 1;

  function clamp(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_SIZE;
    return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(number)));
  }

  function storedSize() {
    try {
      const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
      return stored == null ? DEFAULT_SIZE : clamp(stored);
    } catch {
      return DEFAULT_SIZE;
    }
  }

  function persist(size) {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, String(size));
    } catch {
      // Font sizing still works for the current page if storage is unavailable.
    }
  }

  function apply(size) {
    const chat = document.querySelector(".chat-panel");
    const minus = document.getElementById("luna-font-decrease");
    const plus = document.getElementById("luna-font-increase");
    const value = document.getElementById("luna-font-value");
    if (!chat) return;

    const next = clamp(size);
    chat.style.setProperty("--luna-response-font-size", `${next}px`);
    chat.dataset.lunaFontSize = String(next);
    if (value) value.textContent = `${next}px`;
    if (minus) minus.disabled = next <= MIN_SIZE;
    if (plus) plus.disabled = next >= MAX_SIZE;
    persist(next);
  }

  function start() {
    const minus = document.getElementById("luna-font-decrease");
    const plus = document.getElementById("luna-font-increase");
    if (!minus || !plus) return;

    apply(storedSize());
    minus.addEventListener("click", () => {
      const current = Number(document.querySelector(".chat-panel")?.dataset.lunaFontSize ?? DEFAULT_SIZE);
      apply(current - STEP);
    });
    plus.addEventListener("click", () => {
      const current = Number(document.querySelector(".chat-panel")?.dataset.lunaFontSize ?? DEFAULT_SIZE);
      apply(current + STEP);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
