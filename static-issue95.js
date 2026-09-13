(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;
  const { s, node, money, syncFns, queue } = C;
  const previousFetch = globalThis.fetch.bind(globalThis);
  const CHAT_API = "cuberence-travel-api.vercel.app/api/v1/chat";
  const loadedCandidateIds = new Set();
  const originalCandidateNumber = C.candidateNumber;

  function universeNumber(candidateOrId) {
    const id = typeof candidateOrId === "string" ? candidateOrId : candidateOrId?.id;
    if (!id) return null;
    const universe = s.pricing?.page?.fullAnalysis?.candidateUniverse;
    const columns = Array.isArray(universe?.columns) ? universe.columns : [];
    const rows = Array.isArray(universe?.rows) ? universe.rows : [];
    const idIndex = columns.indexOf("candidateId");
    const numberIndex = columns.indexOf("candidateNumber");
    if (idIndex >= 0 && numberIndex >= 0) {
      const row = rows.find((item) => Array.isArray(item) && item[idIndex] === id);
      const number = row?.[numberIndex];
      if (Number.isInteger(number) && number > 0) return number;
    }
    return originalCandidateNumber(candidateOrId);
  }
  C.candidateNumber = universeNumber;

  function mergeCandidateDetails(data) {
    if (!s.pricing || data?.kind !== "CANDIDATE_DETAILS") return;
    const entries = Array.isArray(data.details)
      ? data.details
      : Array.isArray(data.candidates) ? data.candidates : [];
    if (!entries.length) return;

    if (!Array.isArray(s.pricing.candidates)) s.pricing.candidates = [];
    if (!Array.isArray(s.pricing.evaluations)) s.pricing.evaluations = [];

    for (const entry of entries) {
      const candidate = entry?.candidate;
      if (!candidate?.id) continue;
      const existingIndex = s.pricing.candidates.findIndex((item) => item?.id === candidate.id);
      if (existingIndex >= 0) s.pricing.candidates[existingIndex] = candidate;
      else {
        s.pricing.candidates.push(candidate);
        loadedCandidateIds.add(candidate.id);
      }

      const evaluation = entry?.evaluation;
      if (evaluation?.candidateId) {
        const evaluationIndex = s.pricing.evaluations.findIndex((item) => item?.candidateId === evaluation.candidateId);
        if (evaluationIndex >= 0) s.pricing.evaluations[evaluationIndex] = evaluation;
        else s.pricing.evaluations.push(evaluation);
      }
    }

    // The legacy state interceptor can mistake a candidate-details payload for
    // pricing because both carry pricingId. Keep the already-completed pricing
    // phase authoritative; candidateDetails is read-only.
    s.phases.pricing = "complete";
    queue();
  }

  function toolName(event, names) {
    if (event?.toolName) return event.toolName;
    if (event?.toolCallId) return names.get(event.toolCallId);
    return null;
  }

  async function inspectCandidateDetails(response) {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    const names = new Map();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const match = buffer.match(/\r?\n\r?\n/);
        if (!match || match.index == null) break;
        const raw = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const dataText = raw.split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!dataText || dataText === "[DONE]") continue;
        try {
          const event = JSON.parse(dataText);
          if ((event.type === "tool-input-start" || event.type === "tool-input-available") && event.toolCallId) {
            names.set(event.toolCallId, event.toolName);
          }
          if (event.type === "tool-output-available") {
            const name = toolName(event, names);
            if (name === "candidateDetails" || event.output?.kind === "CANDIDATE_DETAILS") {
              mergeCandidateDetails(event.output);
            }
          }
        } catch {
          // The primary app owns stream parsing errors.
        }
      }
    }
    if (loadedCandidateIds.size) {
      s.phases.pricing = "complete";
      queue();
    }
  }

  globalThis.fetch = async (...args) => {
    const isChat = typeof args[0] === "string"
      ? args[0].includes(CHAT_API)
      : args[0]?.url?.includes(CHAT_API);
    const response = await previousFetch(...args);
    if (isChat && response.body) inspectCandidateDetails(response.clone()).catch(() => {});
    return response;
  };

  function activeNightFilter() {
    const text = document.querySelector("#pricing-content .pricing-filter.active")?.textContent?.trim().toLowerCase() ?? "";
    if (text.startsWith("1 night")) return 1;
    if (text.startsWith("2 nights")) return 2;
    if (text.startsWith("3 nights")) return 3;
    return null;
  }

  function addFact(grid, label, value) {
    const fact = node("div", "candidate-detail-fact");
    fact.append(node("span", null, label));
    fact.append(node("strong", null, value));
    grid.append(fact);
  }

  function createLoadedCandidateCard(candidate) {
    const card = node("article", "candidate-card interactive-candidate expanded issue95-loaded-finalist");
    card.tabIndex = 0;
    card.setAttribute("role", "group");
    card.setAttribute("aria-expanded", "true");
    card.dataset.candidateId = candidate.id;

    const top = node("div", "candidate-top");
    const left = node("div");
    left.append(node("strong", "result-value", candidate?.hub?.name ?? candidate?.hub?.city ?? candidate?.hub?.id ?? "Stayover"));
    left.append(node("span", null, "Loaded by Luna from the full candidate analysis"));
    top.append(left);
    top.append(node("b", "candidate-price result-value", money(candidate.totalPrice)));
    card.append(top);

    const facts = node("div", "candidate-facts");
    facts.append(node("span", "result-value", `${candidate.hubNights ?? "—"} hub night${candidate.hubNights === 1 ? "" : "s"}`));
    facts.append(node("span", "result-value city-time-fact", `${candidate.usableCityHours ?? "—"} usable city hours`));
    facts.append(node("span", null, `${candidate.destinationNights ?? "—"} destination nights`));
    card.append(facts);
    if (candidate.baselineDelta) card.append(node("small", "result-value", `Vs baseline: ${money(candidate.baselineDelta)}`));
    card.append(node("span", "candidate-expand-hint", "Full finalist details loaded by Luna"));

    const detail = node("div", "candidate-detail");
    const grid = node("div", "candidate-detail-grid");
    addFact(grid, "Total", money(candidate.totalPrice));
    addFact(grid, "Hub stay", `${candidate.hubNights ?? "—"} night${candidate.hubNights === 1 ? "" : "s"}`);
    addFact(grid, "Usable city time", `${candidate.usableCityHours ?? "—"} hours`);
    addFact(grid, "Destination stay", `${candidate.destinationNights ?? "—"} nights`);
    if (candidate.baselineDelta) addFact(grid, "Vs baseline", money(candidate.baselineDelta));
    addFact(grid, "Candidate status", candidate.candidateStatus ?? "—");
    if (candidate.facts?.returnSelfConnectMinutes != null) addFact(grid, "Return self-connect", `${candidate.facts.returnSelfConnectMinutes} min`);
    addFact(grid, "Ticket structure", "2 separate tickets · proxy economics until exact confirmation");
    detail.append(grid);
    card.append(detail);
    return card;
  }

  function syncLoadedFinalists() {
    if (!loadedCandidateIds.size || s.pricing?.phase !== "completed") return;
    const list = document.querySelector("#pricing-content .candidate-list.enhanced-candidate-list");
    if (!list) return;
    const nightFilter = activeNightFilter();

    for (const candidateId of loadedCandidateIds) {
      const candidate = s.pricing?.candidates?.find((item) => item?.id === candidateId);
      if (!candidate) continue;
      const shouldShow = nightFilter == null || Number(candidate.hubNights) === nightFilter;
      const existing = [...document.querySelectorAll("#pricing-content .interactive-candidate")]
        .find((card) => card.dataset.candidateId === candidateId);
      if (!shouldShow) {
        existing?.remove();
        continue;
      }
      if (!existing) list.append(createLoadedCandidateCard(candidate));
    }

    const badge = document.getElementById("pricing-badge");
    const total = s.pricing?.page?.fullAnalysis?.candidateUniverse?.total;
    if (badge && Number.isInteger(total) && total > 0) {
      const shown = document.querySelectorAll("#pricing-content .interactive-candidate").length;
      badge.textContent = `${total} analyzed · ${shown} loaded`;
    }
  }

  syncFns.unshift(syncLoadedFinalists);
})();
