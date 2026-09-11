(() => {
  const previousFetch = globalThis.fetch.bind(globalThis);
  const API = "cuberence-travel-api.vercel.app/api/v1/chat";
  const stages = ["intent", "baseline", "discovery", "pricing", "summary", "confirmation", "final"];
  const s = {
    discovery: null,
    pricing: null,
    pricingId: null,
    selectedCandidateId: null,
    lastSentCandidateId: null,
    confirmation: null,
    confirmationCandidateId: null,
    confirmationAuthorizedPending: false,
    analysisTextSeen: false,
    reviewTextSeen: false,
    streamBusy: false,
    toolNames: new Map(),
    phases: Object.fromEntries(stages.map((x) => [x, "waiting"])),
  };
  const syncFns = [];
  let queued = false;
  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const money = (v) => v && typeof v.amount === "number" ? `${v.currency ?? ""} ${v.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim() : "—";
  const formatDateTime = (v) => {
    if (typeof v !== "string" || !v) return "—";
    const match = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/);
    if (!match) return v.replace("T", " ").replace(/:00(?=[+-]|Z|$)/, "");
    const [, year, month, day, hour, minute] = match;
    const localClock = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).format(localClock);
  };
  const candidateName = (c) => c?.hub?.name ?? c?.hub?.city ?? c?.hub?.id ?? "Stayover";
  const candidateNumber = (candidateOrId) => {
    const id = typeof candidateOrId === "string" ? candidateOrId : candidateOrId?.id;
    if (!id) return null;
    const index = (s.pricing?.candidates ?? []).findIndex((candidate) => candidate?.id === id);
    return index >= 0 ? index + 1 : null;
  };
  const candidateStatus = (c) => {
    const x = s.confirmationCandidateId === c?.id ? s.confirmation : null;
    if (x?.status === "CONFIRMED") return "CONFIRMED";
    if (x?.status === "EXACT_CHECK_FAILED") return "EXACT_CHECK_FAILED";
    if (s.phases.confirmation === "running" && s.confirmationCandidateId === c?.id) return "EXACT_CHECK_PENDING";
    return c?.pricingStatus ?? (c?.proxyPricing ? "PROXY" : "UNPRICED");
  };
  const effectiveCandidate = (c) => s.confirmationCandidateId === c?.id && s.confirmation?.candidate ? s.confirmation.candidate : c;
  const evaluation = (id) => (s.pricing?.evaluations ?? []).find((x) => x?.candidateId === id) ?? null;
  const visibleCandidates = () => {
    const all = Array.isArray(s.pricing?.candidates) ? s.pricing.candidates : [];
    const t = document.querySelector("#pricing-content .pricing-filter.active")?.textContent?.trim().toLowerCase() ?? "";
    const n = t.startsWith("1 night") ? 1 : t.startsWith("2 nights") ? 2 : t.startsWith("3 nights") ? 3 : null;
    return n == null ? all : all.filter((c) => Number(c?.hubNights) === n);
  };
  const canAuthorizeConfirmation = (candidate) => {
    if (!candidate || s.streamBusy || s.confirmationAuthorizedPending) return false;
    if (candidateStatus(candidate) !== "PROXY") return false;
    if (s.phases.summary !== "complete") return false;
    return s.phases.confirmation === "ready" || s.phases.confirmation === "error";
  };
  function sync() { queued = false; for (const fn of syncFns) fn(); }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(sync); } }

  function resetPostPricingState() {
    s.selectedCandidateId = null;
    s.lastSentCandidateId = null;
    s.confirmation = null;
    s.confirmationCandidateId = null;
    s.confirmationAuthorizedPending = false;
    s.analysisTextSeen = false;
    s.reviewTextSeen = false;
  }

  function toolInput(tool, data) {
    if (tool === "baseline") {
      Object.assign(s.phases, { intent: "complete", baseline: "running", discovery: "waiting", pricing: "waiting", summary: "waiting", confirmation: "waiting", final: "waiting" });
      resetPostPricingState();
    } else if (tool === "discovery") {
      s.discovery = null;
      s.phases.intent = "complete";
      s.phases.discovery = "running";
    } else if (tool === "pricing") {
      s.phases.discovery = "complete";
      s.pricing = null;
      s.pricingId = null;
      resetPostPricingState();
      Object.assign(s.phases, { pricing: "running", summary: "waiting", confirmation: "waiting", final: "waiting" });
    } else if (tool === "confirmation") {
      s.confirmationAuthorizedPending = false;
      s.confirmationCandidateId = data?.candidateId ?? s.confirmationCandidateId;
      s.selectedCandidateId = s.confirmationCandidateId ?? s.selectedCandidateId;
      s.reviewTextSeen = false;
      Object.assign(s.phases, { summary: "complete", confirmation: "running", final: "waiting" });
    }
  }

  function toolOutput(tool, data) {
    if (!data) return;
    if (tool === "baseline" || (data.baselineId && !data.discoveryId && !data.pricingId)) {
      s.phases.baseline = data.phase === "completed" ? "complete" : data.phase === "failed" ? "error" : "running";
    } else if (tool === "discovery" || (data.discoveryId && !data.pricingId)) {
      if (data.phase === "completed") s.discovery = data;
      s.phases.discovery = data.phase === "completed"
        ? (Array.isArray(data.hubs) && data.hubs.length ? "ready" : "complete")
        : data.phase === "failed" ? "error" : "running";
    } else if (tool === "pricing" || (data.pricingId && Array.isArray(data.candidates))) {
      if (data.phase === "completed" && Array.isArray(data.candidates)) {
        s.pricing = data;
        s.pricingId = data.pricingId;
        s.analysisTextSeen = false;
        s.phases.pricing = "complete";
        s.phases.summary = s.streamBusy ? "running" : "ready";
        s.phases.confirmation = "waiting";
      } else {
        s.phases.pricing = data.phase === "failed" ? "error" : "running";
      }
    } else if (tool === "confirmation" || (["CONFIRMED", "EXACT_CHECK_FAILED"].includes(data.status) && data.candidateId)) {
      s.confirmation = data;
      s.confirmationCandidateId = data.candidateId ?? s.confirmationCandidateId;
      s.confirmationAuthorizedPending = false;
      s.reviewTextSeen = false;
      s.phases.summary = "complete";
      s.phases.confirmation = data.status === "CONFIRMED" ? "complete" : "error";
      s.phases.final = data.status === "CONFIRMED" ? "running" : "waiting";
      if (data.status === "EXACT_CHECK_FAILED") {
        s.selectedCandidateId = null;
        s.lastSentCandidateId = null;
      }
    }
  }

  function capture(e) {
    if (!e?.type) return;
    if (e.type === "tool-input-start" && e.toolCallId) {
      s.toolNames.set(e.toolCallId, e.toolName);
      toolInput(e.toolName);
    }
    if (e.type === "tool-input-available" && e.toolCallId) {
      s.toolNames.set(e.toolCallId, e.toolName);
      toolInput(e.toolName, e.input);
    }
    if (e.type === "tool-output-available") toolOutput(e.toolName ?? s.toolNames.get(e.toolCallId), e.output);
    if (e.type === "text-delta" && String(e.delta ?? "").trim()) {
      if (s.pricing?.phase === "completed" && ["waiting", "ready"].includes(s.phases.confirmation) && s.phases.summary === "running") {
        s.analysisTextSeen = true;
      }
      if (s.confirmation?.status === "CONFIRMED") s.reviewTextSeen = true;
    }
    if (e.type === "tool-output-error") {
      const tool = e.toolName ?? s.toolNames.get(e.toolCallId);
      if (tool === "confirmation") {
        s.confirmationAuthorizedPending = false;
        s.phases.confirmation = "error";
        s.phases.final = "waiting";
        s.selectedCandidateId = null;
        s.lastSentCandidateId = null;
      } else if (s.phases[tool]) {
        s.phases[tool] = "error";
      }
    }
    queue();
  }

  async function inspect(response) {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        while (true) {
          const m = buffer.match(/\r?\n\r?\n/);
          if (!m || m.index == null) break;
          const raw = buffer.slice(0, m.index);
          buffer = buffer.slice(m.index + m[0].length);
          const data = raw.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
          if (!data || data === "[DONE]") continue;
          try { capture(JSON.parse(data)); } catch { /* primary app owns malformed stream errors */ }
        }
      }
    } finally {
      s.streamBusy = false;
      if (s.pricing?.phase === "completed" && s.phases.summary === "running" && ["waiting", "ready"].includes(s.phases.confirmation)) {
        s.phases.summary = s.analysisTextSeen ? "complete" : "ready";
        s.phases.confirmation = s.analysisTextSeen ? "ready" : "waiting";
      }
      if (s.confirmationAuthorizedPending && s.phases.confirmation !== "running") {
        s.confirmationAuthorizedPending = false;
        if (s.phases.summary === "complete") s.phases.confirmation = "ready";
      }
      if (s.confirmation?.status === "CONFIRMED") s.phases.final = s.reviewTextSeen ? "complete" : "ready";
      globalThis.CuberenceIssue23?.releaseScrollGuard?.();
      queue();
    }
  }

  globalThis.fetch = async (...args) => {
    const chat = typeof args[0] === "string" ? args[0].includes(API) : args[0]?.url?.includes(API);
    if (chat) {
      s.streamBusy = true;
      if (s.pricing?.phase === "completed" && !s.confirmationAuthorizedPending && s.phases.confirmation !== "running" && s.confirmation?.status !== "CONFIRMED") {
        s.phases.summary = "running";
        s.analysisTextSeen = false;
      }
      queue();
    }
    const response = await previousFetch(...args);
    if (chat && response.body) {
      inspect(response.clone()).catch(() => {
        s.streamBusy = false;
        s.confirmationAuthorizedPending = false;
        globalThis.CuberenceIssue23?.releaseScrollGuard?.();
        queue();
      });
    }
    return response;
  };

  globalThis.CuberenceIssue23 = {
    s,
    stages,
    node,
    money,
    formatDateTime,
    candidateName,
    candidateNumber,
    candidateStatus,
    effectiveCandidate,
    evaluation,
    visibleCandidates,
    canAuthorizeConfirmation,
    syncFns,
    queue,
  };
})();
