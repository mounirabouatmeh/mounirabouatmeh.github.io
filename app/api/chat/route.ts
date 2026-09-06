import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { cuberenceAgent } from "@/lib/agent";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json()) as { messages?: UIMessage[] };

  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "messages must be an array" }, { status: 400 });
  }

  return createAgentUIStreamResponse({
    agent: cuberenceAgent,
    uiMessages: body.messages,
    abortSignal: request.signal,
  });
}
