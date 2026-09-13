(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;
  const { s, node, money, formatDateTime, candidateName, candidateStatus, canAuthorizeConfirmation, syncFns, queue } = C;
  const previousFetch = globalThis.fetch.bind(globalThis);
  const CHAT_API = "cuberence-travel-api.vercel.app/api/v1/chat";
  const loadedCandidateIds = new Set();

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
    const index = (s.pricing?.candidates ?? []).findIndex((candidate) => candidate?.id === id);
    return index >= 0 ? index + 1 : null;
  }

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

    // candidateDetails is read-only. If the legacy state interceptor interpreted
    // the payload as pricing activity, restore the already-completed phase.
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

  function flightDesignator(flight) {
    const carrier = String(flight?.marketingCarrier ?? "").trim();
    const number = String(flight?.flightNumber ?? "").trim();
    if (!carrier && !number) return "Flight";
    if (carrier && number.toUpperCase().startsWith(carrier.toUpperCase())) return number;
    return `${carrier}${number}`;
  }

  function addFlight(detail, flight, role) {
    if (!flight) return;
    const row = node("div", "issue23-flight-row");
    row.append(node("span", "issue23-flight-role", role));
    const copy = node("div", "issue23-flight-detail");
    copy.append(node("strong", null, flightDesignator(flight)));
    copy.append(node("span", null, `${flight.origin ?? "—"} → ${flight.destination ?? "—"}`));
    copy.append(node("small", null, `${formatDateTime(flight.departure)} → ${formatDateTime(flight.arrival)}`));
    row.append(copy);
    detail.append(row);
  }

  function authorizationMessage(candidate) {
    const number = universeNumber(candidate);
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

  function sendAuthorization(candidate, checkbox) {
    if (!candidate || !canAuthorizeConfirmation(candidate)) {
      checkbox.checked = false;
      queue();
      return;
    }
    const input = document.getElementById("message-input");
    const form = document.getElementById("composer");
    if (!input || !form) return;

    document.querySelectorAll("#pricing-content input[type=checkbox]").forEach((other) => {
      if (other !== checkbox) other.checked = false;
    });
    s.selectedCandidateId = candidate.id;
    s.lastSentCandidateId = candidate.id;
    s.confirmationAuthorizedPending = true;
    s.phases.summary = "complete";
    s.phases.confirmation = "ready";
    s.phases.final = "waiting";

    input.value = authorizationMessage(candidate);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.requestSubmit();
    queue();
  }

  function selectionControl(candidate) {
    const label = node("label", "issue16-selection-control issue23-selection-control issue95-selection-control");
    const checkbox = node("input", "issue95-itinerary-checkbox");
    checkbox.type = "checkbox";
    const copy = node("span", "issue16-selection-copy issue23-selection-copy");
    copy.append(node("strong", null, "Select for Luna to confirm pricing"));
    copy.append(node("small", null, "Available after Luna finishes analysis and recommendation."));
    label.append(checkbox, copy);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) sendAuthorization(candidate, checkbox);
      else if (s.selectedCandidateId === candidate.id && !s.streamBusy) {
        s.selectedCandidateId = null;
        s.lastSentCandidateId = null;
        s.confirmationAuthorizedPending = false;
        queue();
      }
    });
    return label;
  }

  function createLoadedCandidateCard(candidate) {
    const number = universeNumber(candidate);
    const card = node("article", "candidate-card expanded issue95-loaded-finalist");
    card.dataset.candidateId = candidate.id;
    card.dataset.candidateNumber = number == null ? "" : String(number);

    const top = node("div", "candidate-top");
    const left = node("div");
    left.append(node("span", "issue25-candidate-number", `Candidate ${number ?? "—"}`));
    left.append(node("strong", "result-value", candidateName(candidate)));
    left.append(node("span", null, "Loaded by Luna from all analyzed candidates"));
    top.append(left);
    top.append(node("b", "candidate-price result-value", money(candidate.totalPrice)));
    card.append(top);

    const facts = node("div", "candidate-facts");
    facts.append(node("span", "result-value", `${candidate.hubNights ?? "—"} hub night${candidate.hubNights === 1 ? "" : "s"}`));
    facts.append(node("span", "result-value city-time-fact", `${candidate.usableCityHours ?? "—"} usable city hours`));
    facts.append(node("span", null, `${candidate.destinationNights ?? "—"} destination nights`));
    card.append(facts);
    if (candidate.baselineDelta) card.append(node("small", "result-value", `Vs baseline: ${money(candidate.baselineDelta)}`));

    const detail = node("div", "candidate-detail");
    const control = selectionControl(candidate);
    detail.append(control);
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

    if (candidate.exactSchedule) {
      const schedule = node("section", "issue23-schedule-block");
      const heading = node("div", "issue23-subheading");
      heading.append(node("strong", null, "Cuberence flight schedule"));
      heading.append(node("span", null, "Schedule truth — fare still indicative"));
      schedule.append(heading);
      addFlight(schedule, candidate.exactSchedule.outerOutbound, "Home → hub");
      addFlight(schedule, candidate.exactSchedule.innerOutbound, "Hub → destination");
      addFlight(schedule, candidate.exactSchedule.innerReturn, "Destination → hub");
      addFlight(schedule, candidate.exactSchedule.outerReturn, "Hub → home");
      detail.append(schedule);
    }

    const risks = Array.isArray(candidate.risks) ? candidate.risks : [];
    if (risks.length) {
      const risk = node("div", "candidate-risk-block");
      risk.append(node("strong", null, "Validation / risk flags"));
      risk.append(node("span", null, risks.map((value) => String(value).replaceAll("_", " ")).join(" · ")));
      detail.append(risk);
    }

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
      const existing = document.querySelector(`#pricing-content .issue95-loaded-finalist[data-candidate-id="${CSS.escape(candidateId)}"]`);
      if (!shouldShow) {
        existing?.remove();
        continue;
      }
      if (!existing) list.append(createLoadedCandidateCard(candidate));
      const card = document.querySelector(`#pricing-content .issue95-loaded-finalist[data-candidate-id="${CSS.escape(candidateId)}"]`);
      const checkbox = card?.querySelector(".issue95-itinerary-checkbox");
      const small = card?.querySelector(".issue95-selection-control small");
      if (checkbox) {
        const enabled = canAuthorizeConfirmation(candidate);
        checkbox.disabled = !enabled;
        checkbox.checked = s.selectedCandidateId === candidate.id;
      }
      if (small) {
        const status = candidateStatus(candidate);
        if (status === "CONFIRMED") small.textContent = "Exact fare is confirmed for this candidate.";
        else if (status === "EXACT_CHECK_FAILED") small.textContent = "This exact check failed. Choose another candidate if Luna recommends one.";
        else if (s.phases.summary !== "complete") small.textContent = "Available after Luna finishes analysis and recommendation.";
        else if (s.streamBusy || s.confirmationAuthorizedPending) small.textContent = "Luna is processing the current selection.";
        else small.textContent = "Checking this box explicitly authorizes exact fare confirmation for this candidate only.";
      }
    }

    const badge = document.getElementById("pricing-badge");
    const total = s.pricing?.page?.fullAnalysis?.candidateUniverse?.total;
    if (badge && Number.isInteger(total) && total > 0) {
      const loaded = (s.pricing?.candidates ?? []).length;
      badge.textContent = `${total} analyzed · ${loaded} full details loaded`;
    }
  }

  syncFns.push(syncLoadedFinalists);
})();
