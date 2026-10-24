(() => {
  const C = globalThis.CuberenceIssue23;
  if (!C) return;
  const {
    s,
    node,
    money,
    formatDateTime,
    candidateName,
    candidateNumber,
    candidateStatus,
    effectiveCandidate,
    visibleCandidates,
    canAuthorizeConfirmation,
    syncFns,
  } = C;

  function range(proxy) {
    const r = proxy?.observedRange;
    const cur = proxy?.price?.currency;
    return r && cur && Number.isFinite(r.min) && Number.isFinite(r.max)
      ? `${cur} ${r.min.toLocaleString(undefined, { maximumFractionDigits: 2 })}–${r.max.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : null;
  }

  function flightDesignator(flight) {
    const marketingCarrier = String(flight?.marketingCarrier ?? "").trim();
    const flightNumber = String(flight?.flightNumber ?? "").trim();
    if (!marketingCarrier && !flightNumber) return "Flight";
    if (marketingCarrier && flightNumber.toUpperCase().startsWith(marketingCarrier.toUpperCase())) return flightNumber;
    return `${marketingCarrier}${flightNumber}`;
  }

  function flightRow(flight, role) {
    if (!flight) return null;
    const row = node("div", "issue23-flight-row");
    row.append(node("span", "issue23-flight-role", role));
    const detail = node("div", "issue23-flight-detail");
    detail.append(node("strong", null, flightDesignator(flight)));
    const marketingCarrier = String(flight.marketingCarrier ?? "").trim().toUpperCase();
    const operatingCarrier = String(flight.operatingCarrier ?? "").trim().toUpperCase();
    const codeshareStatus = String(flight.codeshareStatus ?? "").trim();
    if (operatingCarrier && marketingCarrier && operatingCarrier !== marketingCarrier) {
      detail.append(node("small", "codeshare-operator-label",
        `Marketed by ${marketingCarrier} · Operated by ${operatingCarrier}`));
    } else if (codeshareStatus === "IS_CODESHARED") {
      detail.append(node("small", "codeshare-operator-label",
        `Marketed by ${marketingCarrier || "airline"} · Operating airline not verified`));
    }
    detail.append(node("span", null, `${flight.origin ?? "—"} → ${flight.destination ?? "—"}`));
    detail.append(node("small", null, `${formatDateTime(flight.departure, flight.originTimeZone)} → ${formatDateTime(flight.arrival, flight.destinationTimeZone)}`));
    row.append(detail);
    return row;
  }

  function scheduleBlock(candidate, status) {
    const exact = candidate?.exactSchedule;
    if (!exact) return null;
    const block = node("section", "issue23-schedule-block");
    const heading = node("div", "issue23-subheading");
    heading.append(node("strong", null, status === "CONFIRMED" ? "Confirmed flight schedule" :
      status === "SCHEDULE_CHANGED" ? "Advisor-selected schedule (NOT fare-confirmed)" : "Cuberence flight schedule"));
    if (status === "UNPRICED") heading.append(node("span", null, "Direct schedule available — exact price required"));
    else if (status !== "CONFIRMED") heading.append(node("span", null, "Schedule truth — fare still indicative"));
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

  function kiwiOfferLinks(candidate, indicative = true) {
    const block = node("div", "kiwi-ticket-links");
    const exactPricing = candidate?.confirmedPricing ??
      (candidate?.id && s.confirmation?.candidateId === candidate.id ? s.confirmation.confirmedPricing : undefined);
    const offers = indicative ? candidate?.offers ?? []
      : [exactPricing?.outerOffer, exactPricing?.innerOffer].filter(Boolean);
    for (const offer of offers) {
      const outbound = offer.legs?.[0];
      const route = outbound ? `${outbound.origin} ↔ ${outbound.destination}` : "Ticket";
      const link = globalThis.CuberenceKiwiTicketLink?.(offer,
        `${route} on Kiwi${indicative ? " (indicative)" : ""} ↗`);
      if (link) block.append(link);
    }
    return block.childElementCount ? block : null;
  }

  function proxyBlock(candidate) {
    const proxy = candidate?.proxyPricing;
    if (!proxy) return null;
    const block = node("div", "issue23-proxy-evidence");
    block.append(node("strong", null, "Indicative ticket pricing"));
    const count = Number.isFinite(proxy.outer?.proxyOfferCount) && Number.isFinite(proxy.inner?.proxyOfferCount)
      ? proxy.outer.proxyOfferCount + proxy.inner.proxyOfferCount
      : null;
    const details = [
      proxy.basis ? `Basis: ${String(proxy.basis).replaceAll("_", " ")}` : null,
      range(proxy) ? `Observed range: ${range(proxy)}` : null,
      count != null ? `Proxy offers: ${count}` : null,
    ].filter(Boolean).join(" · ");
    block.append(node("span", null, details || "Proxy pricing evidence available."));
    const links = kiwiOfferLinks(candidate);
    if (links) block.append(links);
    return block;
  }

  function unpricedBlock(candidate) {
    const block = node("div", "issue23-proxy-evidence issue103-unpriced-evidence");
    block.append(node("strong", null, "Exact price required"));
    block.append(node("span", null, "Cuberence found the direct flight schedule, but no direct indicative fare is available. Select this candidate to run the exact flight/fare check."));
    const links = kiwiOfferLinks(candidate);
    if (links) block.append(links);
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
    heading.append(node("strong", null, "Exact-confirmed tickets"));
    heading.append(node("span", null, "Final fare evidence"));
    block.append(heading);
    [["Outer ticket", pricing.outerOffer], ["Inner ticket", pricing.innerOffer]].forEach(([label, offer]) => {
      if (!offer) return;
      const ticket = node("div", "issue23-confirmed-ticket");
      const top = node("div", "issue23-confirmed-ticket-top");
      top.append(node("strong", null, label));
      top.append(node("span", null, money(offer.price)));
      ticket.append(top);
      const kiwiLink = globalThis.CuberenceKiwiTicketLink?.(offer);
      if (kiwiLink) ticket.append(kiwiLink);
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


  // A priced alternative is never labeled a confirmed fare for the
  // advisor-selected timetable. Use the selected airport timezones for both
  // timestamps, including Kiwi UTC and Sabre offset-bearing values.
  function scheduleChangeBlock(candidate) {
    const change = candidate?.scheduleChange ?? (candidate?.id && s.confirmation?.candidateId === candidate.id
      ? s.confirmation.scheduleChange : undefined);
    if (!change) return null;
    const block = node("section", "issue23-schedule-changed issue23-exact-failure");
    const certTest = change.provider === "SABRE" && change.outerOffer?.environment === "CERT";
    block.append(node("strong", null, certTest
      ? "Sabre CERT test timetable differs — Cuberence schedule retained"
      : "Pricing-provider timetable differs — selected itinerary NOT confirmed"));
    block.append(node("span", null,
      certTest
        ? `Sabre CERT supplied test fare evidence of ${money(change.alternativePrice)} for the same flight numbers and dates, but its test times differ. Your original Cuberence flight schedule remains unchanged. This is not a live bookable quote or an exact fare for your selected times.`
        : `${change.provider ?? "Fare provider"} priced a different timetable at ${money(change.alternativePrice)}. This price applies only to the provider-returned flights, not the itinerary you selected.`));
    const selected = candidate?.exactSchedule;
    const selectedByRole = {
      HOME_TO_HUB: selected?.outerOutbound,
      HUB_TO_DESTINATION: selected?.innerOutbound,
      DESTINATION_TO_HUB: selected?.innerReturn,
      HUB_TO_HOME: selected?.outerReturn,
    };
    for (const difference of change.differences ?? []) {
      const flight = selectedByRole[difference.role] ?? {};
      const title = node("strong", null, `${difference.flightNumber ?? "Flight"} · ${difference.airports ?? ""}`);
      block.append(title);
      const formatted = (item, zone) => {
        if (!item) return;
        // Do not silently display a raw UTC instant as an airport-local time.
        const dateText = value => zone ? formatDateTime(value, zone) : String(value);
        const delta = Number.isFinite(item.differenceMinutes)
          ? ` (${item.differenceMinutes > 0 ? "+" : ""}${item.differenceMinutes} min)` : " (time could not be compared)";
        block.append(node("span", null,
          `${item === difference.departure ? "Departure" : "Arrival"}: selected ${dateText(item.selected)} → priced ${dateText(item.priced)}${delta}`));
      };
      formatted(difference.departure, flight.originTimeZone);
      formatted(difference.arrival, flight.destinationTimeZone);
    }
    const a = change.alternativeAssessment;
    if (a) block.append(node("span", null,
      `Revalidated alternative: ${String(a.candidateStatus ?? "UNKNOWN").replaceAll("_", " ")} · ${a.hubNights} hub nights · ${a.usableCityHours} usable city hours · return self-connect ${a.returnSelfConnectMinutes ?? "unknown"} minutes. Risks: ${(a.risks ?? []).join(", ") || "none reported"}.`));
    block.append(node("span", null, "The advisor has not authorized replacing the selected itinerary. No alternative has been booked."));
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
    const number = candidateNumber(candidate);
    const label = node("label", "issue16-selection-control issue23-selection-control");
    const checkbox = node("input", "issue16-itinerary-checkbox issue23-itinerary-checkbox");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", `Select Candidate ${number ?? ""} ${candidateName(candidate)} for Luna to confirm pricing`.trim());
    const copy = node("span", "issue16-selection-copy issue23-selection-copy");
    copy.append(node("strong", null, "Select for Luna to confirm pricing"));
    copy.append(node("small", null, "Available after Luna finishes analysis and recommendation."));
    label.append(checkbox, copy);
    return label;
  }

  function updateSelectionControl(control, candidate, status, selected) {
    const checkbox = control.querySelector(".issue23-itinerary-checkbox");
    const small = control.querySelector(".issue23-selection-copy small");
    const enabled = canAuthorizeConfirmation(candidate);
    const number = candidateNumber(candidate);

    control.classList.toggle("is-confirmation-locked", !enabled && (status === "PROXY" || status === "UNPRICED"));
    if (checkbox) {
      checkbox.checked = selected;
      checkbox.disabled = !enabled;
      checkbox.setAttribute("aria-label", `Select Candidate ${number ?? ""} ${candidateName(candidate)} for Luna to confirm pricing`.trim());
    }

    if (!small) return;
    if (status === "CONFIRMED") small.textContent = "Exact fare is confirmed for this candidate.";
    else if (status === "SCHEDULE_CHANGED") small.textContent = candidate.scheduleChange?.provider === "SABRE" && candidate.scheduleChange?.outerOffer?.environment === "CERT"
      ? "Sabre CERT test times differ; the Cuberence flight schedule is unchanged. Test fare evidence only."
      : "Pricing provider returned different flight times. The selected itinerary is NOT fare-confirmed.";
    else if (status === "EXACT_CHECK_PENDING") small.textContent = "Exact confirmation is running for this candidate.";
    else if (status === "EXACT_PRICE_UNAVAILABLE") small.textContent = "Sabre could not provide an exact fare for this valid schedule. Indicative pricing remains available.";
    else if (status === "EXACT_CHECK_FAILED") {
      const errorCode = String(effectiveCandidate(candidate)?.exactCheckFailure?.code ?? "");
      small.textContent = /^(SABRE|KIWI)_EXACT_CHECK_ERROR$/.test(errorCode)
        ? "Temporary fare-provider error. Check this box again to authorize one fresh retry."
        : "Exact check failed its final validation. Review another candidate.";
    }
    else if (s.phases.summary !== "complete") small.textContent = "Available after Luna finishes analysis and recommendation.";
    else if (s.streamBusy || s.confirmationAuthorizedPending) small.textContent = "Luna is processing the current selection.";
    else if (status === "UNPRICED") small.textContent = "Checking this box explicitly authorizes the exact flight/fare check for this direct schedule.";
    else small.textContent = "Checking this box explicitly authorizes exact fare confirmation for this candidate only.";
  }

  function decorate(card, candidate) {
    if (!card || !candidate?.id) return;
    const effective = effectiveCandidate(candidate);
    const status = candidateStatus(candidate);
    const selected = s.selectedCandidateId === candidate.id;
    const number = candidateNumber(candidate);
    card.dataset.candidateId = candidate.id;
    card.dataset.candidateNumber = number == null ? "" : String(number);
    card.dataset.pricingStatus = status;
    card.classList.toggle("is-itinerary-selected", selected);

    const top = card.querySelector(".candidate-top");
    if (top) {
      const left = top.firstElementChild;
      if (left) {
        let numberBadge = left.querySelector(".issue25-candidate-number");
        if (!numberBadge) {
          numberBadge = node("span", "issue25-candidate-number");
          left.prepend(numberBadge);
        }
        numberBadge.textContent = `Candidate ${number ?? "—"}`;
      }

      let badge = top.querySelector(".issue23-price-state");
      if (!badge) {
        badge = node("span", "issue23-price-state");
        const price = top.querySelector(".candidate-price");
        if (price) price.before(badge); else top.append(badge);
      }
      badge.textContent = ({
        UNPRICED: "Exact price required",
        PROXY: "Indicative price",
        EXACT_CHECK_PENDING: "Exact check pending",
        CONFIRMED: "Confirmed fare",
        SCHEDULE_CHANGED: effective.scheduleChange?.provider === "SABRE" && effective.scheduleChange?.outerOffer?.environment === "CERT"
          ? "Sabre CERT timetable difference" : "Schedule difference · not confirmed",
        EXACT_PRICE_UNAVAILABLE: "Exact fare unavailable",
        EXACT_CHECK_FAILED: "Exact check failed",
      })[status] ?? status;
      const price = top.querySelector(".candidate-price");
      if (price) price.textContent = status === "UNPRICED"
        ? "Exact check"
        : status === "SCHEDULE_CHANGED"
          ? "View test fare"
          : money(status === "CONFIRMED" ? effective.totalPrice : candidate.totalPrice);
    }

    card.querySelectorAll(":scope > .kiwi-ticket-links").forEach(element => element.remove());
    const ticketLinks = kiwiOfferLinks(effective, status !== "CONFIRMED");
    if (ticketLinks && top) top.after(ticketLinks);

    const detail = card.querySelector(".candidate-detail");
    if (!detail) return;
    const displayedPrice = status === "UNPRICED"
      ? "Exact confirmation required"
      : status === "SCHEDULE_CHANGED"
        ? "Selected schedule fare not confirmed"
        : money(status === "CONFIRMED" ? effective.totalPrice : candidate.totalPrice);
    const priceLabel = status === "CONFIRMED" ? "Confirmed total" : status === "SCHEDULE_CHANGED" ? "Selected fare" : status === "UNPRICED" ? "Price" : "Indicative total";
    updateFact(detail, "Total", displayedPrice, priceLabel);
    updateFact(
      detail,
      "Ticket structure",
      status === "CONFIRMED"
        ? "2 separate tickets · exact fare confirmed"
        : status === "SCHEDULE_CHANGED"
          ? "2 separate tickets · provider timetable differs · selected fare unconfirmed"
        : status === "EXACT_PRICE_UNAVAILABLE"
          ? "2 separate direct tickets · exact Sabre fare unavailable"
          : status === "UNPRICED"
            ? "2 separate direct tickets · exact price required"
            : "2 separate direct tickets · proxy economics until exact confirmation",
    );
    detail.querySelectorAll(".issue23-schedule-block,.issue23-proxy-evidence,.issue23-confirmed-evidence,.issue23-confirmed-offers,.issue23-schedule-changed,.issue23-luna-recommendation,.issue23-exact-failure,.issue23-exact-unavailable,.issue25-confirmation-ready").forEach((element) => element.remove());

    let control = detail.querySelector(".issue23-selection-control");
    if (!control) {
      control = selectionControl(candidate);
      detail.prepend(control);
    }
    updateSelectionControl(control, candidate, status, selected);

    let anchor = control;
    if ((status === "PROXY" || status === "UNPRICED") && s.phases.summary === "complete" && canAuthorizeConfirmation(candidate)) {
      const ready = node("div", "issue25-confirmation-ready");
      ready.append(node("strong", null, `Candidate ${number ?? "—"} is available for exact confirmation.`));
      ready.append(document.createTextNode(" Open this card only if you want Luna to exact-check this itinerary, then use the checkbox above."));
      anchor.after(ready);
      anchor = ready;
    }
    if (status === "EXACT_CHECK_PENDING") {
      const pending = node("div", "issue23-luna-recommendation", `Candidate ${number ?? "—"} selected — exact fare confirmation in progress`);
      anchor.after(pending);
      anchor = pending;
    }
    const schedule = scheduleBlock(effective, status) ?? scheduleBlock(candidate, status);
    if (schedule) {
      anchor.after(schedule);
      anchor = schedule;
    }
    if (status === "SCHEDULE_CHANGED") {
      const changed = scheduleChangeBlock(effective);
      if (changed) { anchor.after(changed); anchor = changed; }
    } else if (status === "CONFIRMED") {
      for (const block of [confirmedBlock(effective), confirmedTickets(effective)]) {
        if (!block) continue;
        anchor.after(block);
        anchor = block;
      }
    } else if (status === "UNPRICED") {
      const exactRequired = unpricedBlock(candidate);
      anchor.after(exactRequired);
      anchor = exactRequired;
    } else {
      const proxy = proxyBlock(candidate);
      if (proxy) {
        anchor.after(proxy);
        anchor = proxy;
      }
    }

    detail.querySelectorAll(":scope > .ticket-detail").forEach((element) => { element.hidden = true; });
    if (status === "EXACT_PRICE_UNAVAILABLE") {
      detail.append(node("div", "issue23-exact-unavailable", effective?.exactCheckFailure?.message ?? s.confirmation?.message ?? "The schedule remains valid, but Sabre could not provide an exact fare. Indicative pricing remains available."));
    } else if (status === "EXACT_CHECK_FAILED") {
      detail.append(node("div", "issue23-exact-failure", effective?.exactCheckFailure?.message ?? s.confirmation?.message ?? "Exact fare confirmation failed because of a technical or validation problem."));
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
      badge.textContent = `${count} candidate${count === 1 ? "" : "s"}`;
    }
  }

  syncFns.push(syncCandidates);
  const start = () => syncCandidates();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
