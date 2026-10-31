# Test User Journeys

This is the concise QA checklist for routine validation runs. For the exhaustive feature-by-feature version, use `docs/feature-validation-playbook.md`.

## Verification Snapshot

- Verification baseline date: March 7, 2026
- Build: `npm run build` passed
- Tests: `npm test` passed with 65/65
- Lint: `npm run lint` passed with one existing warning in `src/app/layout.tsx`
- Local smoke target: `npm start -- --hostname 127.0.0.1 --port 3001`

## Status Legend

- `Smoke-tested`: verified against the local production server
- `Automated`: covered by the automated suite
- `Partial`: only some UI states or branches were manually exercised
- `Environment-dependent`: requires external credentials or upstream systems

## Recommended QA Run Order

1. Route reachability
2. Search and result actions
3. Watchlist and triage
4. Alerts
5. Projects
6. Workspace notifications
7. Settings data workflows
8. Repos and GitHub flows

## Core Journeys

### 1. Route Reachability

- Open `/`, `/watchlist`, `/alerts`, `/projects`, `/repos`, `/settings`, and `/workspace`
- Expected result: each route returns `200` and renders its page shell
- Verification: `Smoke-tested`

### 2. Search Workspace

- Run a keyword search such as `openssl`
- Apply structured filters for vendor, product, CWE, `since`, severity, and sort
- Use the AI search assistant and apply the generated search state
- Save the current search as a saved view, reopen it, then delete it
- Save the current search as an alert rule
- Export visible results as CSV and JSON
- Expected result: URL state, filters, saved views, alerts, digests, and exports all behave consistently
- Verification: `Smoke-tested` for saved views, alerts, and AI search; `Automated` for search/filter logic; `Partial` for download UX

### 3. CVE Result Actions

- From a CVE card, bookmark the CVE
- Add the CVE to a project
- Copy the deep link
- Open the detail page
- Expected result: result cards support direct workflow entry without leaving the list context
- Verification: `Smoke-tested` for watchlist and project APIs; `Partial` for clipboard UX

### 4. CVE Detail Workflow

- Open `/cve/[id]`
- Update triage status, owner, tags, and notes
- Review aliases, CVSS, EPSS, products, references, linked vulnerabilities, CAPEC, comments, and raw data
- Expected result: the detail page acts as the primary investigation and workflow surface
- Verification: `Smoke-tested` for triage persistence; `Automated` for AI and normalization logic; `Partial` for full visual inspection

### 5. Watchlist

- Add a CVE to the watchlist and load `/watchlist`
- Filter by triage status
- Select visible items and clear selection
- Bulk remove selected items
- Bulk update triage status
- Bulk assign items to an existing project
- Create a new project inline during assignment
- Expected result: watchlist supports individual and bulk vulnerability operations
- Verification: `Smoke-tested` for CRUD and project assignment; `Automated` for AI helpers; `Partial` for all selection states

### 6. Alerts

- Open `/alerts`
- Review metrics, unread counts, and rule sections
- Mark one rule checked
- Mark all rules checked
- Delete a rule
- Expected result: alert rules are reviewable, mutable, and AI-explainable
- Verification: `Smoke-tested` for rule mutations; `Automated` for alert logic and AI helpers; `Partial` for full UI inspection

### 7. Projects

- Create a project
- Update project metadata: owner, due date, labels, status, description
- Add a CVE to the project from another surface
- Update project-item owner, remediation state, SLA due date, notes, and exception fields
- Remove a project item
- Delete a project
- Expected result: projects support end-to-end remediation tracking and exception handling
- Verification: `Smoke-tested` for project and item CRUD; `Automated` for store logic and AI helpers

### 8. Workspace

- Create a notification schedule
- Run all due digests
- Toggle a schedule off and on
- Delete a schedule
- Review delivery history
- Expected result: the workspace page manages digest schedules and delivery history
- Verification: `Smoke-tested` for notification CRUD/run flows; `Automated` for notification stores; `Partial` for all UI states

### 9. Settings

- Review AI provider summary, redaction posture, and per-feature configuration
- Add and delete an inventory asset
- Export workspace data
- Import workspace data in merge mode
- Import workspace data in replace mode
- Expected result: the settings page exposes AI operations visibility and workspace data management
- Verification: `Smoke-tested` for inventory CRUD and export; `Automated` for workspace import/export and AI run persistence; `Partial` for read-only operational panels

### 10. Repos

- Open `/repos`
- Load monitored repositories
- Open the GitHub repo browser
- Search accessible repositories
- Monitor and unmonitor a repository
- Review token-scope warnings if shown
- Attempt a single scan and, where possible, `Scan All`
- Review scan history and vulnerability rows
- Open the fix modal if a successful scan is available
- Expected result: repo monitoring works end to end when GitHub credentials and target repositories are valid
- Verification: `Smoke-tested` for monitored-repo loading and negative-path scan handling; `Automated` for scan persistence, parsing, and PR workflow logic; `Environment-dependent` for live scan and PR creation

## Known Environment Caveat

- In the March 7, 2026 local verification run, `POST /api/github/scan` returned `502` with `GitHub API error: Not Found`, so the failure path was validated but the happy-path GitHub scan plus PR flow still needs a provisioned external test target.

## Companion Doc

- Deep validation guide: `docs/feature-validation-playbook.md`
