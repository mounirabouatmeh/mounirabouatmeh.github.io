import { tool } from "ai";
import { z } from "zod";

const baseUrl = (process.env.CUBERENCE_TRAVEL_API_BASE_URL ?? "https://cuberence-travel-api.vercel.app").replace(/\/$/, "");

const inputSchema = z.object({
  discoveryId: z.string().uuid().describe("Discovery id returned by the completed discovery tool"),
  selectedHubs: z.array(z.string()).min(1).describe("One or more hub ids returned by discovery"),
  strategy: z.enum(["SPLIT", "PROTECTED_STOPOVER"]),
  travelers: z.object({
    adults: z.number().int().min(1).default(1),
    children: z.number().int().min(0).default(0),
    infants: z.number().int().min(0).default(0),
  }).default({ adults: 1, children: 0, infants: 0 }),
  cabin: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]).default("ECONOMY"),
  currency: z.string().length(3).default("USD"),
});

type PricingJob = {
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  progress?: { stage?: string; completed?: number; total?: number };
  output?: {
    pricingId?: string;
    discoveryId?: string;
    strategy?: string;
    selectedHubs?: string[];
    baseline?: unknown;
    candidates?: unknown[];
    rejectionCounts?: Record<string, number>;
    warnings?: string[];
    page?: unknown;
  };
  error?: unknown;
};

function headers() {
  const apiKey = process.env.CUBERENCE_API_KEY;
  if (!apiKey) throw new Error("CUBERENCE_API_KEY is not configured for the web application.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

function progressMessage(job: PricingJob) {
  if (job.status === "QUEUED") return "Pricing queued. Preparing selected hub strategies…";
  if (job.status === "RUNNING") {
    if (job.progress?.total && typeof job.progress.completed === "number") {
      return `${job.progress.stage ?? "Pricing candidates"} — ${job.progress.completed} of ${job.progress.total}`;
    }
    return `${job.progress?.stage ?? "Pricing selected stopover options"}…`;
  }
  if (job.status === "FAILED") return "Pricing failed.";
  return "Pricing complete. Preparing the comparison…";
}

export const pricingTool = tool({
  description: "Price one or more hubs from a completed Cuberence discovery. Requires the discoveryId, selected hub ids, and exactly one strategy: SPLIT or PROTECTED_STOPOVER. Use only hub ids actually returned by discovery.",
  inputSchema,
  execute: async function* (input, { abortSignal }) {
    yield { phase: "starting" as const, message: "Starting Cuberence pricing…" };

    const createResponse = await fetch(`${baseUrl}/api/v1/pricing`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...input, currency: input.currency.toUpperCase(), debug: false }),
      signal: abortSignal,
    });

    if (!createResponse.ok) {
      const text = await createResponse.text();
      throw new Error(`Pricing request failed (${createResponse.status}): ${text.slice(0, 400)}`);
    }

    const created = (await createResponse.json()) as { pricingId: string; traceId?: string; parentTraceId?: string };
    if (!created.pricingId) throw new Error("Cuberence Pricing API did not return pricingId.");

    yield { phase: "queued" as const, pricingId: created.pricingId, message: "Pricing queued. Preparing Sabre search…" };

    let previousSignature = "";
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (abortSignal?.aborted) throw new Error("Pricing cancelled.");

      const statusResponse = await fetch(`${baseUrl}/api/v1/pricing/${encodeURIComponent(created.pricingId)}?cursor=0&limit=50`, {
        headers: headers(),
        signal: abortSignal,
        cache: "no-store",
      });

      if (!statusResponse.ok) throw new Error(`Pricing status failed (${statusResponse.status}).`);
      const job = (await statusResponse.json()) as PricingJob;
      const signature = JSON.stringify([job.status, job.progress?.stage, job.progress?.completed, job.progress?.total]);

      if (signature !== previousSignature) {
        previousSignature = signature;
        yield {
          phase: job.status === "COMPLETED" ? "completed" as const : "running" as const,
          pricingId: created.pricingId,
          discoveryId: input.discoveryId,
          strategy: input.strategy,
          selectedHubs: input.selectedHubs,
          status: job.status,
          progress: job.progress,
          message: progressMessage(job),
          ...(job.status === "COMPLETED" ? {
            baseline: job.output?.baseline,
            candidates: job.output?.candidates ?? [],
            rejectionCounts: job.output?.rejectionCounts ?? {},
            warnings: job.output?.warnings ?? [],
            page: job.output?.page,
          } : {}),
        };
      }

      if (job.status === "COMPLETED") return;
      if (job.status === "FAILED") throw new Error(`Cuberence pricing failed: ${JSON.stringify(job.error ?? {})}`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    throw new Error("Pricing did not complete within the polling window.");
  },
});
