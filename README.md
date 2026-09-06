# Cuberence Web

Cuberence's public site and advisor-facing AI workspace.

## Architecture

```text
cuberence.com
  ├─ /        Public landing page
  └─ /app     Advisor workspace
       └─ /api/chat
            └─ Cuberence Agent (GPT-5.6 Luna by default)
                 ├─ discovery() → Cuberence Discovery API → AeroDataBox
                 └─ pricing()   → Cuberence Pricing API   → Sabre
```

The agent-facing tools are deliberately thin. All flight feasibility and pricing logic remains in the existing Cuberence Travel API.

## Model policy

One model is used throughout a session. The default is:

```bash
CUBERENCE_AI_MODEL=openai/gpt-5.6-luna
```

If Luna does not meet quality requirements, Cuberence can move globally to Terra through configuration rather than changing the orchestration architecture.

## Runtime configuration

```bash
CUBERENCE_TRAVEL_API_BASE_URL=https://cuberence-travel-api.vercel.app
CUBERENCE_API_KEY=...
```

Vercel AI Gateway OIDC is the preferred model authentication in deployment.

## Current milestone

- [x] Next.js application shell
- [x] public Cuberence landing page
- [x] `/app` split Chat + Trip Workspace
- [x] server-side `/api/chat`
- [x] GPT-5.6 Luna model configuration
- [x] streamed assistant responses
- [x] live Discovery tool and progress
- [x] live Pricing tool and progress
- [ ] durable TripSession
- [ ] Vercel web deployment and domain cutover
