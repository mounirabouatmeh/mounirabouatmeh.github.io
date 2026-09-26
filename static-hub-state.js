(function (root) {
  function buildHubWorkspace(messages) {
    let identified = null;
    let latestValidated = null;
    const validatedById = new Map();
    const selectedIds = new Set();

    for (const message of messages ?? []) {
      for (const part of message?.parts ?? []) {
        if (part?.type === "tool-baseline") {
          identified = null;
          latestValidated = null;
          validatedById.clear();
          selectedIds.clear();
          continue;
        }
        if (part?.type !== "tool-discovery") continue;

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
