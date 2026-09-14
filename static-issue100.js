(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;

  const { s, syncFns, node, money } = C;
  const PAGE_SIZE = 50;
  const confirmationsByCandidate = new Map();
  let activePricingId = null;
  let paginationRenderQueued = false;

  const originalCandidateStatus = C.candidateStatus;
  const originalEffectiveCandidate = C.effectiveCandidate;

  function rememberCurrentConfirmation() {
    const pricingId = s.pricingId ?? s.pricing?.pricingId ?? null;
    if (pricingId && pricingId !== activePricingId) {
      activePricingId = pricingId;
      confirmationsByCandidate.clear();
    }

    const confirmation = s.confirmation;
    const candidateId = confirmation?.candidateId;
    if (!candidateId) return;
    if (confirmation.status === "CONFIRMED" || confirmation.status === "EXACT_CHECK_FAILED") {
      confirmationsByCandidate.set(candidateId, confirmation);
    }
  }

  C.confirmationsByCandidate = confirmationsByCandidate;

  C.candidateStatus = (candidate) => {
    const candidateId = candidate?.id;
    const remembered = candidateId ? confirmationsByCandidate.get(candidateId) : null;
    if (remembered?.status === "CONFIRMED") return "CONFIRMED";
    if (remembered?.status === "EXACT_CHECK_FAILED") return "EXACT_CHECK_FAILED";
    if (s.phases.confirmation === "running" && s.confirmationCandidateId === candidateId) return "EXACT_CHECK_PENDING";
    return originalCandidateStatus(candidate);
  };

  C.effectiveCandidate = (candidate) => {
    const candidateId = candidate?.id;
    const remembered = candidateId ? confirmationsByCandidate.get(candidateId) : null;
    if (!remembered) return originalEffectiveCandidate(candidate);
    if (remembered.candidate) return remembered.candidate;
    if (remembered.confirmedPricing) {
      return {
        ...candidate,
        confirmedPricing: remembered.confirmedPricing,
        totalPrice: remembered.confirmedPricing.price ?? candidate?.totalPrice,
      };
    }
    return candidate;
  };

  C.canAuthorizeConfirmation = (candidate) => {
    if (!candidate || s.streamBusy || s.confirmationAuthorizedPending) return false;
    if (C.candidateStatus(candidate) !== "PROXY") return false;
    if (s.phases.summary !== "complete") return false;
    return s.phases.confirmation !== "running";
  };

  function candidateUniverse() {
    return s.pricing?.page?.fullAnalysis?.candidateUniverse ?? null;
  }

  function universeRecord(row, columns) {
    if (!Array.isArray(row) || !Array.isArray(columns)) return null;
    return Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null]));
  }

  function compactCandidate(row, columns, currency) {
    const record = universeRecord(row, columns);
    if (!record?.candidateId) return null;
    const risks = typeof record.risks === "string" && record.risks
      ? record.risks.split("|").filter(Boolean)
      : [];
    return {
      id: String(record.candidateId),
      hub: {
        id: String(record.hubId ?? ""),
        name: String(record.hubName ?? record.hubId ?? "Stayover"),
      },
      hubNights: Number(record.hubNights ?? 0),
      totalPrice: {
        currency: String(currency ?? s.pricing?.candidates?.[0]?.totalPrice?.currency ?? ""),
        amount: Number(record.totalPrice ?? 0),
      },
      ...(record.baselineDelta == null ? {} : {
        baselineDelta: {
          currency: String(currency ?? s.pricing?.candidates?.[0]?.totalPrice?.currency ?? ""),
          amount: Number(record.baselineDelta),
        },
      }),
      usableCityHours: Number(record.usableCityHours ?? 0),
      candidateStatus: String(record.candidateStatus ?? "VALID"),
      pricingStatus: String(record.pricingStatus ?? "PROXY"),
      strategy: "SPLIT",
      facts: {
        returnSelfConnectMinutes: record.returnSelfConnectMinutes == null ? null : Number(record.returnSelfConnectMinutes),
        outboundAirportChange: Boolean(record.outboundAirportChange),
        returnSameAirport: Boolean(record.returnSameAirport),
      },
      risks,
      _compactUniverseCandidate: true,
    };
  }

  function compactEvaluation(row, columns) {
    const record = universeRecord(row, columns);
    if (!record?.candidateId || record.overallScore == null) return null;
    const dimension = (score) => ({ score: score == null ? null : Number(score) });
    return {
      candidateId: String(record.candidateId),
      overallScore: Number(record.overallScore),
      recommendation: record.recommendation == null ? null : String(record.recommendation),
      dimensions: {
        operationalComplexity: dimension(record.operationalComplexityScore),
        priceImpact: dimension(record.priceImpactScore),
        experienceValue: dimension(record.experienceValueScore),
      },
    };
  }

  function appendUnique(target, additions) {
    if (!Array.isArray(target)) return;
    const ids = new Set(target.map((candidate) => candidate?.id).filter(Boolean));
    for (const candidate of additions) {
      if (!candidate?.id || ids.has(candidate.id)) continue;
      target.push(candidate);
      ids.add(candidate.id);
    }
  }

  function appendEvaluations(target, additions) {
    if (!Array.isArray(target)) return;
    const ids = new Set(target.map((evaluation) => evaluation?.candidateId).filter(Boolean));
    for (const evaluation of additions) {
      if (!evaluation?.candidateId || ids.has(evaluation.candidateId)) continue;
      target.push(evaluation);
      ids.add(evaluation.candidateId);
    }
  }

  function primaryPricingOutput() {
    try {
      if (typeof latestToolPart !== "function") return null;
      return latestToolPart("tool-pricing")?.output ?? null;
    } catch {
      return null;
    }
  }

  function loadNextPage() {
    const universe = candidateUniverse();
    if (!universe?.rows?.length || !Array.isArray(universe.columns)) return;

    const loaded = s.pricing?.candidates?.length ?? 0;
    const total = Number(universe.total ?? universe.rows.length);
    if (loaded >= total) return;

    const nextRows = universe.rows.slice(loaded, Math.min(loaded + PAGE_SIZE, total));
    const candidates = nextRows
      .map((row) => compactCandidate(row, universe.columns, universe.currency))
      .filter(Boolean);
    const evaluations = nextRows
      .map((row) => compactEvaluation(row, universe.columns))
      .filter(Boolean);

    appendUnique(s.pricing.candidates, candidates);
    if (!Array.isArray(s.pricing.evaluations)) s.pricing.evaluations = [];
    appendEvaluations(s.pricing.evaluations, evaluations);

    const primary = primaryPricingOutput();
    if (primary) {
      if (!Array.isArray(primary.candidates)) primary.candidates = [];
      appendUnique(primary.candidates, candidates.map((candidate) => ({ ...candidate })));
      if (!Array.isArray(primary.evaluations)) primary.evaluations = [];
      appendEvaluations(primary.evaluations, evaluations.map((evaluation) => ({ ...evaluation })));
    }

    try {
      if (typeof renderWorkspace === "function") renderWorkspace();
    } catch {
      // The Issue #23 sync pass below still keeps state coherent.
    }
    C.queue();
  }

  function paginationControl() {
    const universe = candidateUniverse();
    const target = document.getElementById("pricing-content");
    if (!target || !universe) return;

    target.querySelectorAll(".issue100-pagination").forEach((element) => element.remove());

    const total = Number(universe.total ?? universe.rows?.length ?? 0);
    const loaded = s.pricing?.candidates?.length ?? 0;
    if (!total || loaded >= total) return;

    const control = node("div", "issue100-pagination");
    control.style.display = "grid";
    control.style.justifyItems = "center";
    control.style.gap = "6px";
    control.style.padding = "12px 0 2px";

    const button = node("button", "sample-prompt issue100-load-more", `Load ${Math.min(PAGE_SIZE, total - loaded)} more candidates`);
    button.type = "button";
    button.setAttribute("aria-label", `Load more priced candidates. ${loaded} of ${total} currently shown.`);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      loadNextPage();
    });

    const note = node("small", "issue100-pagination-note", `${loaded} of ${total} candidates shown`);
    note.style.color = "#66736d";
    control.append(button, note);

    const interactive = target.querySelector(".interactive-pricing");
    if (interactive) interactive.after(control);
    else target.append(control);
  }

  function queuePaginationControl() {
    if (paginationRenderQueued) return;
    paginationRenderQueued = true;
    requestAnimationFrame(() => {
      paginationRenderQueued = false;
      paginationControl();
    });
  }

  function syncIssue100() {
    rememberCurrentConfirmation();
    queuePaginationControl();
  }

  syncFns.unshift(syncIssue100);

  const start = () => {
    rememberCurrentConfirmation();
    queuePaginationControl();

    const pricing = document.getElementById("pricing-content");
    if (pricing) {
      new MutationObserver(queuePaginationControl).observe(pricing, { childList: true, subtree: false });
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();