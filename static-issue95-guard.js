(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C?.s?.phases) return;
  const phases = C.s.phases;
  let pricing = phases.pricing;

  try {
    Object.defineProperty(phases, "pricing", {
      configurable: true,
      enumerable: true,
      get: () => pricing,
      set: (value) => {
        // A read-only candidateDetails result carries pricingId and candidate
        // data, which the legacy stream heuristic can briefly mistake for a new
        // pricing run. A real pricing rerun clears s.pricing before setting the
        // phase to running, so only suppress the stale completed-result case.
        if (value === "running" && C.s.pricing?.phase === "completed") return;
        pricing = value;
      },
    });
  } catch {
    // The main workflow remains functional if this defensive guard cannot be installed.
  }
})();
