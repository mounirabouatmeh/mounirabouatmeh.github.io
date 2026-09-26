const assert = require("node:assert/strict");
const test = require("node:test");
const { buildHubWorkspace } = require("../static-hub-state.js");

const identified = {
  phase: "completed", mode: "IDENTIFY", validationStatus: "IDENTIFIED",
  discoveryId: "identify-1", resolved: { origin: { name: "Montreal" }, destination: { name: "Beirut" } },
  hubs: [
    { id: "paris_fr", city: "Paris", airports: ["CDG", "ORY"], coordinates: { lat: 48.8, lon: 2.3 } },
    { id: "rome_it", city: "Rome", airports: ["FCO"], coordinates: { lat: 41.9, lon: 12.5 } },
    { id: "frankfurt_de", city: "Frankfurt", airports: ["FRA"], coordinates: { lat: 50.1, lon: 8.7 } },
  ],
};
const trip = {
  origin: "YUL", destination: "BEY",
  departureWindow: { from: "2026-10-10", to: "2026-10-15" },
  returnWindow: { from: "2026-11-20", to: "2026-11-22" },
  destinationStay: { minNights: 35, maxNights: 40 },
};
const part = (mode, input, output, state = "output-available") => ({
  type: "tool-discovery", state, input: { mode, ...input }, output,
});
const conversation = (...parts) => [{ role: "assistant", parts }];

test("all identified hubs stay listed after a selected set is validated", () => {
  const result = buildHubWorkspace(conversation(
    part("IDENTIFY", {}, identified),
    part("VALIDATE", { selectedHubs: ["paris_fr", "frankfurt_de"] }, {
      phase: "completed", mode: "VALIDATE", validationStatus: "VALIDATED", discoveryId: "validate-1",
      hubs: [
        { id: "paris_fr", splitFeasibleOptionCount: 6, feasibleHubNights: [1, 2, 3] },
        { id: "frankfurt_de", splitFeasibleOptionCount: 0, feasibleHubNights: [] },
      ],
    }),
  ));
  assert.deepEqual(result.hubs.map((hub) => hub.id), ["paris_fr", "rome_it", "frankfurt_de"]);
  assert.deepEqual(result.statusById, {
    paris_fr: "selected", rome_it: "unassessed", frankfurt_de: "failed",
  });
  assert.deepEqual(result.hubs[0].airports, ["CDG", "ORY"]);
  assert.equal(result.discovery.discoveryId, "identify-1");
});

test("later validation adds a hub without erasing earlier results", () => {
  const result = buildHubWorkspace(conversation(
    part("IDENTIFY", {}, identified),
    part("VALIDATE", { selectedHubs: ["frankfurt_de"] }, {
      phase: "completed", validationStatus: "VALIDATED",
      hubs: [{ id: "frankfurt_de", splitFeasibleOptionCount: 0 }],
    }),
    part("VALIDATE", { selectedHubs: ["rome_it"] }, {
      phase: "completed", validationStatus: "VALIDATED",
      hubs: [{ id: "rome_it", splitFeasibleOptionCount: 2, feasibleHubNights: [2] }],
    }),
  ));
  assert.equal(result.hubs.length, 3);
  assert.equal(result.statusById.frankfurt_de, "failed");
  assert.equal(result.statusById.rome_it, "selected");
  assert.equal(result.statusById.paris_fr, "unassessed");
});

test("pending selected hubs are green; refreshing the same baseline keeps discovery after pricing", () => {
  const pending = buildHubWorkspace(conversation(
    { type: "tool-baseline", state: "output-available", input: trip, output: { phase: "completed" } },
    part("IDENTIFY", trip, identified),
    part("VALIDATE", { ...trip, selectedHubs: ["rome_it", "frankfurt_de"] }, {
      phase: "completed", mode: "VALIDATE", validationStatus: "VALIDATED",
      hubs: [
        { id: "rome_it", splitFeasibleOptionCount: 30 },
        { id: "frankfurt_de", splitFeasibleOptionCount: 0 },
      ],
    }),
    { type: "tool-baseline", state: "output-available", input: { ...trip }, output: { phase: "completed" } },
    { type: "tool-pricing", state: "output-available", output: { phase: "completed", candidates: [{}] } },
  ));
  assert.deepEqual(pending.hubs.map((hub) => hub.id), ["paris_fr", "rome_it", "frankfurt_de"]);
  assert.deepEqual(pending.statusById, { paris_fr: "unassessed", rome_it: "selected", frankfurt_de: "failed" });
  assert.equal(pending.validatedCount, 2);

  const inProgress = buildHubWorkspace(conversation(
    part("IDENTIFY", trip, identified),
    part("VALIDATE", { ...trip, selectedHubs: ["rome_it"] }, { phase: "starting" }, "input-available"),
  ));
  assert.equal(inProgress.statusById.rome_it, "selected");
});

test("a baseline for a different trip clears old hubs while a new discovery is pending", () => {
  const nextTrip = buildHubWorkspace(conversation(
    part("IDENTIFY", trip, identified),
    { type: "tool-baseline", state: "input-available", input: { ...trip, destination: "LHR" } },
  ));
  assert.equal(nextTrip.hubs.length, 0);
});
