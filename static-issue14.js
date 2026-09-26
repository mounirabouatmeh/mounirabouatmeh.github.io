(() => {
  const state = {
    discovery: null,
    hubs: [],
    selectedHubIds: [],
    statusById: {},
    validatedCount: 0,
    failedCount: 0,
    map: null,
    renderFingerprint: null,
    renderQueued: false,
    composerQueued: false,
  };

  function isChatRequest(input) {
    const url = typeof input === "string" ? input : input?.url;
    return typeof url === "string" && url.includes("cuberence-travel-api.vercel.app/api/v1/chat");
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function coordinates(value) {
    const lat = Number(value?.lat);
    const lon = Number(value?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }

  function hubLabel(hub) {
    return hub?.city ?? hub?.name ?? hub?.id ?? "Hub";
  }

  function hubStatus(hub) {
    return state.statusById[hub.id] ?? "unassessed";
  }

  function markerStyle(kind, status = "unassessed") {
    const fillColor = kind === "origin" ? "#173f58"
      : kind === "destination" ? "#9b7044"
      : status === "selected" ? "#287a57"
      : status === "failed" ? "#b84d47"
      : "#71807a";
    return {
      radius: kind === "hub" ? (status === "selected" ? 9 : 7) : 9,
      color: "#ffffff",
      weight: 2,
      fillColor,
      fillOpacity: 1,
      opacity: 1,
    };
  }

  function mapFingerprint() {
    const discoveryId = state.discovery?.discoveryId ?? "";
    const hubs = state.hubs.map((hub) => [hub.id, hub.coordinates?.lat, hub.coordinates?.lon, hubStatus(hub)]);
    return JSON.stringify([discoveryId, hubs]);
  }

  function renderHubList(target) {
    const current = target.querySelector(".issue14-hub-list");
    const fingerprint = JSON.stringify(state.hubs.map((hub) => [hub.id, hubStatus(hub), hub.feasibleHubNights, hub.airports]));
    if (current?.dataset.fingerprint === fingerprint) return;
    current?.remove();

    const list = node("div", "hub-list issue14-hub-list");
    list.dataset.fingerprint = fingerprint;
    for (const hub of state.hubs) {
      const status = hubStatus(hub);
      const card = node("article", `hub-card issue14-hub-card is-${status}`);
      card.dataset.hubId = hub.id ?? "";
      const top = node("div", "hub-card-top");
      top.append(node("strong", status === "selected" ? "result-value" : null, hubLabel(hub)));
      top.append(node("span", null, hub.countryCode ?? ""));
      card.append(top);
      const airports = Array.isArray(hub.airports) && hub.airports.length ? ` · ${hub.airports.join("/")}` : "";
      const nights = status === "failed" ? "Assessed · no feasible complete itinerary"
        : status === "unassessed" ? "Identified · not assessed"
        : Array.isArray(hub.feasibleHubNights) && hub.feasibleHubNights.length
          ? `${hub.feasibleHubNights.join(", ")} night options · validated`
          : "Selected · validation in progress";
      card.append(node("small", null, `${nights}${airports}`));
      card.append(node("span", `issue14-status-label is-${status}`,
        status === "failed" ? "No feasible itinerary" : status === "selected" ? "Selected" : "Not assessed"));
      list.append(card);
    }
    target.append(list);
  }

  function addPoint(map, bounds, point, options) {
    const L = globalThis.L;
    if (!point) return null;
    const marker = L.circleMarker(point, {
      ...markerStyle(options.kind, options.status),
      interactive: true,
    }).addTo(map);
    marker.bindTooltip(options.label, {
      direction: "top",
      className: `issue14-map-tooltip ${options.status ?? ""}`,
      permanent: options.status === "selected" || Boolean(options.permanent),
      opacity: 0.96,
    });
    marker.bringToFront();
    bounds.push(point);
    return marker;
  }

  function renderMap(target) {
    const fingerprint = mapFingerprint();
    const current = target.querySelector(".issue14-map-card");
    if (current?.dataset.fingerprint === fingerprint && state.map) return;

    if (state.map) {
      try { state.map.remove(); } catch { /* Leaflet cleanup is best effort. */ }
      state.map = null;
    }
    current?.remove();

    const card = node("section", "discovery-map-card issue14-map-card");
    card.dataset.fingerprint = fingerprint;
    card.setAttribute("aria-label", "Interactive stayover hub map");

    const heading = node("div", "discovery-map-heading issue14-map-heading");
    const copy = node("div");
    copy.append(node("strong", null, "Stayover hub map"));
    copy.append(node("small", null, "All identified hubs remain visible"));
    heading.append(copy);
    heading.append(node("span", null, `${state.hubs.length} identified · ${state.validatedCount} assessed${state.failedCount ? ` · ${state.failedCount} no itinerary` : ""}`));
    card.append(heading);

    const canvas = node("div", "issue14-leaflet-map");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Map showing every identified hub: selected in green, not assessed in grey, no feasible itinerary in red");
    card.append(canvas);

    const legend = node("div", "map-legend issue14-map-legend");
    legend.append(node("span", "issue14-legend-origin", "Origin"));
    legend.append(node("span", "issue14-legend-unassessed", "Not assessed"));
    legend.append(node("span", "issue14-legend-selected", "Selected"));
    legend.append(node("span", "issue14-legend-failed", "No feasible itinerary"));
    legend.append(node("span", "issue14-legend-destination", "Destination"));
    card.append(legend);

    target.prepend(card);

    const L = globalThis.L;
    if (!L) {
      canvas.append(node("div", "issue14-map-fallback", "Interactive map library could not load. Hub coordinates remain available in Discovery."));
      return;
    }

    const origin = state.discovery?.resolved?.origin;
    const destination = state.discovery?.resolved?.destination;
    const originPoint = coordinates(origin?.coordinates);
    const destinationPoint = coordinates(destination?.coordinates);
    const plottedHubs = state.hubs
      .map((hub) => ({ hub, point: coordinates(hub.coordinates) }))
      .filter((entry) => entry.point);

    if (!originPoint && !destinationPoint && !plottedHubs.length) {
      canvas.append(node("div", "issue14-map-fallback", "Map coordinates are unavailable for this Discovery. Run a new Discovery to use deterministic Cuberence coordinates."));
      return;
    }

    const map = L.map(canvas, {
      preferCanvas: true,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      worldCopyJump: true,
      minZoom: 1,
    });
    state.map = map;

    if (globalThis.CuberenceLand?.features) {
      L.geoJSON(globalThis.CuberenceLand, {
        interactive: false,
        style: { color: "#b5c8bd", weight: 0.8, fillColor: "#dce9e2", fillOpacity: 1 },
      }).addTo(map);
      map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>');
    }

    const gridStyle = { color: "#cadbd4", weight: 0.7, opacity: 0.5, interactive: false };
    for (const latitude of [-60, -30, 0, 30, 60]) {
      L.polyline([[latitude, -180], [latitude, 180]], gridStyle).addTo(map);
    }
    for (const longitude of [-120, -60, 0, 60, 120]) {
      L.polyline([[-75, longitude], [80, longitude]], gridStyle).addTo(map);
    }

    const bounds = [];
    addPoint(map, bounds, originPoint, {
      kind: "origin",
      label: origin?.name ?? origin?.id ?? "Origin",
      permanent: true,
    });
    addPoint(map, bounds, destinationPoint, {
      kind: "destination",
      label: destination?.name ?? destination?.id ?? "Destination",
      permanent: true,
    });

    for (const { hub, point } of plottedHubs) {
      const status = hubStatus(hub);
      addPoint(map, bounds, point, {
        kind: "hub",
        status,
        label: `${hubLabel(hub)}${Array.isArray(hub.airports) && hub.airports.length ? ` · ${hub.airports.join("/")}` : ""}`,
        permanent: status === "selected",
      });

      if (status === "selected" && originPoint) {
        L.polyline([originPoint, point], {
          color: "#287a57",
          weight: 3,
          opacity: 0.78,
        }).addTo(map);
      }
      if (status === "selected" && destinationPoint) {
        L.polyline([point, destinationPoint], {
          color: "#287a57",
          weight: 3,
          opacity: 0.78,
        }).addTo(map);
      }
    }

    if (!state.hubs.some((hub) => hubStatus(hub) === "selected") && originPoint && destinationPoint) {
      L.polyline([originPoint, destinationPoint], {
        color: "#7d8b85",
        weight: 2,
        opacity: 0.55,
        dashArray: "7 7",
      }).addTo(map);
    }

    if (bounds.length === 1) map.setView(bounds[0], 5);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 5 });
    else map.setView([25, 0], 2);

    requestAnimationFrame(() => map.invalidateSize());
  }

  function renderDiscovery() {
    state.renderQueued = false;
    const workspace = globalThis.CuberenceHubWorkspace?.();
    if (!workspace?.discovery || !workspace.hubs.length) return;
    state.discovery = workspace.discovery;
    state.hubs = workspace.hubs;
    state.statusById = workspace.statusById;
    state.validatedCount = workspace.validatedCount;
    state.failedCount = workspace.failedCount;
    const target = document.getElementById("discovery-content");
    if (!target) return;
    renderMap(target);
    renderHubList(target);
  }

  function queueDiscoveryRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(renderDiscovery);
  }

  function trackerStage(name) {
    return document.querySelector(`.trip-progress-step[data-stage="${name}"]`);
  }

  function stageStatus(name) {
    const step = trackerStage(name);
    return {
      step,
      text: (step?.querySelector(".trip-progress-status")?.textContent ?? "").trim().toLowerCase(),
      running: Boolean(step?.classList.contains("is-running")),
      complete: Boolean(step?.classList.contains("is-complete")),
      ready: Boolean(step?.classList.contains("is-ready")),
    };
  }

  function setComposer(placeholder, guidance, isNext = false) {
    const input = document.getElementById("message-input");
    const copy = document.getElementById("composer-guidance");
    if (!input || !copy) return;
    if (input.placeholder !== placeholder) input.placeholder = placeholder;
    if (copy.textContent !== guidance) copy.textContent = guidance;
    copy.classList.toggle("stage-next", Boolean(isNext));
  }

  function syncComposer() {
    state.composerQueued = false;
    const discovery = stageStatus("discovery");
    const hub = stageStatus("hubselected");
    const pricing = stageStatus("pricing");
    const summary = stageStatus("summary");
    const busy = Boolean(document.querySelector(".live-status-inline"));

    if (summary.complete && !busy) {
      setComposer(
        "Ask a follow-up, compare another hub, or explore another option…",
        "Summary complete. You can refine the recommendation or select another hub to compare.",
      );
      return;
    }

    if (summary.running || (pricing.complete && busy)) {
      setComposer(
        "Cuberence is preparing the recommendation summary…",
        "Pricing is complete. Cuberence is summarizing the stayover recommendation.",
      );
      return;
    }

    if (pricing.running || ["running", "pricing"].some((word) => pricing.text.includes(word))) {
      setComposer("SPLIT pricing is running…", "Cuberence is pricing the selected hub or hubs.");
      return;
    }

    if (discovery.ready || discovery.text.includes("review hubs") || (discovery.complete && hub.ready)) {
      setComposer(
        "Choose the hub or hubs to validate, for example Paris or Rome…",
        "Next step: Choose one, several, or all identified hubs for validation.",
        true,
      );
      return;
    }

    if (hub.complete && pricing.ready) {
      setComposer(
        "Cuberence is ready to price the selected hub…",
        "Hub selection is complete. SPLIT pricing is the next step.",
      );
    }
  }

  function queueComposerSync() {
    if (state.composerQueued) return;
    state.composerQueued = true;
    requestAnimationFrame(syncComposer);
  }


  const start = () => {
    const discoveryTarget = document.getElementById("discovery-content");
    if (discoveryTarget) {
      new MutationObserver(() => {
        queueDiscoveryRender();
        queueComposerSync();
      }).observe(discoveryTarget, { childList: true, subtree: true });
    }

    const tracker = document.getElementById("trip-progress");
    if (tracker) {
      new MutationObserver(queueComposerSync).observe(tracker, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    const conversation = document.getElementById("conversation");
    if (conversation) {
      new MutationObserver(queueComposerSync).observe(conversation, { childList: true, subtree: true });
    }

    queueDiscoveryRender();
    queueComposerSync();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
