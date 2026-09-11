(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;
  const { s, candidateName, candidateNumber, candidateStatus, canAuthorizeConfirmation, syncFns, queue } = C;
  const SAMPLE = "I have a client: 1 adult flying from YUL to BEY 2026 October 10–15, staying 20–22 nights, and is open to a short European stopover. Economy class, pricing in CAD.";
  const scroll = { active: false, writes: 0, timer: null };

  function confirmationAuthorizationMessage(candidate) {
    const number = candidateNumber(candidate);
    return [
      `I selected Candidate ${number ?? "—"} for Luna to confirm pricing.`,
      `Candidate ID: ${candidate.id}`,
      s.pricingId ? `Pricing ID: ${s.pricingId}` : null,
      `Hub: ${candidateName(candidate)}`,
      `Pricing status: ${candidateStatus(candidate)}`,
      "Advisor confirmation authorization: YES",
      "This checkbox selection is my explicit authorization to run exact flight and fare confirmation for this candidate only. Call the confirmation tool exactly once for this pricingId/candidateId. Do not rerun Baseline, Discovery, or Indicative Pricing, and do not confirm any other candidate unless I explicitly select it later.",
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
    } catch {
      // Removal of competing observer/state writers remains the primary stability protection.
    }
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

  function unselectOtherCheckboxes(candidateId) {
    document.querySelectorAll("#pricing-content .issue23-itinerary-checkbox").forEach((checkbox) => {
      const card = checkbox.closest(".interactive-candidate");
      if (card?.dataset.candidateId !== candidateId) checkbox.checked = false;
    });
  }

  function sendConfirmationAuthorization(candidateId) {
    if (!candidateId || candidateId !== s.selectedCandidateId || candidateId === s.lastSentCandidateId || s.streamBusy) return;
    const candidate = s.pricing?.candidates?.find((item) => item?.id === candidateId);
    const input = document.getElementById("message-input");
    const form = document.getElementById("composer");
    if (!candidate || !input || !form || !canAuthorizeConfirmation(candidate)) return;

    s.lastSentCandidateId = candidateId;
    s.confirmationAuthorizedPending = true;
    s.phases.summary = "complete";
    s.phases.confirmation = "ready";
    s.phases.final = "waiting";
    activateScrollGuard();

    input.value = confirmationAuthorizationMessage(candidate);
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
    if (!pricing || pricing.dataset.issue25ConfirmationBound) return;
    pricing.dataset.issue25ConfirmationBound = "true";

    pricing.addEventListener("click", (event) => {
      if (event.target.closest?.(".issue23-selection-control")) {
        event.stopPropagation();
        return;
      }
      if (event.target.closest?.(".interactive-candidate,.pricing-filter")) queue();
    }, true);

    pricing.addEventListener("keydown", (event) => {
      if (event.target.closest?.(".issue23-selection-control")) {
        event.stopPropagation();
        return;
      }
      if ((event.key === "Enter" || event.key === " ") && event.target.closest?.(".interactive-candidate")) queue();
    }, true);

    pricing.addEventListener("change", (event) => {
      const checkbox = event.target.closest?.(".issue23-itinerary-checkbox");
      if (!checkbox) return;
      const card = checkbox.closest(".interactive-candidate");
      const candidateId = card?.dataset.candidateId;
      const candidate = s.pricing?.candidates?.find((item) => item?.id === candidateId);
      if (!candidateId || !candidate) return;

      if (checkbox.checked) {
        if (!canAuthorizeConfirmation(candidate)) {
          checkbox.checked = false;
          queue();
          return;
        }
        unselectOtherCheckboxes(candidateId);
        s.selectedCandidateId = candidateId;
        s.lastSentCandidateId = null;
        queue();
        sendConfirmationAuthorization(candidateId);
      } else if (s.selectedCandidateId === candidateId && !s.streamBusy) {
        s.selectedCandidateId = null;
        s.lastSentCandidateId = null;
        s.confirmationAuthorizedPending = false;
        queue();
      }
    });
  }

  syncFns.push(syncWelcome);
  const start = () => {
    installScrollGuard();
    bindPricing();
    syncWelcome();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
