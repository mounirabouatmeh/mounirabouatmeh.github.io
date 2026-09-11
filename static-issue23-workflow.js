(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;
  const { s, stages, node, money, candidateName, syncFns } = C;

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
    if (s.confirmation?.status === "CONFIRMED" && p.final === "waiting") {
      p.final = s.streamBusy ? "running" : s.reviewTextSeen ? "complete" : "ready";
    }

    step("intent", p.intent, p.intent === "complete" ? "Captured" : null);
    step("baseline", p.baseline);
    step("discovery", p.discovery);
    step("pricing", p.pricing, p.pricing === "complete" ? "Indicative" : null);
    step("summary", p.summary, p.summary === "running" ? "Analyzing" : p.summary === "complete" ? "Recommended" : null);
    step("confirmation", p.confirmation, p.confirmation === "running" ? "Confirming" : p.confirmation === "complete" ? "Confirmed" : null);
    step("final", p.final, p.final === "running" ? "Reviewing" : p.final === "complete" ? "Final" : null);

    document.querySelectorAll(".trip-progress-connector").forEach((x, i) => {
      x.classList.toggle("is-complete", p[stages[i]] === "complete");
    });
  }

  function statusText() {
    if (!s.streamBusy) return ["Ready for the next instruction.", false];
    if (s.phases.confirmation === "running") return ["Confirming the exact selected flights and fare…", true];
    if (s.confirmation?.status === "CONFIRMED") return ["Luna is reviewing the confirmed fare…", true];
    if (s.confirmation?.status === "EXACT_CHECK_FAILED" || s.phases.confirmation === "error") return ["Luna is re-evaluating the remaining options…", true];
    if (s.phases.pricing === "running") return ["Evaluating stayover options…", true];
    if (s.pricing?.phase === "completed") return ["Luna is analyzing this trip…", true];
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
    if (s.confirmation?.status === "CONFIRMED" && !s.streamBusy && s.reviewTextSeen) ws.textContent = "Final recommendation";
    else if (s.confirmation?.status === "CONFIRMED" && !s.streamBusy) ws.textContent = "Confirmed · Luna review pending";
    else if (s.confirmation?.status === "CONFIRMED") ws.textContent = "Confirmed · reviewing";
    else if (s.confirmation?.status === "EXACT_CHECK_FAILED" || s.phases.confirmation === "error") ws.textContent = "Exact check needs review";
    else if (s.phases.confirmation === "running") ws.textContent = "Confirming exact fare";
    else if (s.pricing?.phase === "completed") ws.textContent = "Indicative pricing";
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
    if (s.phases.confirmation === "running") {
      setComposer(
        "Exact flight and fare confirmation is running…",
        "Cuberence is validating only Luna’s selected candidate against the exact Sabre flight and fare result.",
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

    if (s.confirmation?.status === "CONFIRMED" && s.reviewTextSeen && !s.streamBusy) {
      setComposer(
        "Ask a follow-up about the final recommendation…",
        "Final recommendation complete. The selected fare is confirmed; other unconfirmed alternatives remain indicative.",
        true,
      );
      return;
    }

    if (s.confirmation?.status === "EXACT_CHECK_FAILED" || s.phases.confirmation === "error") {
      setComposer(
        s.streamBusy ? "Luna is re-evaluating the remaining options…" : "Ask Luna to continue with the next-best option…",
        "The exact check did not confirm the selected candidate. No final-success state is shown; Luna can re-rank and exact-check only the next candidate it recommends.",
        !s.streamBusy,
      );
      return;
    }

    if (s.pricing?.phase === "completed" && s.streamBusy) {
      setComposer(
        "Luna is analyzing the selected trip…",
        "The candidate price is still indicative. Luna is evaluating the exact discovered schedule and journey value before any exact fare check.",
      );
      return;
    }

    if (s.pricing?.phase === "completed" && !s.streamBusy) {
      setComposer(
        "Expand a trip and select it for Luna analysis, or ask a follow-up…",
        "Indicative pricing is complete. Select one candidate for Luna’s provisional analysis; exact fare confirmation happens only if Luna recommends it.",
        true,
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
      card = node("div", "issue23-confirmation-card is-running");
      card.append(
        node("strong", null, "Confirming exact flight & fare"),
        node("p", null, s.confirmationCandidateId ? `Candidate ${s.confirmationCandidateId}` : "Validating Luna’s provisional recommendation."),
      );
    } else if (s.confirmation?.status === "CONFIRMED") {
      badge.textContent = "Confirmed";
      const c = s.confirmation.candidate;
      const p = s.confirmation.confirmedPricing ?? c?.confirmedPricing;
      card = node("div", "issue23-confirmation-card is-confirmed");
      card.append(
        node("strong", null, `Confirmed · ${candidateName(c)}`),
        node("p", "issue23-confirmed-total", money(c?.totalPrice ?? p?.price)),
      );
      if (p?.proxyPrice) {
        card.append(node("p", null, `Indicative was ${money(p.proxyPrice)}${p.delta ? ` · Change ${money(p.delta)}` : ""}`));
      }
    } else if (s.confirmation?.status === "EXACT_CHECK_FAILED" || s.phases.confirmation === "error") {
      badge.textContent = "Failed";
      card = node("div", "issue23-confirmation-card is-failed");
      card.append(
        node("strong", null, "Exact check did not confirm this candidate"),
        node("p", null, s.confirmation?.message ?? s.confirmation?.candidate?.exactCheckFailure?.message ?? "Luna is re-evaluating alternatives."),
      );
    } else {
      badge.textContent = s.phases.confirmation === "ready" ? "Ready after Luna" : "Not run";
      card = node("div", "empty-workspace compact-empty");
      card.append(
        node("strong", null, "No exact confirmation yet"),
        node("p", null, "Only a candidate Luna provisionally recommends advances to exact flight and fare confirmation."),
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
    } else if (s.confirmation?.status === "EXACT_CHECK_FAILED" || s.phases.confirmation === "error") {
      badge.textContent = s.streamBusy ? "Re-evaluating" : "Needs review";
      card.classList.add("is-failed");
      card.append(
        node("strong", null, "Recommendation not final"),
        node("p", null, "The exact check did not confirm this candidate; Luna must re-evaluate another indicative option."),
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
      if (/discovery/.test(text)) label.textContent = "Discovery";
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
