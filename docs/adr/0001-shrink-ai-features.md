# 1. Shrink the AI features to the exposure workflow

Date: 2026-10-31
Status: Accepted
Issue: #30

## Context

The app had ten AI features: CVE insight, triage assistant, remediation plan, exposure assessment, project summary, watchlist review, alert investigation, daily digest, search assistant and the workspace chat. They came with saved prompt templates, a tool registry and a run-history panel. Most of them re-summarised data that was already on screen. Each one has to be maintained, tested and paid for per call.

The `ai_runs` table could not settle the question. Its 95 rows came almost entirely from development and test sessions, not from real use.

## Decision

Keep AI only where it does work a person cannot do quickly:

- **Fix PR generation** for repo findings (`ai-fix.ts`).
- **Natural-language search**, which turns a sentence into search filters.
- **Remediation notes** for a finding, shown on demand from its row in the exposure queue. This one panel replaces the CVE insight, triage, exposure and remediation panels on the CVE page.

Delete everything else outright, with no feature flag:

- watchlist review, alert investigation, project summary, CVE insight, triage assistant, exposure assessment
- the dashboard and watchlist digest panels
- the workspace chat
- saved prompt templates, the tool registry and the run-history panel

Git history is the way back.

Notification digests stay. They always use the heuristic summary (`buildHeuristicDigest`), so a digest costs no model call and its text is predictable.

`ai_runs` keeps recording the calls that remain, so their cost stays visible in the database.

## Consequences

- The database tables of the removed features (`user_prompt_templates`, `user_workspace_conversations`, `user_workspace_messages`) stay but are no longer read or written. Dropping them is a separate, one-way step.
- Workspace export no longer contains prompt templates or conversations. Import still accepts older files that do and ignores those fields.
- The CVE detail page has no AI panel. Remediation notes are reached from the exposure queue.
