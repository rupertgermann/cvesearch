# Todo

## misc stuff

- [x] make the UI use 95% of the screen width
- [ ] persist scan results in "repos" module in db. 


## Recommended Build Order

### Build First

- [x] replace JSON file persistence with a real database (`sqlite` first, with a clean path to Postgres later)
- [x] add authentication and authorization
- [x] move browser-local workflow data (watchlist, alerts, triage, saved views) into user-scoped server persistence
- [x] harden GitHub repository monitoring routes with the same rate limiting and request logging used by the rest of the API
- [x] make GitHub dependency scans branch-accurate and fail closed on tree truncation or dependency file fetch errors
- [x] preserve dependency manifest location through scan and fix flows so monorepo remediation targets the correct workspace
- [x] constrain AI-generated fix PR file writes to server-validated repository files only
- [x] add regression tests for dependency parsing and GitHub scan edge cases
- [x] stop storing provider API keys in browser local storage; move to server-side secrets or secure per-user encrypted storage
- [x] replace ad hoc AI calls with a typed AI service layer that supports structured outputs, tool calling, and multi-step workflows
- [x] evaluate adopting the Vercel AI SDK for typed tool execution, structured JSON generation, and reusable agent loops in Next.js
- [x] define a small tool registry for agent workflows
- [x] add prompt and version management so changes to agent behavior are explicit and reversible
- [x] add evaluation datasets and regression tests for AI outputs so prompt or model changes do not silently degrade quality
- [x] add fallback behavior for tool failures, upstream CIRCL outages, and malformed model responses
- [x] upgrade the AI search assistant from single-shot prompt interpretation to an agent that can clarify intent, inspect available filters, and build multi-step searches
- [x] add an AI triage agent that uses CVE detail, severity, references, KEV and EPSS signals, and project context to recommend priority, ownership, and next actions
- [x] add an AI alert investigation agent that explains why a rule matched and proposes the next best analyst action
- [x] add search explanation output that shows exactly which fields, filters, and assumptions the AI applied
- improve data normalization for aliases, linked vulnerabilities, affected products, and reference metadata
- [x] add stronger schema validation around upstream CIRCL payloads and AI-generated JSON

### Build Next

- [x] persist AI runs, prompts, outputs, tool calls, and failures for debugging and review
- [x] add per-feature model/provider configuration instead of one shared global setting for every AI flow
- [x] add audit fields and activity history for project and triage changes
- [x] add rate limiting and request logging for API routes
- [x] enrich prioritization with CISA KEV, EPSS-first sorting, and exploit/reference signals
- [x] improve result cards with stronger severity, EPSS, KEV, and recency cues
- [x] add bulk actions for watchlist, triage, and project assignment
- [x] add an AI remediation agent that drafts remediation plans, compensating controls, validation steps, and rollout notes per vulnerability
- [x] add an AI watchlist analyst agent that reviews new matches, clusters related issues, and highlights what changed since the last review
- [x] add an AI project summary agent that turns project state into executive, analyst, and engineering summaries with different output formats
- [x] add an AI duplicate and cluster agent that groups aliases, related advisories, and linked vulnerabilities into a shared incident view
- [x] add human approval checkpoints before any agent writes triage state, modifies projects, or sends notifications
- [x] add redaction rules so sensitive notes or project metadata are not sent to third-party model providers by default

### Build Later

- [x] integrate Radix UI primitives/theme for a more consistent UI system
- [x] add richer dashboard views for analysts, maintainers, and incident response workflows
- [x] add better empty states, skeleton states, and success/error feedback across the app
- [x] add import/export for projects, triage state, saved views, and watchlists
- expand project management with owners, due dates, labels, status, and timeline views
- add a real vulnerability management workflow with assignment, SLA tracking, remediation state, and exceptions
- [x] add asset or product inventory mapping so CVEs can be linked to affected internal systems
- add team-facing notifications and scheduled digest delivery
- [x] add usage tracking, latency metrics, and cost visibility for each AI feature
- [x] expand natural-language search to understand CWE families, date ranges, product aliases, exploitability, and remediation intent
- [x] add saved prompt templates for common analyst tasks such as "show newly published critical CVEs affecting OpenSSL this week"
- [x] add an AI exposure agent that maps vulnerabilities against tracked vendors, products, and assets to estimate likely internal impact
- add a conversational workspace where an agent can answer questions over the user’s watchlist, alerts, projects, and saved searches

### Suggested First Slice

- secure persistence and AI credentials first
- introduce the typed AI service layer plus tool registry
- ship one high-value read-only agent flow end to end: AI search agent
- ship one analyst decision-support flow next: AI triage agent
- add evaluation coverage before expanding to more agent types

## Foundation

- [x] replace JSON file persistence with a real database (`sqlite` first, with a clean path to Postgres later)
- [x] add authentication and authorization
- [x] move browser-local workflow data (watchlist, alerts, triage, saved views) into user-scoped server persistence
- [x] harden GitHub repository monitoring routes with the same rate limiting and request logging used by the rest of the API
- [x] add audit fields and activity history for project and triage changes
- [x] add rate limiting and request logging for API routes

## Product and UX

- [x] integrate Radix UI primitives/theme for a more consistent UI system
- [x] add richer dashboard views for analysts, maintainers, and incident response workflows
- [x] improve result cards with stronger severity, EPSS, KEV, and recency cues
- [x] add better empty states, skeleton states, and success/error feedback across the app
- [x] add bulk actions for watchlist, triage, and project assignment
- [x] add import/export for projects, triage state, saved views, and watchlists

## Vulnerability Management

- expand project management with owners, due dates, labels, status, and timeline views
- add a real vulnerability management workflow with assignment, SLA tracking, remediation state, and exceptions
- [x] add asset or product inventory mapping so CVEs can be linked to affected internal systems
- [x] enrich prioritization with CISA KEV, EPSS-first sorting, and exploit/reference signals
- add team-facing notifications and scheduled digest delivery

## AI and Agent Platform

- [x] replace ad hoc AI calls with a typed AI service layer that supports structured outputs, tool calling, and multi-step workflows
- [x] evaluate adopting the Vercel AI SDK for typed tool execution, structured JSON generation, and reusable agent loops in Next.js
- [x] define a small tool registry for agent workflows:
  - search CVEs
  - fetch CVE details
  - read watchlist state
  - read alert rule matches
  - read and update project records
  - read and update triage state
- [x] persist AI runs, prompts, outputs, tool calls, and failures for debugging and review
- [x] add evaluation datasets and regression tests for AI outputs so prompt or model changes do not silently degrade quality
- [x] add per-feature model/provider configuration instead of one shared global setting for every AI flow

## AI Features to Add

- [x] upgrade the AI search assistant from single-shot prompt interpretation to an agent that can clarify intent, inspect available filters, and build multi-step searches
- [x] add an AI triage agent that uses CVE detail, severity, references, KEV and EPSS signals, and project context to recommend priority, ownership, and next actions
- [x] add an AI remediation agent that drafts remediation plans, compensating controls, validation steps, and rollout notes per vulnerability
- [x] add an AI watchlist analyst agent that reviews new matches, clusters related issues, and highlights what changed since the last review
- [x] add an AI project summary agent that turns project state into executive, analyst, and engineering summaries with different output formats
- [x] add an AI alert investigation agent that explains why a rule matched and proposes the next best analyst action
- [x] add an AI duplicate and cluster agent that groups aliases, related advisories, and linked vulnerabilities into a shared incident view
- [x] add an AI exposure agent that maps vulnerabilities against tracked vendors, products, and assets to estimate likely internal impact
- add a conversational workspace where an agent can answer questions over the user’s watchlist, alerts, projects, and saved searches
- [x] add human approval checkpoints before any agent writes triage state, modifies projects, or sends notifications

## AI Safety and Operations

- [x] stop storing provider API keys in browser local storage; move to server-side secrets or secure per-user encrypted storage
- [x] add usage tracking, latency metrics, and cost visibility for each AI feature
- [x] add prompt and version management so changes to agent behavior are explicit and reversible
- [x] add fallback behavior for tool failures, upstream CIRCL outages, and malformed model responses
- [x] add redaction rules so sensitive notes or project metadata are not sent to third-party model providers by default

## Search and Data Quality

- [x] expand natural-language search to understand CWE families, date ranges, product aliases, exploitability, and remediation intent
- [x] add saved prompt templates for common analyst tasks such as "show newly published critical CVEs affecting OpenSSL this week"
- [x] preserve dependency manifest location through scan and fix flows so monorepo remediation targets the correct workspace
- [x] add regression tests for dependency parsing and GitHub scan edge cases
- [x] add search explanation output that shows exactly which fields, filters, and assumptions the AI applied
- improve data normalization for aliases, linked vulnerabilities, affected products, and reference metadata
- [x] add stronger schema validation around upstream CIRCL payloads and AI-generated JSON
