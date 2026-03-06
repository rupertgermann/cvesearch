# Todo

## Foundation

- replace JSON file persistence with a real database (`sqlite` first, with a clean path to Postgres later)
- add authentication and authorization
- move browser-local workflow data (watchlist, alerts, triage, saved views) into user-scoped server persistence
- add audit fields and activity history for project and triage changes
- add rate limiting and request logging for API routes

## Product and UX

- integrate Radix UI primitives/theme for a more consistent UI system
- add richer dashboard views for analysts, maintainers, and incident response workflows
- improve result cards with stronger severity, EPSS, KEV, and recency cues
- add better empty states, skeleton states, and success/error feedback across the app
- add bulk actions for watchlist, triage, and project assignment
- add import/export for projects, triage state, saved views, and watchlists

## Vulnerability Management

- expand project management with owners, due dates, labels, status, and timeline views
- add a real vulnerability management workflow with assignment, SLA tracking, remediation state, and exceptions
- add asset or product inventory mapping so CVEs can be linked to affected internal systems
- enrich prioritization with CISA KEV, EPSS-first sorting, and exploit/reference signals
- add team-facing notifications and scheduled digest delivery

## AI and Agent Platform

- replace ad hoc AI calls with a typed AI service layer that supports structured outputs, tool calling, and multi-step workflows
- evaluate adopting the Vercel AI SDK for typed tool execution, structured JSON generation, and reusable agent loops in Next.js
- define a small tool registry for agent workflows:
  - search CVEs
  - fetch CVE details
  - read watchlist state
  - read alert rule matches
  - read and update project records
  - read and update triage state
- persist AI runs, prompts, outputs, tool calls, and failures for debugging and review
- add evaluation datasets and regression tests for AI outputs so prompt or model changes do not silently degrade quality
- add per-feature model/provider configuration instead of one shared global setting for every AI flow

## AI Features to Add

- upgrade the AI search assistant from single-shot prompt interpretation to an agent that can clarify intent, inspect available filters, and build multi-step searches
- add an AI triage agent that uses CVE detail, severity, references, KEV and EPSS signals, and project context to recommend priority, ownership, and next actions
- add an AI remediation agent that drafts remediation plans, compensating controls, validation steps, and rollout notes per vulnerability
- add an AI watchlist analyst agent that reviews new matches, clusters related issues, and highlights what changed since the last review
- add an AI project summary agent that turns project state into executive, analyst, and engineering summaries with different output formats
- add an AI alert investigation agent that explains why a rule matched and proposes the next best analyst action
- add an AI duplicate and cluster agent that groups aliases, related advisories, and linked vulnerabilities into a shared incident view
- add an AI exposure agent that maps vulnerabilities against tracked vendors, products, and assets to estimate likely internal impact
- add a conversational workspace where an agent can answer questions over the user’s watchlist, alerts, projects, and saved searches
- add human approval checkpoints before any agent writes triage state, modifies projects, or sends notifications

## AI Safety and Operations

- stop storing provider API keys in browser local storage; move to server-side secrets or secure per-user encrypted storage
- add usage tracking, latency metrics, and cost visibility for each AI feature
- add prompt and version management so changes to agent behavior are explicit and reversible
- add fallback behavior for tool failures, upstream CIRCL outages, and malformed model responses
- add redaction rules so sensitive notes or project metadata are not sent to third-party model providers by default

## Search and Data Quality

- expand natural-language search to understand CWE families, date ranges, product aliases, exploitability, and remediation intent
- add saved prompt templates for common analyst tasks such as "show newly published critical CVEs affecting OpenSSL this week"
- add search explanation output that shows exactly which fields, filters, and assumptions the AI applied
- improve data normalization for aliases, linked vulnerabilities, affected products, and reference metadata
- add stronger schema validation around upstream CIRCL payloads and AI-generated JSON
