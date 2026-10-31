# AI Platform Notes

## Vercel AI SDK Evaluation

Recommendation: do not adopt the Vercel AI SDK yet.

Why:
- the current typed AI service already covers the app's needs for provider routing, structured JSON generation, fallback handling, and run logging
- prompt versioning and regression coverage are implemented directly in the app
- introducing the SDK would add another abstraction layer without clear immediate benefit

When to revisit:
- when agent workflows start chaining multiple tool invocations in a single request
- when streaming partial tool/state updates becomes a product requirement
- when the project needs provider-specific structured outputs or tool-execution helpers beyond the current service layer

## Current Architecture

- **Typed AI service** (`ai-service.ts`) — execution layer with provider routing, structured outputs, fallback handling, and run persistence
- **Features** — natural-language search, remediation notes, and fix PRs only; see `docs/adr/0001-shrink-ai-features.md`
- **Prompt versioning** — versioned prompt templates in code (`ai-prompts.ts`)
- **Per-feature configuration** — feature-specific provider and model overrides via environment variables
- **Evaluation datasets** — regression test fixtures and evaluation coverage for AI outputs
- **Run persistence** (`ai-runs-store.ts`) — all AI runs, prompts, outputs, tool calls, and failures persisted in SQLite
