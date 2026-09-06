# Cuberence Web

Cuberence's public site and advisor-facing AI workspace.

## Architecture

```text
cuberence.com
  ├─ /        Public landing page
  └─ /app     Advisor workspace
       └─ /api/chat
            └─ Cuberence Agent (GPT-5.6 Luna by default)
```

This first agent-shell milestone intentionally does **not** connect the travel tools yet. It establishes the Next.js/Vercel runtime, streamed AI conversation, and split-screen Trip Workspace while preventing the model from inventing live flight results.

The next stage adds two thin agent tools:
- `discovery()` → existing Cuberence Discovery API → AeroDataBox
- `pricing()` → existing Cuberence Pricing API → Sabre

## Model policy

One model is used throughout a session. The default is configured with:

```bash
CUBERENCE_AI_MODEL=openai/gpt-5.6-luna
```

If Luna does not meet quality requirements, the application can be moved globally to Terra via configuration rather than changing the orchestration architecture.

## Local development

```bash
npm install
npm run dev
```

For Vercel AI Gateway, Vercel OIDC is the preferred deployment authentication. A static `AI_GATEWAY_API_KEY` can be used outside Vercel where appropriate.

## Current milestone

- [x] Next.js application shell
- [x] Public Cuberence landing page
- [x] `/app` split Chat + Trip Workspace
- [x] server-side `/api/chat`
- [x] GPT-5.6 Luna model configuration
- [x] streaming assistant responses
- [ ] Discovery tool
- [ ] live discovery progress events
- [ ] Pricing tool
- [ ] durable TripSession
