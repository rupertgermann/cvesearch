# 2. Remove projects

Date: 2026-10-31
Status: Accepted

## Context

Projects grouped CVEs into a remediation effort with an owner, due date, labels, status, and per-CVE owner, remediation state, SLA and exception. The same progress could already be tracked in two other places: the triage on the CVE page (status, owner, notes, tags) and the finding triage in the exposure queue (status, accepted risk with expiry, per CVE and asset). One CVE could therefore carry three unrelated states. The exposure queue is the place where the work happens, because only it knows which asset or repo is affected.

## Decision

Delete projects outright: the `/projects` page, the `/api/projects` routes, the project picker on CVE cards, the CVE page and exposure-queue rows, bulk assignment on the watchlist, the "Projects" digest section, and the project context in remediation notes. No feature flag. Git history is the way back.

## Consequences

- The `projects`, `project_items` and `project_activity` tables are no longer created, migrated, read or written. Databases that already have them keep them and their data; dropping them is a separate, one-way step.
- `PROJECTS_FILE` no longer decides where the database lives. A deployment that set only `PROJECTS_FILE` must set `DATABASE_FILE=<directory of PROJECTS_FILE>/state.db` to keep its data.
- Workspace export no longer contains projects. Import still accepts older files that do and ignores the field.
- Remediation notes no longer name projects or raise the change risk for CVEs that sit in several projects.
- Remediation notes cached before this change may still mention projects until they are regenerated.
