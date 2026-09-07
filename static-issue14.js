(() => {
  const previousFetch = globalThis.fetch.bind(globalThis);
  const state = {
    discovery: null,
    hubs: [],
    selectedHubIds: [],
    pricingPhase: null,
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

  function selectedSet() {
    return new Set(state.selectedHubIds);
  }

  function markerIcon(kind, selected = false) {
    const L = globalThis.L;
    const size = kind === "hub" ? (selected ? 18 : 14) : 18;
    return L.divIcon({
      className: "issue14-map-marker-shell",
      html: `<span class="issue14-map-marker issue14-${kind}${selected ? " is-selected" : ""}"></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      tooltipAnchor: [0, -size / 2],
    });
  }

  function mapFingerprint() {
    const discoveryId = state.discovery?.discoveryId ?? "";
    const hubs = state.hubs.map((hub) => [hub.id, hub.coordinates?.lat, hub.coordinates?.lon]);
    return JSON.stringify([discoveryId, hubs, [...state.selectedHubIds].sort()]);
  }

  function renderHubList(target, selected) {
    const current = target.querySelector(".issue14-hub-list");
    const fingerprint = JSON.stringify([state.hubs.map((hub) => hub.id), [...selected].sort()]);
    if (current?.dataset.fingerprint === fingerprint) return;
    current?.remove();

    const list = node("div", "hub-list issue14-hub-list");
    list.dataset.fingerprint = fingerprint;
    for (const hub of state.hubs) {
      const isSelected = selected.has(hub.id);
      const card = node("article", `hub-card issue14-hub-card${isSelected ? " is-selected" : ""}`);
      card.dataset.hubId = hub.id ?? "";
      const top = node("div", "hub-card-top");
      top.append(node("strong", isSelected ? "result-value" : null, hubLabel(hub)));
      top.append(node("span", null, hub.countryCode ?? ""));
      card.append(top);
      const airports = Array.isArray(hub.airports) && hub.airports.length ? ` · ${hub.airports.join("/")}` : "";
      const nights = Array.isArray(hub.feasibleHubNights) && hub.feasibleHubNights.length
        ? `${hub.feasibleHubNights.join(", ")} night options`
        : "Feasible stopover";
      card.append(node("small", null, `${nights}${airports}`));
      if (isSelected) card.append(node("span", "issue14-selected-label", "Selected"));
      list.append(card);
    }
    target.append(list);
  }

  function addPoint(map, bounds, point, options) {
    const L = globalThis.L;
    if (!point) return null;
    const marker = L.marker(point, {
      icon: markerIcon(options.kind, options.selected),
      keyboard: true,
      riseOnHover: true,
    }).addTo(map);
    marker.bindTooltip(options.label, {
      direction: "top",
      className: options.selected ? "issue14-map-tooltip selected" : "issue14-map-tooltip",
      permanent: Boolean(options.permanent),
      opacity: 0.96,
    });
    bounds.push(point);
    return marker;
  }

  function renderMap(target, selected) {
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
    copy.append(node("small", null, "All feasible hubs remain visible"));
    heading.append(copy);
    heading.append(node("span", null, selected.size ? `${state.hubs.length} feasible · ${selected.size} selected` : `${state.hubs.length} feasible`));
    card.append(heading);

    const canvas = node("div", "issue14-leaflet-map");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Map showing origin, destination, feasible stayover hubs, and selected hubs in green");
    card.append(canvas);

    const legend = node("div", "map-legend issue14-map-legend");
    legend.append(node("span", "issue14-legend-origin", "Origin"));
    legend.append(node("span", "issue14-legend-feasible", "Feasible hub"));
    legend.append(node("span", "issue14-legend-selected", "Selected hub"));
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
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      worldCopyJump: true,
      minZoom: 1,
    });
    state.map = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

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
      const isSelected = selected.has(hub.id);
      addPoint(map, bounds, point, {
        kind: "hub",
        selected: isSelected,
        label: `${hubLabel(hub)}${Array.isArray(hub.airports) && hub.airports.length ? ` · ${hub.airports.join("/")}` : ""}`,
        permanent: isSelected,
      });

      if (isSelected && originPoint) {
        L.polyline([originPoint, point], {
          color: "#287a57",
          weight: 3,
          opacity: 0.78,
        }).addTo(map);
      }
      if (isSelected && destinationPoint) {
        L.polyline([point, destinationPoint], {
          color: "#287a57",
          weight: 3,
          opacity: 0.78,
        }).addTo(map);
      }
    }

    if (!selected.size && originPoint && destinationPoint) {
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
    if (!state.discovery || !state.hubs.length) return;
    const target = document.getElementById("discovery-content");
    if (!target) return;
    const selected = selectedSet();
    renderMap(target, selected);
    renderHubList(target, selected);
    state.renderFingerprint = mapFingerprint();
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
        "Select or change the hub to price, for example Milan or Rome…",
        "Next step: Select one or more feasible hubs for SPLIT pricing.",
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

  function captureEvent(event) {
    if (event?.type === "tool-input-available" && event.toolName === "discovery") {
      state.discovery = null;
      state.hubs = [];
      state.selectedHubIds = [];
      state.pricingPhase = null;
      queueDiscoveryRender();
      queueComposerSync();
      return;
    }

    if (event?.type === "tool-input-available" && event.toolName === "pricing") {
      state.selectedHubIds = Array.isArray(event.input?.selectedHubs) ? event.input.selectedHubs : [];
      state.pricingPhase = "starting";
      queueDiscoveryRender();
      queueComposerSync();
      return;
    }

    if (event?.type !== "tool-output-available" || !event.output) return;
    const output = event.output;

    if (output.discoveryId) {
      if (output.phase === "completed" && Array.isArray(output.hubs)) {
        state.discovery = output;
        state.hubs = output.hubs;
      }
      queueDiscoveryRender();
      queueComposerSync();
      return;
    }

    if (output.pricingId) {
      state.pricingPhase = output.phase ?? state.pricingPhase;
      if (Array.isArray(output.selectedHubs)) state.selectedHubIds = output.selectedHubs;
      queueDiscoveryRender();
      queueComposerSync();
    }
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
        const data = raw.split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        try { captureEvent(JSON.parse(data)); } catch { /* The primary app owns stream errors. */ }
      }
    }
    queueComposerSync();
  }

  globalThis.fetch = async (...args) => {
    const response = await previousFetch(...args);
    if (isChatRequest(args[0]) && response.body) inspectStream(response.clone()).catch(() => {});
    return response;
  };

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
