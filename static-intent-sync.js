(() => {
  function latestStructuredInput() {
    if (typeof latestToolPart !== "function") return null;
    return latestToolPart("tool-discovery")?.input ?? latestToolPart("tool-baseline")?.input ?? null;
  }

  function setText(id, value) {
    if (value == null) return;
    const element = document.getElementById(id);
    if (element && element.textContent !== value) element.textContent = value;
  }

  function addDays(isoDate, days) {
    if (typeof isoDate !== "string" || !Number.isFinite(days)) return null;
    const date = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function syncIntent() {
    const input = latestStructuredInput();
    if (!input) return;

    if (input.origin) setText("intent-origin", input.origin);
    if (input.destination) setText("intent-destination", input.destination);
    if (input.origin && input.destination) setText("workspace-route", `${input.origin} → ${input.destination}`);

    const from = input.departureWindow?.from;
    const to = input.departureWindow?.to;
    if (from && to) setText("intent-dates", `${from} → ${to}`);

    const minNights = Number(input.destinationStay?.minNights);
    const maxNights = Number(input.destinationStay?.maxNights);
    if (Number.isFinite(minNights) && Number.isFinite(maxNights)) {
      setText("intent-stay", `${minNights}–${maxNights} nights`);
      if (from && to) {
        const earliest = addDays(from, minNights);
        const latest = addDays(to, maxNights);
        if (earliest && latest) setText("intent-return", `${earliest} → ${latest}`);
      }
    }
  }

  function start() {
    syncIntent();
    const conversation = document.getElementById("conversation");
    if (!conversation) return;
    new MutationObserver(() => queueMicrotask(syncIntent)).observe(conversation, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
