(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;
  const { s, node, money, formatDateTime, candidateName, candidateStatus, effectiveCandidate, visibleCandidates, syncFns } = C;

  function range(proxy) {
    const r = proxy?.observedRange;
    const cur = proxy?.price?.currency;
    return r && cur && Number.isFinite(r.min) && Number.isFinite(r.max)
      ? `${cur} ${r.min.toLocaleString(undefined, { maximumFractionDigits: 2 })}–${r.max.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : null;
  }

  function flightRow(flight, role) {
    if (!flight) return null;
    const row = node("div", "issue23-flight-row");
    row.append(node("span", "issue23-flight-role", role));
    const detail = node("div", "issue23-flight-detail");
    detail.append(node("strong", null, `${flight.marketingCarrier ?? ""}${flight.flightNumber ?? ""}` || "Flight"));
    detail.append(node("span", null, `${flight.origin ?? "—"} → ${flight.destination ?? "—"}`));
    detail.append(node("small", null, `${formatDateTime(flight.departure)} → ${formatDateTime(flight.arrival)}`));
    row.append(detail);
    return row;
  }

  function scheduleBlock(candidate, status) {
    const exact = candidate?.exactSchedule;
    if (!exact) return null;
    const block = node("section", "issue23-schedule-block");
    const heading = node("div", "issue23-subheading");
    heading.append(node("strong", null, status === "CONFIRMED" ? "Selected flight schedule" : "Exact schedule from AeroDataBox"));
    if (status !== "CONFIRMED") heading.append(node("span", null, "Schedule truth — fare still indicative"));
    block.append(heading);
    [
      [exact.outerOutbound, "Home → hub"],
      [exact.innerOutbound, "Hub → destination"],
      [exact.innerReturn, "Destination → hub"],
      [exact.outerReturn, "Hub → home"],
    ].forEach(([flight, role]) => {
      const row = flightRow(flight, role);
      if (row) block.append(row);
    });
    return block;
  }

  function proxyBlock(candidate) {
    const proxy = candidate?.proxyPricing;
    if (!proxy) return null;
    const block = node("div", "issue23-proxy-evidence");
    block.append(node("strong", null, "Indicative Sabre economics"));
    const count = Number.isFinite(proxy.outer?.proxyOfferCount) && Number.isFinite(proxy.inner?.proxyOfferCount)
      ? proxy.outer.proxyOfferCount + proxy.inner.proxyOfferCount
      : null;
    const details = [
      proxy.basis ? `Basis: ${String(proxy.basis).replaceAll("_", " ")}` : null,
      range(proxy) ? `Observed range: ${range(proxy)}` : null,
      count != null ? `Proxy offers: ${count}` : null,
    ].filter(Boolean).join(" · ");
    block.append(node("span", null, details || "Proxy pricing evidence available."));
    return block;
  }

  function confirmedBlock(candidate) {
    const pricing = candidate?.confirmedPricing ?? s.confirmation?.confirmedPricing;
    if (!pricing) return null;
    const block = node("div", "issue23-confirmed-evidence");
    block.append(node("strong", null, `Confirmed fare ${money(pricing.price)}`));
    const details = [
      pricing.proxyPrice ? `Indicative was ${money(pricing.proxyPrice)}` : null,
      pricing.delta ? `Change ${money(pricing.delta)}${Number.isFinite(pricing.deltaPercent) ? ` (${pricing.deltaPercent.toFixed(1)}%)` : ""}` : null,
    ].filter(Boolean).join(" · ");
    if (details) block.append(node("span", null, details));
    return block;
  }

  function confirmedTickets(candidate) {
    const pricing = candidate?.confirmedPricing ?? s.confirmation?.confirmedPricing;
    if (!pricing?.outerOffer && !pricing?.innerOffer) return null;
    const block = node("section", "issue23-confirmed-offers");
    const heading = node("div", "issue23-subheading");
    heading.append(node("strong", null, "Exact Sabre-confirmed tickets"));
    heading.append(node("span", null, "Final fare evidence"));
    block.append(heading);
    [["Outer ticket", pricing.outerOffer], ["Inner ticket", pricing.innerOffer]].forEach(([label, offer]) => {
      if (!offer) return;
      const ticket = node("div", "issue23-confirmed-ticket");
      const top = node("div", "issue23-confirmed-ticket-top");
      top.append(node("strong", null, label));
      top.append(node("span", null, money(offer.price)));
      ticket.append(top);
      for (const leg of offer.legs ?? []) {
        for (const segment of leg.segments ?? []) {
          const row = flightRow(segment, `${leg.origin ?? segment.origin} → ${leg.destination ?? segment.destination}`);
          if (row) ticket.append(row);
        }
      }
      block.append(ticket);
    });
    return block;
  }

  function updateFact(detail, label, value, replacementLabel) {
    for (const fact of detail?.querySelectorAll(".candidate-detail-fact") ?? []) {
      const key = fact.querySelector("span");
      if (key?.textContent?.trim() !== label) continue;
      if (replacementLabel) key.textContent = replacementLabel;
      const strong = fact.querySelector("strong");
      if (strong && value != null) strong.textContent = value;
      return;
    }
  }

  function selectionControl(candidate) {
    const label = node("label", "issue16-selection-control issue23-selection-control");
    const checkbox = node("input", "issue16-itinerary-checkbox issue23-itinerary-checkbox");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", `Select ${candidateName(candidate)} trip for Luna analysis`);
    const copy = node("span", "issue16-selection-copy issue23-selection-copy");
    copy.append(node("strong", null, "Select this trip for Luna analysis"));
    copy.append(node("small", null, "Luna analyzes this indicative candidate first. Exact fare confirmation follows only if Luna recommends it."));
    label.append(checkbox, copy);
    return label;
  }

  function decorate(card, candidate) {
    if (!card || !candidate?.id) return;
    const effective = effectiveCandidate(candidate);
    const status = candidateStatus(candidate);
    const selected = s.selectedCandidateId === candidate.id;
    card.dataset.candidateId = candidate.id;
    card.dataset.pricingStatus = status;
    card.classList.toggle("is-itinerary-selected", selected);

    const top = card.querySelector(".candidate-top");
    if (top) {
      let badge = top.querySelector(".issue23-price-state");
      if (!badge) {
        badge = node("span", "issue23-price-state");
        const price = top.querySelector(".candidate-price");
        if (price) price.before(badge); else top.append(badge);
      }
      badge.textContent = ({
        UNPRICED: "Unpriced",
        PROXY: "Indicative price",
        EXACT_CHECK_PENDING: "Exact check pending",
        CONFIRMED: "Confirmed fare",
        EXACT_CHECK_FAILED: "Exact check failed",
      })[status] ?? status;
      const price = top.querySelector(".candidate-price");
      if (price) price.textContent = money(status === "CONFIRMED" ? effective.totalPrice : candidate.totalPrice);
    }

    const detail = card.querySelector(".candidate-detail");
    if (!detail) return;
    updateFact(detail, "Total", money(status === "CONFIRMED" ? effective.totalPrice : candidate.totalPrice), status === "CONFIRMED" ? "Confirmed total" : "Indicative total");
    updateFact(detail, "Ticket structure", status === "CONFIRMED" ? "2 separate tickets · exact fare confirmed" : "2 separate tickets · proxy economics until exact confirmation");
    detail.querySelectorAll(".issue23-schedule-block,.issue23-proxy-evidence,.issue23-confirmed-evidence,.issue23-confirmed-offers,.issue23-luna-recommendation,.issue23-exact-failure").forEach((element) => element.remove());

    let control = detail.querySelector(".issue23-selection-control");
    if (!control) {
      control = selectionControl(candidate);
      detail.prepend(control);
    }
    const checkbox = control.querySelector(".issue23-itinerary-checkbox");
    if (checkbox) checkbox.checked = selected;

    let anchor = control;
    if (status === "EXACT_CHECK_PENDING") {
      const recommendation = node("div", "issue23-luna-recommendation", "Recommended by Luna — exact fare confirmation required");
      anchor.after(recommendation);
      anchor = recommendation;
    }
    const schedule = scheduleBlock(effective, status) ?? scheduleBlock(candidate, status);
    if (schedule) {
      anchor.after(schedule);
      anchor = schedule;
    }
    if (status === "CONFIRMED") {
      for (const block of [confirmedBlock(effective), confirmedTickets(effective)]) {
        if (!block) continue;
        anchor.after(block);
        anchor = block;
      }
    } else {
      const proxy = proxyBlock(candidate);
      if (proxy) {
        anchor.after(proxy);
        anchor = proxy;
      }
    }

    detail.querySelectorAll(":scope > .ticket-detail").forEach((element) => { element.hidden = true; });
    if (status === "EXACT_CHECK_FAILED") {
      detail.append(node("div", "issue23-exact-failure", effective?.exactCheckFailure?.message ?? s.confirmation?.message ?? "Exact fare confirmation did not validate this candidate."));
    }
  }

  function syncCandidates() {
    if (s.pricing?.phase !== "completed") return;
    const cards = [...document.querySelectorAll("#pricing-content .interactive-candidate")];
    const candidates = visibleCandidates();
    cards.forEach((card, index) => decorate(card, candidates[index]));
    const badge = document.getElementById("pricing-badge");
    if (badge) {
      const count = s.pricing.candidates?.length ?? 0;
      badge.textContent = `${count} indicative candidate${count === 1 ? "" : "s"}`;
    }
  }

  syncFns.push(syncCandidates);
  const start = () => syncCandidates();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
