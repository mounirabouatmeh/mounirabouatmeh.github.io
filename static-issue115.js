(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;

  const { s, node, syncFns } = C;
  const STRUCTURALLY_USABLE = new Set(["VALID", "VALID_WITH_RISK"]);
  const NON_ACTIONABLE_PRICING = new Set(["EXACT_CHECK_FAILED", "EXACT_PRICE_UNAVAILABLE", "EXACT_CHECK_PENDING", "CONFIRMED"]);
  const HEALTH_URL = "https://cuberence-travel-api.vercel.app/api/v1/health";
  const view = { mode: "all", requestedCandidateId: null };
  let environment = "";
  let queued = false;
  const setText = (element, value) => { if (element && element.textContent !== value) element.textContent = value; };

  function universe() {
    return s.pricing?.page?.fullAnalysis?.candidateUniverse ?? null;
  }

  function records() {
    const source = universe();
    if (!Array.isArray(source?.columns) || !Array.isArray(source?.rows)) return [];
    return source.rows.map((row) => Object.fromEntries(source.columns.map((column, index) => [column, row[index] ?? null])));
  }

  function usableRecords() {
    return records().filter((record) => STRUCTURALLY_USABLE.has(String(record.candidateStatus)));
  }

  function recommendedIds() {
    const ids = new Set();
    const categories = s.pricing?.page?.fullAnalysis?.universeRecommendationCategories ?? {};
    Object.values(categories).flat().forEach((id) => id && ids.add(String(id)));
    for (const record of usableRecords()) {
      if (String(record.recommendation) === "RECOMMENDED") ids.add(String(record.candidateId));
      if (String(record.pricingStatus) === "EXACT_CHECK_FAILED") ids.delete(String(record.candidateId));
    }
    return ids;
  }

  function recordFor(candidateOrId) {
    const id = typeof candidateOrId === "string" ? candidateOrId : candidateOrId?.id;
    return records().find((record) => String(record.candidateId) === String(id)) ?? null;
  }

  const previousCandidateNumber = C.candidateNumber;
  C.candidateNumber = (candidateOrId) => {
    const record = recordFor(candidateOrId);
    const number = Number(record?.candidateNumber);
    return Number.isFinite(number) && number > 0 ? number : previousCandidateNumber(candidateOrId);
  };

  C.canAuthorizeConfirmation = (candidate) => {
    if (!candidate || s.streamBusy || s.confirmationAuthorizedPending) return false;
    const structuralStatus = String(recordFor(candidate)?.candidateStatus ?? candidate.candidateStatus ?? "");
    if (!STRUCTURALLY_USABLE.has(structuralStatus)) return false;
    if (NON_ACTIONABLE_PRICING.has(String(C.candidateStatus(candidate)))) return false;
    if (!["PROXY", "UNPRICED"].includes(String(C.candidateStatus(candidate)))) return false;
    return s.phases.summary === "complete" && s.phases.confirmation !== "running";
  };

  function compactCandidate(record) {
    const amount = record.totalPrice == null ? null : Number(record.totalPrice);
    const currency = String(universe()?.currency ?? s.pricing?.candidates?.find((candidate) => candidate?.totalPrice?.currency)?.totalPrice?.currency ?? "");
    return {
      id: String(record.candidateId),
      hub: { id: String(record.hubId ?? ""), name: String(record.hubName ?? record.hubId ?? "Stayover") },
      hubNights: Number(record.hubNights ?? 0),
      ...(Number.isFinite(amount) ? { totalPrice: { amount, currency } } : {}),
      candidateStatus: String(record.candidateStatus ?? "VALID"),
      pricingStatus: String(record.pricingStatus ?? (Number.isFinite(amount) ? "PROXY" : "UNPRICED")),
      usableCityHours: Number(record.usableCityHours ?? 0),
      strategy: "SPLIT",
      risks: typeof record.risks === "string" ? record.risks.split("|").filter(Boolean) : [],
      _compactUniverseCandidate: true,
    };
  }

  function compactEvaluation(record) {
    if (record.overallScore == null) return null;
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

  function primaryPricingOutput() {
    try { return typeof latestToolPart === "function" ? latestToolPart("tool-pricing")?.output : null; } catch { return null; }
  }

  function ensureLoaded(ids) {
    if (!s.pricing || !ids.size) return;
    const current = new Set((s.pricing.candidates ?? []).map((candidate) => String(candidate?.id)));
    const additions = usableRecords().filter((record) => ids.has(String(record.candidateId)) && !current.has(String(record.candidateId)));
    if (!additions.length) return;
    if (!Array.isArray(s.pricing.candidates)) s.pricing.candidates = [];
    if (!Array.isArray(s.pricing.evaluations)) s.pricing.evaluations = [];
    s.pricing.candidates.push(...additions.map(compactCandidate));
    const evaluations = additions.map(compactEvaluation).filter(Boolean);
    const evaluationIds = new Set(s.pricing.evaluations.map((item) => String(item?.candidateId)));
    s.pricing.evaluations.push(...evaluations.filter((item) => !evaluationIds.has(String(item.candidateId))));
    const primary = primaryPricingOutput();
    if (primary && primary !== s.pricing) {
      if (!Array.isArray(primary.candidates)) primary.candidates = [];
      const primaryIds = new Set(primary.candidates.map((candidate) => String(candidate?.id)));
      primary.candidates.push(...additions.map(compactCandidate).filter((candidate) => !primaryIds.has(String(candidate.id))));
      if (!Array.isArray(primary.evaluations)) primary.evaluations = [];
      const primaryEvaluationIds = new Set(primary.evaluations.map((item) => String(item?.candidateId)));
      primary.evaluations.push(...evaluations.filter((item) => !primaryEvaluationIds.has(String(item.candidateId))));
    }
  }

  function setView(nextMode) {
    view.mode = nextMode;
    if (nextMode === "recommended") ensureLoaded(recommendedIds());
    document.querySelector("#pricing-content .pricing-filter")?.click();
    try { if (typeof renderWorkspace === "function") renderWorkspace(); } catch { /* sync decorates existing UI */ }
    queue();
  }

  function environmentBadge(location) {
    const badge = node("span", `issue115-environment ${environment ? `is-${environment.toLowerCase()}` : "is-loading"}`);
    badge.dataset.issue115Environment = location;
    badge.textContent = environment ? `Sabre ${environment}` : "Sabre environment…";
    badge.title = environment ? `Sabre ${environment} environment reported by the backend` : "Reading the active backend environment";
    return badge;
  }

  function syncEnvironment() {
    const nav = document.querySelector(".nav-meta");
    if (nav && !nav.querySelector('[data-issue115-environment="header"]')) nav.append(environmentBadge("header"));
    const pricingTitle = document.querySelector('[data-workspace-stage="pricing"] .section-title-row');
    if (pricingTitle && !pricingTitle.querySelector('[data-issue115-environment="pricing"]')) pricingTitle.append(environmentBadge("pricing"));
    for (const badge of document.querySelectorAll("[data-issue115-environment]")) {
      badge.className = `issue115-environment ${environment ? `is-${environment.toLowerCase()}` : "is-loading"}`;
      setText(badge, environment ? `Sabre ${environment}` : "Sabre environment…");
    }
  }

  function structurallyValidNights(hub) {
    const nights = new Set();
    for (const date of hub?.feasibleDates ?? []) {
      const validReturn = (date?.splitReturnOptions ?? []).some((option) => STRUCTURALLY_USABLE.has(String(option?.candidateStatus)));
      if (validReturn && Number.isFinite(Number(date?.hubNights))) nights.add(Number(date.hubNights));
    }
    if (!nights.size && records().length) {
      for (const record of usableRecords()) {
        if (String(record.hubId) === String(hub?.id) && Number.isFinite(Number(record.hubNights))) nights.add(Number(record.hubNights));
      }
    }
    return [...nights].sort((a, b) => a - b);
  }

  function hubIsUsable(hub) {
    if (Number(hub?.splitValidOptionCount ?? 0) + Number(hub?.splitValidWithRiskOptionCount ?? 0) > 0) return true;
    return structurallyValidNights(hub).length > 0;
  }

  function syncHubs() {
    const hubs = Array.isArray(s.discovery?.hubs) ? s.discovery.hubs : [];
    const cards = [...document.querySelectorAll("#discovery-content .hub-card")];
    for (const card of cards) {
      const label = card.querySelector("strong")?.textContent?.trim();
      const hub = hubs.find((item) => [item?.city, item?.id].includes(label));
      if (!hub) continue;
      const nights = structurallyValidNights(hub);
      const usable = hubIsUsable(hub);
      card.classList.toggle("issue115-hub-unavailable", !usable);
      card.setAttribute("aria-disabled", String(!usable));
      let status = card.querySelector(".issue115-hub-status");
      if (!status) { status = node("small", "issue115-hub-status"); card.append(status); }
      setText(status, usable ? `${nights.join(", ")} night${nights.length === 1 ? "" : "s"} · valid SPLIT` : "No complete valid SPLIT itinerary");
      const base = card.querySelector(":scope > small:not(.issue115-hub-status)");
      if (base && nights.length) setText(base, base.textContent.replace(/^.*? night options/, `${nights.join(", ")} night options`));
    }
  }

  function syncPricing() {
    const usable = usableRecords();
    const recommendations = recommendedIds();
    const badge = document.getElementById("pricing-badge");
    if (badge && usable.length) setText(badge, `${usable.length} candidates`);

    const filterRow = document.querySelector("#pricing-content .pricing-filters");
    if (filterRow && !document.querySelector(".issue115-view-switcher")) {
      const switcher = node("div", "issue115-view-switcher");
      const all = node("button", "issue115-view-button", `All itineraries (${usable.length})`);
      const recommended = node("button", "issue115-view-button", `Luna recommendations (${recommendations.size})`);
      all.type = recommended.type = "button";
      all.dataset.issue115View = "all";
      recommended.dataset.issue115View = "recommended";
      all.addEventListener("click", () => setView("all"));
      recommended.addEventListener("click", () => setView("recommended"));
      switcher.append(all, recommended);
      filterRow.before(switcher);
    }
    for (const button of document.querySelectorAll("[data-issue115-view]")) button.classList.toggle("active", button.dataset.issue115View === view.mode);
    const byNight = new Map();
    usable.forEach((record) => byNight.set(Number(record.hubNights), (byNight.get(Number(record.hubNights)) ?? 0) + 1));
    for (const button of document.querySelectorAll("#pricing-content .pricing-filter")) {
      const text = button.textContent.toLowerCase();
      const night = text.startsWith("1 night") ? 1 : text.startsWith("2 nights") ? 2 : text.startsWith("3 nights") ? 3 : null;
      setText(button, night == null ? `All (${usable.length})` : `${night} night${night === 1 ? "" : "s"} (${byNight.get(night) ?? 0})`);
      button.hidden = night != null && !byNight.get(night);
    }

    const visible = C.visibleCandidates();
    const cards = [...document.querySelectorAll("#pricing-content .candidate-card")];
    cards.forEach((card, index) => {
      const candidate = visible[index];
      const record = recordFor(candidate);
      const valid = STRUCTURALLY_USABLE.has(String(record?.candidateStatus ?? candidate?.candidateStatus));
      const recommended = candidate && recommendations.has(String(candidate.id)) && String(record?.pricingStatus) !== "EXACT_CHECK_FAILED";
      card.hidden = !valid || (view.mode === "recommended" && !recommended);
      card.dataset.candidateId = candidate?.id ?? "";
      card.classList.toggle("issue115-recommended-card", recommended);
      let marker = card.querySelector(".issue115-luna-pick");
      if (recommended && !marker) { marker = node("span", "issue115-luna-pick", "Luna recommendation"); card.prepend(marker); }
      if (!recommended) marker?.remove();
      if (String(record?.pricingStatus ?? C.candidateStatus(candidate)) === "EXACT_CHECK_FAILED") {
        let notice = card.querySelector(".issue115-external-pricing");
        if (!notice) { notice = node("p", "issue115-external-pricing", "Exact check failed — price externally. This itinerary remains visible but cannot be confirmed or recommended."); card.append(notice); }
      }
    });

    if (view.requestedCandidateId) {
      const requested = document.querySelector(`[data-candidate-id="${CSS.escape(view.requestedCandidateId)}"]`);
      if (requested) {
        requested.hidden = false;
        requested.classList.add("issue115-chat-target");
        requested.scrollIntoView({ behavior: "smooth", block: "center" });
        view.requestedCandidateId = null;
      }
    }
  }

  function syncChatLinks() {
    for (const message of document.querySelectorAll("#conversation .message.assistant, #conversation [data-role='assistant']")) {
      if (message.dataset.issue115Linked) continue;
      const matches = [...message.textContent.matchAll(/candidate\s+#?(\d+)/gi)];
      const numbers = [...new Set(matches.map((match) => Number(match[1])))];
      const targetRecords = numbers.map((number) => usableRecords().find((record) => Number(record.candidateNumber) === number)).filter(Boolean);
      if (targetRecords.length) {
        const actions = node("div", "issue115-chat-actions");
        targetRecords.forEach((record) => {
          const button = node("button", "issue115-chat-link", `View candidate ${record.candidateNumber}`);
          button.type = "button";
          button.addEventListener("click", () => {
            const id = String(record.candidateId);
            ensureLoaded(new Set([id]));
            view.mode = "all";
            view.requestedCandidateId = id;
            try { if (typeof renderWorkspace === "function") renderWorkspace(); } catch { queue(); }
            queue();
          });
          actions.append(button);
        });
        message.append(actions);
      }
      message.dataset.issue115Linked = "true";
    }
  }

  function sync() {
    queued = false;
    syncEnvironment();
    syncHubs();
    syncPricing();
    syncChatLinks();
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }

  syncFns.unshift(queue);
  globalThis.CuberenceIssue115 = { records, usableRecords, recommendedIds, structurallyValidNights, setView };

  async function loadEnvironment() {
    try {
      const response = await fetch(HEALTH_URL, { headers: { accept: "application/json" } });
      const health = await response.json();
      const raw = String(health?.providers?.sabreEnvironment ?? "").toUpperCase();
      environment = raw === "PRODUCTION" ? "PROD" : raw === "CERT" ? "CERT" : "UNKNOWN";
    } catch { environment = "UNKNOWN"; }
    queue();
  }

  const start = () => {
    queue();
    loadEnvironment();
    const roots = [document.getElementById("pricing-content"), document.getElementById("discovery-content"), document.getElementById("conversation")].filter(Boolean);
    roots.forEach((root) => new MutationObserver(queue).observe(root, { childList: true, subtree: true }));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
