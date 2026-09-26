(function (root) {
  function tripDetails(input) {
    const origin = String(input?.origin ?? "").trim().toUpperCase();
    const destination = String(input?.destination ?? "").trim().toUpperCase();
    const departure = input?.departureWindow;
    const stay = input?.destinationStay;
    if (!origin || !destination || !departure?.from || !departure?.to ||
        stay?.minNights == null || stay?.maxNights == null) return null;
    return {
      origin, destination,
      departureFrom: departure.from, departureTo: departure.to,
      stayMin: Number(stay.minNights), stayMax: Number(stay.maxNights),
      returnFrom: input.returnWindow?.from, returnTo: input.returnWindow?.to,
    };
  }

  function isDifferentTrip(previous, next) {
    if (!previous || !next) return false;
    for (const key of ["origin", "destination", "departureFrom", "departureTo", "stayMin", "stayMax"]) {
      if (previous[key] !== next[key]) return true;
    }
    return Boolean(previous.returnFrom && next.returnFrom && previous.returnFrom !== next.returnFrom) ||
      Boolean(previous.returnTo && next.returnTo && previous.returnTo !== next.returnTo);
  }

  function buildHubWorkspace(messages) {
    let identified = null;
    let latestValidated = null;
    let activeTrip = null;
    const validatedById = new Map();
    const selectedIds = new Set();

    function resetHubs() {
      identified = null;
      latestValidated = null;
      validatedById.clear();
      selectedIds.clear();
    }

    for (const message of messages ?? []) {
      for (const part of message?.parts ?? []) {
        if (part?.type === "tool-baseline") {
          const nextTrip = tripDetails(part.input);
          if (isDifferentTrip(activeTrip, nextTrip)) resetHubs();
          if (nextTrip) activeTrip = nextTrip;
          continue;
        }
        if (part?.type !== "tool-discovery") continue;

        const nextTrip = tripDetails(part.input);
        if (isDifferentTrip(activeTrip, nextTrip)) resetHubs();
        if (nextTrip) activeTrip = nextTrip;

        const output = part.output;
        if (output?.phase === "completed" && Array.isArray(output.hubs)) {
          if (output.validationStatus === "IDENTIFIED" || output.mode === "IDENTIFY") {
            identified = output;
            latestValidated = null;
            validatedById.clear();
            selectedIds.clear();
          } else {
            latestValidated = output;
            for (const hub of output.hubs) {
              if (hub?.id) validatedById.set(hub.id, hub);
            }
          }
        }

        if (part.input?.mode === "VALIDATE" && part.state !== "output-error" &&
            Array.isArray(part.input.selectedHubs)) {
          for (const id of part.input.selectedHubs) selectedIds.add(id);
        }
      }
    }

    const source = identified ?? latestValidated;
    const identifiedHubs = Array.isArray(source?.hubs) ? source.hubs : [];
    const hubsById = new Map();
    for (const hub of identifiedHubs) {
      if (hub?.id) hubsById.set(hub.id, { ...hub, ...(validatedById.get(hub.id) ?? {}) });
    }
    for (const [id, hub] of validatedById) {
      if (!hubsById.has(id)) hubsById.set(id, hub);
    }

    const hubs = [...hubsById.values()];
    const statusById = {};
    for (const hub of hubs) {
      const result = validatedById.get(hub.id);
      const failed = result && Number(result.splitFeasibleOptionCount) === 0;
      statusById[hub.id] = failed ? "failed" : selectedIds.has(hub.id) ? "selected" : "unassessed";
    }

    return {
      discovery: source,
      hubs,
      statusById,
      selectedHubIds: [...selectedIds],
      validatedCount: validatedById.size,
      failedCount: hubs.filter((hub) => statusById[hub.id] === "failed").length,
    };
  }

  root.CuberenceHubState = { buildHubWorkspace };
  if (typeof module !== "undefined" && module.exports) module.exports = { buildHubWorkspace };
})(globalThis);
