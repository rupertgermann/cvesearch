# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog.

## [Unreleased]

### Changed

- **Session cookie `Secure` flag** — now set when the request is HTTPS (`https` URL or `X-Forwarded-Proto: https`) or when `SESSION_COOKIE_SECURE=true`, instead of following `NODE_ENV=production`. Deployments behind a TLS-terminating proxy that does not send `X-Forwarded-Proto` must set `SESSION_COOKIE_SECURE=true`

## [v2.0.0] - 2026-03-08

### Added

- **Server-side AI service layer** — typed AI service with provider routing, structured outputs, fallback handling, and run logging; credentials read exclusively from environment variables
- **Per-feature AI configuration** — feature-specific provider and model overrides via environment variables (`AI_SEARCH_ASSISTANT_PROVIDER`, `AI_CVE_INSIGHT_MODEL`, etc.)
- **AI agent platform** — triage agent, remediation agent, watchlist analyst, project summary, alert investigation, exposure agent, and duplicate/cluster agent
- **Conversational workspace** — multi-turn workspace assistant with conversation persistence, reference chips, and suggested questions
- **Notification system** — scheduled digest delivery with pause/resume, delivery history, and team destination modeling
- **Prompt and version management** — versioned prompt templates, saved prompt templates for common analyst tasks, and prompt catalog in settings
- **Tool registry** — shared tool metadata for agent workflows, visible in settings
- **Human approval checkpoints** — approval gates before AI writes triage state, modifies projects, or sends notifications
- **Sensitive data redaction** — triage notes, owners, and project metadata redacted before prompts are sent to third-party providers (configurable via `AI_ALLOW_SENSITIVE_MODEL_DATA`)
- **AI run persistence** — all AI runs, prompts, outputs, tool calls, and failures persisted for debugging and review
- **Evaluation datasets** — regression test fixtures and evaluation coverage for AI outputs
- **Search explanation output** — shows which fields, filters, and assumptions the AI applied
- **SQLite persistence** — replaced JSON file persistence with SQLite for all workspace data
- **Session system** — anonymous workspace sessions with cookie-based data isolation
- **Security headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy via `next.config.ts`
- **Rate limiting and request logging** — every API route wrapped with `withRouteProtection` and per-bucket rate limits
- **Asset inventory** — product/vendor inventory mapping so CVEs can be linked to affected internal systems
- **Workspace import/export** — full workspace data export and import with merge and replace modes
- **Analyst dashboard** — dedicated `/dashboard` route with analyst-oriented metrics
- **Bulk actions** — bulk remove, triage update, and project assignment from watchlist
- **Expanded natural-language search** — understands CWE families, date ranges, product aliases, exploitability, and remediation intent
- **Data normalization** — improved handling of aliases, linked vulnerabilities, affected products, and reference metadata
- **Stronger schema validation** — validation around upstream CIRCL payloads and AI-generated JSON
- **Security audit** — full security audit documented in `docs/security-audit.md`

### Changed

- AI settings moved from browser-local storage to server-side environment variables
- Settings page now shows server-side AI configuration summary, per-feature cards, prompt versions, tool registry, inventory, workspace data management, and recent AI runs
- All API routes now include rate limiting and request logging
- GitHub monitoring routes hardened with rate limiting, branch accuracy, and closed-failure handling on tree truncation
- Dependency scan and fix flows preserve manifest location for monorepo remediation
- AI-generated fix PR file writes constrained to server-validated repository paths
- README, CHANGELOG, and docs updated to reflect current state

### Verified

- `npm run lint` — passed
- `npm test` — 65/65 passed
- `npm run build` — passed

## [v1.0.0] - 2026-03-05

### Added

- AI-assisted CVE insight panels on vulnerability detail pages
- AI search assistant for turning natural-language prompts into structured filters
- AI digest panels for watchlist and workspace context
- AI settings page for provider, model, and API key configuration
- Support for `heuristic`, `openai`, and `anthropic` AI providers
- Heuristic fallback behavior so AI features still work without a configured model provider
- AI API routes for CVE insights, digests, and search interpretation
- Automated tests for AI heuristics and interpretation logic
- Fresh README screenshots for the search workspace, CVE detail page, and AI settings

### Changed

- README updated to reflect the AI feature set, settings workflow, and current UI
- Header navigation updated with a dedicated settings route
- Homepage and watchlist surfaces now include AI workflow entry points

### Verified

- `npm run lint`
- `npm test`
- `npm run build`

## [2026-03-05] - Analyst Workflow Foundation

### Added

- URL-driven, server-rendered search flow
- Vendor and product browse assistance
- Saved views, watchlist, alerts, triage, and projects workflow
- Analyst dashboard presets and export actions
- Rich CVE detail rendering with EPSS, CWE, CAPEC, comments, and linked vulnerabilities
- Proxy hardening and upstream response validation
- CI coverage for lint, test, and build

### Changed

- README and docs expanded to describe roadmap, findings, and execution backlog
