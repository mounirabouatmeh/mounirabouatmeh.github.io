(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;

  const { s, syncFns, node } = C;
  const PAGE_SIZE = 50;
  const confirmationsByCandidate = new Map();
  let activePricingId = null;
  let paginationRenderQueued = false;
  const matchedFares = new Map();
  const originalDetails = new Map();
  let sortJobId = null;
  let sortRequestedId = null;
  let sortState = "idle";
  let pageCursor = PAGE_SIZE;


  const originalCandidateStatus = C.candidateStatus;
  const originalEffectiveCandidate = C.effectiveCandidate;

  function rememberCurrentConfirmation() {
    const pricingId = s.pricingId ?? s.pricing?.pricingId ?? null;
    if (pricingId && pricingId !== activePricingId) {
      activePricingId = pricingId;
      confirmationsByCandidate.clear();
      matchedFares.clear();
      originalDetails.clear();
      sortJobId = null;
      sortRequestedId = null;
      sortState = "idle";
      pageCursor = PAGE_SIZE;
    }

    const confirmation = s.confirmation;
    const candidateId = confirmation?.candidateId;
    if (!candidateId) return;
    if (["CONFIRMED", "EXACT_PRICE_UNAVAILABLE", "EXACT_CHECK_FAILED"].includes(confirmation.status)) {
      confirmationsByCandidate.set(candidateId, confirmation);
    }
  }

  C.confirmationsByCandidate = confirmationsByCandidate;

  C.candidateStatus = (candidate) => {
    const candidateId = candidate?.id;
    const remembered = candidateId ? confirmationsByCandidate.get(candidateId) : null;
    if (remembered?.status === "CONFIRMED") return "CONFIRMED";
    if (remembered?.status === "EXACT_PRICE_UNAVAILABLE") return "EXACT_PRICE_UNAVAILABLE";
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
    const status = C.candidateStatus(candidate);
    if (status !== "PROXY" && status !== "UNPRICED") return false;
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


  /** Verified matched fares ONLY: ignore market-reference and partial prices. */
  function matchedFare(row, currency) {
    if (!row?.candidateId || row.pricingStatus !== "PRICED" ||
        row.priceEvidence !== "FLIGHT_MATCHED_PROVIDER_SHOP") return null;
    const { outerPrice, innerPrice, totalPrice } = row;
    if (![outerPrice,innerPrice,totalPrice].every(n => Number.isFinite(n) && n > 0) ||
        Math.round((outerPrice + innerPrice) * 100) !== Math.round(totalPrice * 100)) return null;
    const flight = f => f ? { ...f, originTimeZone: "UTC", destinationTimeZone: "UTC" } : null;
    return {
      candidateId: String(row.candidateId),
      price: { amount: totalPrice, currency },
      outerTicket: { price: { amount: outerPrice, currency } },
      innerTicket: { price: { amount: innerPrice, currency } },
      baselineDelta: Number.isFinite(row.baselineDelta) ? { amount: row.baselineDelta, currency } : null,
      fareBasis: row.reviewRequired ? "TIME_MATCH_REVIEW" : "FLIGHT_MATCHED_PROVIDER_SHOP",
      priceEvidence: "FLIGHT_MATCHED_PROVIDER_SHOP",
      exactSchedule: {
        source: "Cuberence",
        outerOutbound: flight(row.flights?.outerOutbound),
        innerOutbound: flight(row.flights?.innerOutbound),
        innerReturn: flight(row.flights?.innerReturn),
        outerReturn: flight(row.flights?.outerReturn),
      },
      facts: { hubNights: row.hubNights, usableCityHours: row.usableCityHours,
        returnSelfConnectMinutes: row.returnSelfConnectMinutes },
    };
  }

  function priceOrder(a, b, columns) {
    const idAt = columns.indexOf("candidateId");
    const numberAt = columns.indexOf("candidateNumber");
    const idA = String(a[idAt]), idB = String(b[idAt]);
    const priceA = matchedFares.get(idA)?.price.amount;
    const priceB = matchedFares.get(idB)?.price.amount;
    const pricedA = Number.isFinite(priceA), pricedB = Number.isFinite(priceB);
    if (pricedA !== pricedB) return pricedA ? -1 : 1;
    if (pricedA && priceA !== priceB) return priceA - priceB;
    const nA = Number(a[numberAt]), nB = Number(b[numberAt]);
    return Number.isFinite(nA) && Number.isFinite(nB) && nA !== nB
      ? nA - nB : idA.localeCompare(idB);
  }

  function recordId(row, columns) {
    return String(row[columns.indexOf("candidateId")]);
  }

  function sortLoadedCandidates() {
    const universe = candidateUniverse();
    if (!universe || !Array.isArray(s.pricing?.candidates)) return;
    const position = new Map(universe.rows.map((row, index) =>
      [recordId(row, universe.columns), index]));
    const sort = (a, b) => (position.get(String(a?.id)) ?? Infinity) -
      (position.get(String(b?.id)) ?? Infinity);
    s.pricing.candidates.sort(sort);
    const primary = primaryPricingOutput();
    if (primary?.candidates && primary !== s.pricing) primary.candidates.sort(sort);
  }

  function hydratedCandidate(row, columns, currency) {
    const record = universeRecord(row, columns);
    if (!record) return null;
    const id = String(record.candidateId);
    if (originalDetails.has(id)) return originalDetails.get(id);
    const compact = compactCandidate(row, columns, currency);
    const fare = matchedFares.get(id);
    if (compact && fare) {
      compact.totalPrice = fare.price;
      compact.baselineDelta = fare.baselineDelta;
      compact.exactSchedule = fare.exactSchedule;
      compact.fareEvidenceAuthority = fare.priceEvidence;
      compact.facts = { ...(compact.facts ?? {}), ...fare.facts };
    }
    return compact;
  }

  function applyStep8PriceOrder(table, jobId) {
    const universe = candidateUniverse();
    if (!Array.isArray(universe?.rows) || !Array.isArray(universe.columns) ||
        !Array.isArray(table?.rows) || table.schemaVersion !== 2 ||
        table.stage !== "STEP8_POST_ENRICHMENT_ANALYSIS" ||
        table.candidateCount !== universe.rows.length) return false;
    const idIndex = universe.columns.indexOf("candidateId");
    if (idIndex < 0 || !universe.columns.includes("candidateNumber")) return false;
    const ids = new Set(universe.rows.map(row => String(row[idIndex])));
    if (ids.size !== universe.rows.length || table.rows.some(row => !ids.has(String(row?.candidateId)))) return false;
    const currency = String(table.currency ?? universe.currency ?? "");
    if (!/^[A-Z]{3}$/.test(currency)) return false;
    const priced = table.rows.map(row => matchedFare(row, currency)).filter(Boolean);
    if (priced.length !== table.fullyPricedCandidates) return false;
    const originallyLoaded = Array.isArray(s.pricing?.candidates) ? [...s.pricing.candidates] : [];
    for (const candidate of originallyLoaded) {
      if (candidate?.id && !candidate._compactUniverseCandidate) {
        originalDetails.set(String(candidate.id), candidate);
      }
    }
    matchedFares.clear();
    for (const fare of priced) matchedFares.set(fare.candidateId, fare);
    universe.rows.sort((a,b) => priceOrder(a,b,universe.columns));

    pageCursor = Math.min(universe.rows.length, Math.max(PAGE_SIZE, originallyLoaded.length));
    const prefix = universe.rows.slice(0,pageCursor).map(row => recordId(row,universe.columns));
    const keep = originallyLoaded.filter(candidate =>
      candidate?.id === s.selectedCandidateId ||
      (s.pricing.step9Assessment?.rows ?? []).some(row => row.candidateId === candidate?.id))
      .map(candidate => String(candidate.id));
    const sortedIds = new Set([...prefix,...keep]);
    const recordById = new Map(universe.rows.map(row => [recordId(row,universe.columns),row]));
    const candidates = [...sortedIds].map(id =>
      hydratedCandidate(recordById.get(id),universe.columns,currency)).filter(Boolean);
    s.pricing.candidates.splice(0,s.pricing.candidates.length,...candidates);
    const primary = primaryPricingOutput();
    if (primary && primary !== s.pricing) {
      if (!Array.isArray(primary.candidates)) primary.candidates = [];
      primary.candidates.splice(0,primary.candidates.length,...candidates);
    }
    sortJobId = jobId;
    sortState = "ready";
    sortLoadedCandidates();
    try { if (typeof renderWorkspace === "function") renderWorkspace(); } catch {}
    C.queue();
    return true;
  }

  function ensurePriceOrdering() {
    const jobId = String(s.pricingId ?? s.pricing?.pricingId ?? "");
    if (s.pricing?.phase !== "completed" || !jobId || sortRequestedId === jobId) return;
    sortRequestedId = jobId;
    sortState = "loading";
    fetch("/api/luna/step8-export?pricingId=" + encodeURIComponent(jobId), {
      credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json" },
    }).then(async response => {
      if (!response.ok) throw Error("Step 8 export unavailable");
      return response.json();
    }).then(data => {
      if (String(s.pricingId ?? s.pricing?.pricingId ?? "") !== jobId) return;
      if (!applyStep8PriceOrder(data?.step8AnalysisTable,jobId)) sortState = "unavailable";
    }).catch(() => {
      if (String(s.pricingId ?? s.pricing?.pricingId ?? "") === jobId) sortState = "unavailable";
    }).finally(() => C.queue());
  }

  // This is price evidence, NOT a subjective recommendation fallback.
  C.pricedRowFor = id => matchedFares.get(String(id)) ?? null;
  C.pricingSortStatus = () => sortState;
  C.sortCandidatePages = () => { if (sortJobId) sortLoadedCandidates(); };

  function compactCandidate(row, columns, currency) {
    const record = universeRecord(row, columns);
    if (!record?.candidateId) return null;
    const risks = typeof record.risks === "string" && record.risks
      ? record.risks.split("|").filter(Boolean)
      : [];
    const priceAmount = record.totalPrice == null ? null : Number(record.totalPrice);
    const resolvedCurrency = String(currency ?? s.pricing?.candidates?.find((candidate) => candidate?.totalPrice?.currency)?.totalPrice?.currency ?? "");
    return {
      id: String(record.candidateId),
      hub: {
        id: String(record.hubId ?? ""),
        name: String(record.hubName ?? record.hubId ?? "Stayover"),
      },
      hubNights: Number(record.hubNights ?? 0),
      ...(Number.isFinite(priceAmount) ? {
        totalPrice: {
          currency: resolvedCurrency,
          amount: priceAmount,
        },
      } : {}),
      ...(record.baselineDelta == null ? {} : {
        baselineDelta: {
          currency: resolvedCurrency,
          amount: Number(record.baselineDelta),
        },
      }),
      usableCityHours: Number(record.usableCityHours ?? 0),
      candidateStatus: String(record.candidateStatus ?? "VALID"),
      pricingStatus: String(record.pricingStatus ?? (Number.isFinite(priceAmount) ? "PROXY" : "UNPRICED")),
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

    const total = Number(universe.total ?? universe.rows.length);
    const cursor = sortJobId ? pageCursor : (s.pricing?.candidates?.length ?? 0);
    if (cursor >= total) return;

    const nextRows = universe.rows.slice(cursor, Math.min(cursor + PAGE_SIZE, total));
    if (sortJobId) pageCursor = Math.min(cursor + PAGE_SIZE,total);
    const candidates = nextRows
      .map(row => sortJobId
        ? hydratedCandidate(row,universe.columns,universe.currency)
        : compactCandidate(row,universe.columns,universe.currency))
      .filter(Boolean);
    const evaluations = nextRows
      .map((row) => compactEvaluation(row, universe.columns))
      .filter(Boolean);

    appendUnique(s.pricing.candidates, candidates);
    if (sortJobId) sortLoadedCandidates();
    if (!Array.isArray(s.pricing.evaluations)) s.pricing.evaluations = [];
    appendEvaluations(s.pricing.evaluations, evaluations);

    const primary = primaryPricingOutput();
    if (primary) {
      if (!Array.isArray(primary.candidates)) primary.candidates = [];
      appendUnique(primary.candidates, candidates.map(candidate => ({ ...candidate })));
      if (sortJobId) sortLoadedCandidates();
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

    const total = Number(universe.total ?? universe.rows?.length ?? 0);
    const loaded = s.pricing?.candidates?.length ?? 0;
    const cursor = sortJobId ? pageCursor : loaded;
    let control = target.querySelector(".issue100-pagination");

    if (!total || cursor >= total) {
      control?.remove();
      return;
    }

    let button = control?.querySelector(".issue100-load-more");
    let note = control?.querySelector(".issue100-pagination-note");

    if (!control) {
      control = node("div", "issue100-pagination");
      control.style.display = "grid";
      control.style.justifyItems = "center";
      control.style.gap = "6px";
      control.style.padding = "12px 0 2px";

      button = node("button", "sample-prompt issue100-load-more");
      button.type = "button";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        loadNextPage();
      });

      note = node("small", "issue100-pagination-note");
      note.style.color = "#66736d";
      control.append(button, note);

      const interactive = target.querySelector(".interactive-pricing");
      if (interactive) interactive.after(control);
      else target.append(control);
    }

    const nextCount = Math.min(PAGE_SIZE, total - cursor);
    if (button) {
      button.textContent = `Load ${nextCount} more candidates`;
      button.setAttribute("aria-label", `Load more candidates. ${loaded} of ${total} currently shown.`);
    }
    if (note) note.textContent = `${loaded} of ${total} candidates shown`;
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
    ensurePriceOrdering();
    queuePaginationControl();
  }

  syncFns.unshift(syncIssue100);

  const start = () => {
    rememberCurrentConfirmation();
    ensurePriceOrdering();
    queuePaginationControl();

    const pricing = document.getElementById("pricing-content");
    if (pricing) {
      new MutationObserver(queuePaginationControl).observe(pricing, { childList: true, subtree: false });
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();