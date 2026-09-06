import { tool } from "ai";
import { z } from "zod";

const baseUrl = (process.env.CUBERENCE_TRAVEL_API_BASE_URL ?? "https://cuberence-travel-api.vercel.app").replace(/\/$/, "");

const inputSchema = z.object({
  origin: z.string().min(2).describe("Origin city or airport, preferably IATA when known"),
  originCountryCode: z.string().length(2).optional(),
  destination: z.string().min(2).describe("Destination city or airport, preferably IATA when known"),
  destinationCountryCode: z.string().length(2).optional(),
  departureWindow: z.object({
    from: z.string().describe("Earliest departure date in YYYY-MM-DD"),
    to: z.string().describe("Latest departure date in YYYY-MM-DD"),
  }),
  destinationStay: z.object({
    minNights: z.number().int().min(1),
    maxNights: z.number().int().min(1),
  }),
});

type DiscoveryJob = {
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  progress?: { stage?: string; completed?: number; total?: number };
  output?: { discoveryId?: string; hubs?: unknown[]; warnings?: string[] };
  error?: unknown;
};

function headers() {
  const apiKey = process.env.CUBERENCE_API_KEY;
  if (!apiKey) throw new Error("CUBERENCE_API_KEY is not configured for the web application.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

function messageFor(job: DiscoveryJob) {
  const progress = job.progress;
  if (job.status === "QUEUED") return "Discovery queued. Preparing schedule search…";
  if (job.status === "RUNNING") {
    if (progress?.total && typeof progress.completed === "number") {
      return `${progress.stage ?? "Evaluating hubs"} — ${progress.completed} of ${progress.total}`;
    }
    return `${progress?.stage ?? "Evaluating feasible stopover hubs"}…`;
  }
  if (job.status === "FAILED") return "Discovery failed.";
  return "Discovery complete. Preparing feasible hubs…";
}

export const discoveryTool = tool({
  description: "Run Cuberence hub discovery after origin, destination, departure window, and destination-stay range are known. Uses the existing Cuberence Discovery API and returns objective feasible hubs. Do not call for vague trips with missing required constraints.",
  inputSchema,
  execute: async function* (input, { abortSignal }) {
    yield { phase: "starting" as const, message: "Starting Cuberence discovery…" };

    const createResponse = await fetch(`${baseUrl}/api/v1/discoveries`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...input, debug: false }),
      signal: abortSignal,
    });

    if (!createResponse.ok) {
      const text = await createResponse.text();
      throw new Error(`Discovery request failed (${createResponse.status}): ${text.slice(0, 400)}`);
    }

    const created = (await createResponse.json()) as { discoveryId: string; status?: string };
    if (!created.discoveryId) throw new Error("Cuberence Discovery API did not return discoveryId.");

    yield { phase: "queued" as const, discoveryId: created.discoveryId, message: "Discovery queued. Identifying feasible hubs…" };

    let previousSignature = "";
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (abortSignal?.aborted) throw new Error("Discovery cancelled.");

      const statusResponse = await fetch(`${baseUrl}/api/v1/discoveries/${encodeURIComponent(created.discoveryId)}`, {
        headers: headers(),
        signal: abortSignal,
        cache: "no-store",
      });

      if (!statusResponse.ok) throw new Error(`Discovery status failed (${statusResponse.status}).`);
      const job = (await statusResponse.json()) as DiscoveryJob;

      const signature = JSON.stringify([job.status, job.progress?.stage, job.progress?.completed, job.progress?.total]);
      if (signature !== previousSignature) {
        previousSignature = signature;
        yield {
          phase: job.status === "COMPLETED" ? "completed" as const : "running" as const,
          discoveryId: created.discoveryId,
          status: job.status,
          progress: job.progress,
          message: messageFor(job),
          ...(job.status === "COMPLETED" ? { hubs: job.output?.hubs ?? [], warnings: job.output?.warnings ?? [] } : {}),
        };
      }

      if (job.status === "COMPLETED") return;
      if (job.status === "FAILED") throw new Error(`Cuberence discovery failed: ${JSON.stringify(job.error ?? {})}`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    throw new Error("Discovery did not complete within the polling window.");
  },
});
