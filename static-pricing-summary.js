(() => {
  const originalFetch = globalThis.fetch.bind(globalThis);
  let latestPricing = null;
  let renderQueued = false;

  function isChatRequest(input) {
    const url = typeof input === "string" ? input : input?.url;
    return typeof url === "string" && url.includes("cuberence-travel-api.vercel.app/api/v1/chat");
  }

  function money(value) {
    if (!value || typeof value.amount !== "number") return "—";
    return `${value.currency ?? ""} ${value.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  }

  function humanizeRejection(code) {
    const known = {
      RETURN_SELF_CONNECT_TOO_SHORT: "Return self-connect below the 4-hour minimum",
      NO_MATCHING_FARE: "No matching fare for the schedule-feasible option",
      CURRENCY_MISMATCH: "Fare currency did not match the requested currency",
    };
    return known[code] ?? String(code).toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function renderSummary() {
    renderQueued = false;
    if (!latestPricing?.output || latestPricing.output.phase !== "completed") return;
    const target = document.getElementById("pricing-content");
    if (!target) return;

    const output = latestPricing.output;
    const candidates = Array.isArray(output.candidates) ? output.candidates : [];
    const rejections = output.rejectionCounts && typeof output.rejectionCounts === "object" ? output.rejectionCounts : {};
    const baseline = output.baseline;
    const fingerprint = JSON.stringify([
      output.pricingId,
      candidates.length,
      baseline?.price?.amount,
      rejections,
    ]);

    const existing = target.querySelector("[data-pricing-summary]");
    if (existing?.dataset.fingerprint === fingerprint) return;
    existing?.remove();

    const summary = node("section", "pricing-result-summary");
    summary.dataset.pricingSummary = "true";
    summary.dataset.fingerprint = fingerprint;

    const heading = node("div", "pricing-result-heading");
    const headingCopy = node("div");
    headingCopy.append(node("strong", null, candidates.length ? `${candidates.length} viable candidate${candidates.length === 1 ? "" : "s"}` : "0 viable candidates"));
    headingCopy.append(node("span", null, `${output.strategy ?? "Pricing"} · ${(output.selectedHubs ?? []).join(" + ") || "selected hubs"}`));
    heading.append(headingCopy);
    heading.append(node("span", `pricing-result-state ${candidates.length ? "has-results" : "no-results"}`, "Completed"));
    summary.append(heading);

    if (baseline?.price) {
      const baselineCard = node("div", "baseline-card");
      const left = node("div");
      left.append(node("span", null, "Baseline reference"));
      left.append(node("strong", null, money(baseline.price)));
      baselineCard.append(left);
      const legs = Array.isArray(baseline.legs) ? baseline.legs : [];
      if (legs.length) {
        const first = legs[0];
        const last = legs[legs.length - 1];
        baselineCard.append(node("small", null, `${first?.origin ?? ""} → ${first?.destination ?? ""} · return ${last?.departure?.slice?.(0, 10) ?? ""}`));
      }
      summary.append(baselineCard);
    }

    const rejectionEntries = Object.entries(rejections).filter(([, count]) => Number(count) > 0);
    if (rejectionEntries.length) {
      const block = node("div", "rejection-summary");
      block.append(node("strong", null, candidates.length ? "Rejected alternatives" : "Why no candidate survived"));
      for (const [code, count] of rejectionEntries) {
        const row = node("div", "rejection-row");
        row.append(node("span", null, humanizeRejection(code)));
        row.append(node("b", null, String(count)));
        block.append(row);
      }
      summary.append(block);
    }

    const warnings = Array.isArray(output.warnings) ? output.warnings : [];
    if (warnings.length) {
      const warning = node("div", "pricing-warning");
      warning.append(node("strong", null, "Warnings"));
      warning.append(node("span", null, warnings.join(" · ")));
      summary.append(warning);
    }

    if (!candidates.length) {
      target.replaceChildren(summary);
    } else {
      target.prepend(summary);
    }
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(renderSummary);
  }

  async function inspectStream(response) {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
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
        const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!data || data === "[DONE]") continue;
        try {
          const event = JSON.parse(data);
          if (event.type === "tool-output-available" && event.output?.phase === "completed" && event.output?.pricingId) {
            latestPricing = { toolCallId: event.toolCallId, output: event.output };
            queueRender();
          }
        } catch {
          // Ignore malformed diagnostic chunks; the primary app owns stream errors.
        }
      }
    }
  }

  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (isChatRequest(args[0]) && response.body) {
      inspectStream(response.clone()).catch(() => {});
    }
    return response;
  };

  const start = () => {
    const target = document.getElementById("pricing-content");
    if (!target) return;
    new MutationObserver(queueRender).observe(target, { childList: true, subtree: true });
    queueRender();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
