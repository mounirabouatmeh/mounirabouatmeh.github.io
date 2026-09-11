(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;
  const { s, money, candidateName, candidateStatus, effectiveCandidate, evaluation, syncFns, queue } = C;
  const SAMPLE = "I have a client: 1 adult flying from YUL to BEY 2026 October 10–15, staying 20–22 nights, and is open to a short European stopover. Economy class, pricing in CAD.";
  const scroll = { active: false, writes: 0, timer: null };

  function selectionMessage(candidate, score) {
    const status = candidateStatus(candidate);
    return [
      "I selected this Stayover candidate for Luna provisional analysis.",
      `Candidate ID: ${candidate.id}`,
      s.pricingId ? `Pricing ID: ${s.pricingId}` : null,
      `Hub: ${candidateName(candidate)}`,
      `Pricing status: ${status}`,
      `Hub stay: ${candidate.hubNights ?? "—"} night${candidate.hubNights === 1 ? "" : "s"}`,
      `Usable city time: ${candidate.usableCityHours ?? "—"} hours`,
      status === "CONFIRMED" ? `Confirmed total: ${money(effectiveCandidate(candidate).totalPrice)}` : `Indicative total: ${money(candidate.totalPrice)}`,
      candidate.baselineDelta ? `Baseline delta: ${money(candidate.baselineDelta)}` : null,
      score?.overallScore != null ? `Stayover evaluation: ${score.overallScore}/100 (${score.recommendation ?? ""})` : null,
      "Use the exact candidate and Stayover Evaluation already returned in this session. Do not rerun Baseline, Discovery, or Indicative Pricing. For a PROXY candidate, candidate.exactSchedule is the flight-schedule truth; Sabre proxy offers are economic evidence only.",
      status === "PROXY"
        ? "This selection is not, by itself, a request to exact-price the trip. First analyze it against the current candidate set. If you provisionally recommend it, state: “Recommended by Luna — exact fare confirmation required.” Only then should exact confirmation run for this one candidate; never bulk-confirm alternatives."
        : "Explain whether this candidate remains the best overall journey using the confirmed fare and exact flights already available.",
    ].filter(Boolean).join("\n");
  }

  function installScrollGuard() {
    const conversation = document.getElementById("conversation");
    if (!conversation || conversation.dataset.issue23ScrollGuard) return;
    let prototype = conversation;
    let descriptor;
    while (prototype && !descriptor) {
      descriptor = Object.getOwnPropertyDescriptor(prototype, "scrollTop");
      prototype = Object.getPrototypeOf(prototype);
    }
    if (!descriptor?.get || !descriptor?.set) return;
    try {
      Object.defineProperty(conversation, "scrollTop", {
        configurable: true,
        get: () => descriptor.get.call(conversation),
        set: (value) => {
          if (!scroll.active || scroll.writes === 0) {
            descriptor.set.call(conversation, value);
            if (scroll.active) scroll.writes += 1;
          }
        },
      });
      conversation.dataset.issue23ScrollGuard = "true";
    } catch { /* The observer-loop removal remains the primary stability fix. */ }
  }

  function activateScrollGuard() {
    if (scroll.timer) clearTimeout(scroll.timer);
    scroll.active = true;
    scroll.writes = 0;
  }

  function releaseScrollGuard() {
    if (scroll.timer) clearTimeout(scroll.timer);
    scroll.timer = setTimeout(() => {
      scroll.active = false;
      scroll.writes = 0;
      scroll.timer = null;
    }, 250);
  }
  C.releaseScrollGuard = releaseScrollGuard;

  function sendSelection(candidateId) {
    if (!candidateId || candidateId !== s.selectedCandidateId || candidateId === s.lastSentCandidateId || s.streamBusy) return;
    const candidate = s.pricing?.candidates?.find((item) => item?.id === candidateId);
    const input = document.getElementById("message-input");
    const form = document.getElementById("composer");
    if (!candidate || !input || !form) return;
    s.lastSentCandidateId = candidateId;
    s.phases.summary = "running";
    s.phases.final = "waiting";
    activateScrollGuard();
    input.value = selectionMessage(candidate, evaluation(candidateId));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.requestSubmit();
    queue();
  }

  function syncWelcome() {
    const card = document.querySelector("#conversation .welcome-card");
    if (!card) return;
    const paragraph = card.querySelector("p");
    const copy = `For example: “${SAMPLE}”`;
    if (paragraph && paragraph.textContent !== copy) paragraph.textContent = copy;
    const button = card.querySelector(".sample-prompt");
    if (!button || button.dataset.issue23Bound) return;
    button.dataset.issue23Bound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const input = document.getElementById("message-input");
      if (!input) return;
      input.value = SAMPLE;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }, true);
  }

  function bindPricing() {
    const pricing = document.getElementById("pricing-content");
    if (!pricing) return;
    pricing.addEventListener("change", (event) => {
      const checkbox = event.target.closest?.(".issue23-itinerary-checkbox");
      if (!checkbox) return;
      const candidateId = checkbox.closest(".interactive-candidate")?.dataset.candidateId;
      if (!candidateId) return;
      if (checkbox.checked) {
        s.selectedCandidateId = candidateId;
        s.lastSentCandidateId = null;
        queue();
        sendSelection(candidateId);
      } else if (s.selectedCandidateId === candidateId) {
        s.selectedCandidateId = null;
        s.lastSentCandidateId = null;
        queue();
      }
    });
    pricing.addEventListener("click", (event) => {
      if (!event.target.closest?.(".issue23-selection-control") && event.target.closest?.(".interactive-candidate,.pricing-filter")) queue();
    }, true);
    pricing.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && event.target.closest?.(".interactive-candidate")) queue();
    }, true);
  }

  syncFns.push(syncWelcome);
  const start = () => {
    installScrollGuard();
    bindPricing();
    syncWelcome();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
