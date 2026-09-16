(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;
  const { s, stages, node, money, candidateName, candidateNumber, syncFns } = C;

  function step(stage, phase, override) {
    const el = document.querySelector(`.trip-progress-step[data-stage="${stage}"]`);
    if (!el) return;
    const p = ["waiting", "running", "complete", "ready", "error"].includes(phase) ? phase : "waiting";
    el.className = `trip-progress-step is-${p}${["running", "ready", "error"].includes(p) ? " is-current" : ""}`;
    const d = {
      waiting: [String(stages.indexOf(stage) + 1), "Waiting"],
      running: ["•", "Running"],
      complete: ["✓", "Complete"],
      ready: ["→", "Next"],
      error: ["!", "Needs attention"],
    }[p];
    const icon = el.querySelector(".trip-progress-icon");
    const status = el.querySelector(".trip-progress-status");
    if (icon) icon.textContent = d[0];
    if (status) status.textContent = override ?? d[1];
  }

  function tracker() {
    const p = { ...s.phases };
    if (s.pricing?.phase === "completed") p.pricing = "complete";
    if (p.pricing === "complete" && p.summary === "waiting") p.summary = s.streamBusy ? "running" : "ready";
    if (p.summary === "complete" && p.confirmation === "waiting") p.confirmation = "ready";
    if (["CONFIRMED", "EXACT_PRICE_UNAVAILABLE"].includes(s.confirmation?.status) && p.final === "waiting") {
      p.final = s.streamBusy ? "running" : s.reviewTextSeen ? "complete" : "ready";
    }

    step("intent", p.intent, p.intent === "complete" ? "Captured" : null);
    step("baseline", p.baseline);
    step("discovery", p.discovery, p.discovery === "ready" ? "Select hubs" : p.discovery === "complete" ? "Selected" : null);
    step("pricing", p.pricing, p.pricing === "complete" ? "Indicative" : null);
    step("summary", p.summary, p.summary === "running" ? "Analyzing" : p.summary === "complete" ? "Recommended" : null);
    step(
      "confirmation",
      p.confirmation,
      p.confirmation === "running"
        ? "Confirming"
        : p.confirmation === "complete"
          ? (s.confirmation?.status === "EXACT_PRICE_UNAVAILABLE" ? "Fare unavailable" : "Confirmed")
          : p.confirmation === "ready"
            ? "Select candidate"
            : p.confirmation === "error"
              ? "Select another"
              : null,
    );
    step("final", p.final, p.final === "running" ? "Reviewing" : p.final === "complete" ? "Final" : null);

    document.querySelectorAll(".trip-progress-connector").forEach((x, i) => {
      x.classList.toggle("is-complete", p[stages[i]] === "complete");
    });
  }

  function statusText() {
    if (!s.streamBusy) {
      if (s.phases.discovery === "ready") {
        return ["Hub discovery complete — select one or more hubs to price.", false];
      }
      if (s.phases.summary === "complete" && s.phases.confirmation === "ready") {
        return ["Luna analysis complete — select a candidate for exact confirmation.", false];
      }
      if (s.confirmation?.status === "EXACT_PRICE_UNAVAILABLE") {
        return ["Exact Sabre fare unavailable — the Cuberence schedule remains valid.", false];
      }
      if (s.phases.confirmation === "error") {
        return ["Exact confirmation hit a technical or validation problem.", false];
      }
      return ["Ready for the next instruction.", false];
    }
    if (s.phases.confirmation === "running") return ["Confirming the exact selected flights and fare…", true];
    if (s.confirmation?.status === "CONFIRMED") return ["Luna is reviewing the confirmed fare…", true];
    if (s.confirmation?.status === "EXACT_PRICE_UNAVAILABLE") return ["Luna is reviewing the valid schedule with unavailable exact fare…", true];
    if (s.confirmation?.status === "EXACT_CHECK_FAILED" || s.phases.confirmation === "error") return ["Luna is explaining the technical exact-check failure…", true];
    if (s.phases.pricing === "running") return ["Evaluating stayover options…", true];
    if (s.pricing?.phase === "completed") return ["Luna is analyzing the candidate set…", true];
    if (s.phases.discovery === "running") return ["Identifying feasible stayover hubs…", true];
    if (s.phases.baseline === "running") return ["Pricing the standard trip baseline…", true];
    return ["Cuberence is working…", true];
  }

  function status() {
    const bar = document.getElementById("processing-status");
    if (bar) {
      const [text, active] = statusText();
      const copy = bar.querySelector(".processing-status-copy");
      if (copy && copy.textContent !== text) copy.textContent = text;
      bar.classList.toggle("is-active", active);
      bar.setAttribute("aria-live", active ? "polite" : "off");
    }

    const ws = document.getElementById("workspace-status");
    if (!ws) return;
    if (["CONFIRMED", "EXACT_PRICE_UNAVAILABLE"].includes(s.confirmation?.status) && !s.streamBusy && s.reviewTextSeen) ws.textContent = "Final recommendation";
    else if (s.confirmation?.status === "CONFIRMED" && !s.streamBusy) ws.textContent = "Confirmed · Luna review pending";
    else if (s.confirmation?.status === "CONFIRMED") ws.textContent = "Confirmed · reviewing";
    else if (s.confirmation?.status === "EXACT_PRICE_UNAVAILABLE" && !s.streamBusy) ws.textContent = "Exact fare unavailable · Luna review pending";
    else if (s.confirmation?.status === "EXACT_PRICE_UNAVAILABLE") ws.textContent = "Exact fare unavailable · reviewing";
    else if (s.confirmation?.status === "EXACT_CHECK_FAILED" || s.phases.confirmation === "error") ws.textContent = "Exact check needs attention";
    else if (s.phases.confirmation === "running") ws.textContent = "Confirming exact fare";
    else if (s.phases.discovery === "ready") ws.textContent = "Waiting for hub selection";
    else if (s.phases.summary === "complete" && s.phases.confirmation === "ready") ws.textContent = "Waiting for advisor selection";
    else if (s.pricing?.phase === "completed") ws.textContent = "Luna analysis";
  }

  function setComposer(placeholder, guidance, isNext = false) {
    const input = document.getElementById("message-input");
    const copy = document.getElementById("composer-guidance");
    if (!input || !copy) return;
    if (input.placeholder !== placeholder) input.placeholder = placeholder;
    if (copy.textContent !== guidance) copy.textContent = guidance;
    copy.classList.toggle("stage-next", Boolean(isNext));
  }

  function composer() {
    if (s.phases.discovery === "ready" && !s.streamBusy) {
      setComposer(
        "Select one or more hubs, for example: Geneva and Paris…",
        "Hub discovery is complete. Choose one or more hubs from the results; Luna will not start indicative pricing until you make that selection.",
        true,
      );
      return;
    }

    if (s.phases.confirmation === "running") {
      setComposer(
        "Exact flight and fare confirmation is running…",
        "Cuberence is validating only the candidate you explicitly selected for confirmation.",
      );
      return;
    }

    if (s.confirmation?.status === "CONFIRMED" && s.streamBusy) {
      setComposer(
        "Luna is reviewing the confirmed fare…",
        "Exact flight and fare confirmation is complete. Luna is re-evaluating the recommendation using the confirmed economics.",
      );
      return;
    }

    if (["CONFIRMED", "EXACT_PRICE_UNAVAILABLE"].includes(s.confirmation?.status) && s.reviewTextSeen && !s.streamBusy) {
      setComposer(
        "Ask a follow-up about the final recommendation…",
        s.confirmation?.status === "CONFIRMED"
          ? "Final recommendation complete. The selected fare is confirmed; other unconfirmed alternatives remain indicative."
          : "Final recommendation complete. The selected schedule remains valid, but Sabre could not provide its exact fare; the displayed price remains indicative.",
        true,
      );
      return;
    }

    if (s.confirmation?.status === "EXACT_PRICE_UNAVAILABLE") {
      setComposer(
        s.streamBusy ? "Luna is reviewing the exact-fare coverage gap…" : "Ask a follow-up about this candidate…",
        s.streamBusy
          ? "The schedule remains valid. Sabre could not provide the exact fare, so Luna is reviewing the candidate using its indicative economics and travel value."
          : "Sabre exact fare is unavailable for this valid schedule. The candidate remains eligible; its displayed price is indicative.",
        !s.streamBusy,
      );
      return;
    }

    if (s.confirmation?.status === "EXACT_CHECK_FAILED" || s.phases.confirmation === "error") {
      setComposer(
        s.streamBusy ? "Luna is explaining the failed exact check…" : "Open another candidate on the right and select it for confirmation…",
        s.streamBusy
          ? "The selected exact check failed. Luna will explain what happened, then wait for your next selection."
          : "No final-success state was created. If Luna recommends another option, open that candidate and check “Select for Luna to confirm pricing.”",
        !s.streamBusy,
      );
      return;
    }

    if (s.pricing?.phase === "completed" && s.streamBusy) {
      setComposer(
        "Luna is analyzing the candidate set…",
        "Indicative pricing is complete. Luna is comparing the candidates and will stop before exact confirmation.",
      );
      return;
    }

    if (s.phases.summary === "complete" && s.phases.confirmation === "ready" && !s.streamBusy) {
      setComposer(
        "Open the recommended candidate on the right to confirm pricing…",
        "Luna’s analysis is complete. Open the desired candidate in Indicative pricing and check “Select for Luna to confirm pricing.” Exact confirmation will not run until you select it.",
        true,
      );
      return;
    }

    if (s.pricing?.phase === "completed" && !s.streamBusy) {
      setComposer(
        "Ask a follow-up about Luna’s analysis…",
        "Indicative pricing is complete. Luna will analyze the candidates before any exact confirmation is allowed.",
      );
    }
  }

  function confirmation() {
    const target = document.getElementById("confirmation-content");
    const badge = document.getElementById("confirmation-badge");
    if (!target || !badge) return;
    target.replaceChildren();

    let card;
    if (s.phases.confirmation === "running") {
      badge.textContent = "Running";
      const number = candidateNumber(s.confirmationCandidateId);
      card = node("div", "issue23-confirmation-card is-running");
      card.append(
        node("strong", null, "Confirming exact flight & fare"),
        node("p", null, number ? `Candidate ${number} · ${s.confirmationCandidateId}` : "Validating the advisor-selected candidate."),
      );
    } else if (s.confirmation?.status === "CONFIRMED") {
      badge.textContent = "Confirmed";
      const c = s.confirmation.candidate;
      const p = s.confirmation.confirmedPricing ?? c?.confirmedPricing;
      const number = candidateNumber(c);
      card = node("div", "issue23-confirmation-card is-confirmed");
      card.append(
        node("strong", null, `Confirmed · Candidate ${number ?? "—"} · ${candidateName(c)}`),
        node("p", "issue23-confirmed-total", money(c?.totalPrice ?? p?.price)),
      );
      if (p?.proxyPrice) {
        card.append(node("p", null, `Indicative was ${money(p.proxyPrice)}${p.delta ? ` · Change ${money(p.delta)}` : ""}`));
      }
    } else if (s.confirmation?.status === "EXACT_PRICE_UNAVAILABLE") {
      badge.textContent = "Fare unavailable";
      const c = s.confirmation.candidate;
      const number = candidateNumber(c);
      card = node("div", "issue23-confirmation-card is-unavailable");
      card.append(
        node("strong", null, `Exact fare unavailable · Candidate ${number ?? "—"} · ${candidateName(c)}`),
        node("p", null, s.confirmation?.message ?? c?.exactCheckFailure?.message ?? "Cuberence schedule remains valid, but the exact fare could not be provided. Indicative pricing remains available."),
      );
    } else if (s.confirmation?.status === "EXACT_CHECK_FAILED" || s.phases.confirmation === "error") {
      badge.textContent = "Needs attention";
      card = node("div", "issue23-confirmation-card is-failed");
      card.append(
        node("strong", null, "Exact check encountered a technical or validation problem"),
        node("p", null, s.confirmation?.message ?? s.confirmation?.candidate?.exactCheckFailure?.message ?? "Luna will explain the failure before another candidate is selected."),
      );
    } else if (s.phases.summary === "complete" && s.phases.confirmation === "ready") {
      badge.textContent = "Waiting for advisor";
      card = node("div", "issue23-confirmation-card");
      card.append(
        node("strong", null, "Select the candidate to exact-confirm"),
        node("p", null, "Open the desired candidate in Indicative pricing and check “Select for Luna to confirm pricing.” No exact API call is made until you select it."),
      );
    } else {
      badge.textContent = "Not run";
      card = node("div", "empty-workspace compact-empty");
      card.append(
        node("strong", null, "No exact confirmation yet"),
        node("p", null, "Luna analyzes the candidate set first. Advisor selection is required before exact confirmation."),
      );
    }
    target.append(card);
  }

  function finalPanel() {
    const target = document.getElementById("final-recommendation-content");
    const badge = document.getElementById("final-recommendation-badge");
    if (!target || !badge) return;
    target.replaceChildren();
    const card = node("div", "issue23-final-card");

    if (s.confirmation?.status === "CONFIRMED" && s.streamBusy) {
      badge.textContent = "Reviewing";
      card.classList.add("is-running");
      card.append(
        node("strong", null, "Luna is reviewing the confirmed fare"),
        node("p", null, "The exact result is being re-evaluated against journey value and the remaining indicative options."),
      );
    } else if (s.confirmation?.status === "CONFIRMED" && s.reviewTextSeen) {
      badge.textContent = "Final";
      card.classList.add("is-complete");
      card.append(
        node("strong", null, "Final recommendation available in chat"),
        node("p", null, "Luna has reviewed the confirmed fare and exact flights; the conclusion and reasoning remain in the conversation."),
      );
    } else if (s.confirmation?.status === "CONFIRMED") {
      badge.textContent = "Luna review";
      card.classList.add("is-running");
      card.append(
        node("strong", null, "Confirmed fare awaiting Luna re-evaluation"),
        node("p", null, "The UI will not mark the recommendation final until Luna has reviewed the confirmed result."),
      );
    } else if (s.confirmation?.status === "EXACT_PRICE_UNAVAILABLE" && s.streamBusy) {
      badge.textContent = "Reviewing";
      card.classList.add("is-unavailable");
      card.append(
        node("strong", null, "Luna is reviewing a valid schedule with unavailable exact fare"),
        node("p", null, "The candidate remains eligible. Luna is using schedule value and clearly labeled indicative economics."),
      );
    } else if (s.confirmation?.status === "EXACT_PRICE_UNAVAILABLE" && s.reviewTextSeen) {
      badge.textContent = "Final";
      card.classList.add("is-unavailable");
      card.append(
        node("strong", null, "Final recommendation available in chat"),
        node("p", null, "The schedule remains valid; Sabre exact fare was unavailable and the displayed price remains indicative."),
      );
    } else if (s.confirmation?.status === "EXACT_PRICE_UNAVAILABLE") {
      badge.textContent = "Luna review";
      card.classList.add("is-unavailable");
      card.append(
        node("strong", null, "Exact fare unavailable · Luna review pending"),
        node("p", null, "A provider coverage gap does not invalidate the Cuberence schedule."),
      );
    } else if (s.confirmation?.status === "EXACT_CHECK_FAILED" || s.phases.confirmation === "error") {
      badge.textContent = "Needs attention";
      card.classList.add("is-failed");
      card.append(
        node("strong", null, "Recommendation not final"),
        node("p", null, "The exact check encountered a technical or validation problem. Luna will not automatically confirm another candidate."),
      );
    } else {
      badge.textContent = "Pending";
      card.classList.add("is-pending");
      card.append(
        node("strong", null, "Final recommendation pending"),
        node("p", null, "Final means exact fare confirmed and re-evaluated by Luna—not booking or ticket issuance."),
      );
    }
    target.append(card);
  }

  function tools() {
    const boxes = [...document.querySelectorAll("#conversation .tool-progress")];
    for (const box of boxes) {
      const label = box.querySelector(".tool-progress-copy strong");
      const detail = box.querySelector(".tool-progress-copy span");
      if (!label || !detail) continue;
      const text = `${label.textContent} ${detail.textContent}`.toLowerCase();
      if (/discovery/.test(text)) label.textContent = "Hub discovery & selection";
      if (/pricing/.test(text) && !/baseline/.test(text)) label.textContent = "Indicative pricing";
      if (/confirmation|confirming the exact|exact-price/.test(text)) label.textContent = "Exact flight & fare confirmation";
    }

    if (s.phases.confirmation === "running" && boxes.length) {
      const last = boxes.at(-1);
      const label = last.querySelector(".tool-progress-copy strong");
      const detail = last.querySelector(".tool-progress-copy span");
      if (label?.textContent === "Cuberence") label.textContent = "Exact flight & fare confirmation";
      if (detail && /cuberence is working/i.test(detail.textContent)) detail.textContent = "Confirming the exact selected flights and fare…";
    }
  }

  syncFns.push(() => {
    tracker();
    status();
    composer();
    tools();
    confirmation();
    finalPanel();
  });
  C.queue();
})();
