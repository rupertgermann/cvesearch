# Feature Validation Playbook

## Scope

This document is the deep validation companion to `docs/test-user-journeys.md`. It covers the full user-facing feature set currently exposed by the app. Each feature entry includes:

- Entry point
- Preconditions
- User journey
- Expected result
- Verification status

## Test Date

- March 7, 2026

## Environment

- Build verification: `npm run build`
- Test suite: `npm test`
- Lint: `npm run lint`
- Smoke environment: `npm start -- --hostname 127.0.0.1 --port 3001`

## Verification Legend

- `Smoke-tested`: exercised end to end against the local production server.
- `Automated`: covered by the automated test suite, but not re-run manually in the browser/API smoke pass for this document.
- `Partial`: some of the flow was exercised, but not every branch or UI state.
- `Environment-dependent`: requires external credentials or upstream services to fully validate.

## Verification Summary

- `npm test` passed: 181/181
- `npm run build` passed
- `npm run lint` passed with one existing warning in `src/app/layout.tsx` (`@next/next/no-page-custom-font`)
- Route reachability was smoke-tested for `/`, `/dashboard`, `/repos`, and `/settings`, plus the `/alerts`, `/watchlist`, and `/workspace` redirects
- Core CRUD and workflow APIs were smoke-tested for watchlist, triage, saved searches (alerts), inventory, AI search, and workspace export
- GitHub monitoring was only partially validated locally because a known-good GitHub repository/token combination was not available

## Feature Inventory

### Global Surfaces

1. App route reachability
2. Header navigation between search, dashboard, repos, and settings, including the Dashboard nav badge
3. Shared CVE card actions

### Search Workspace (`/`)

1. Keyword search
2. Structured filters
3. Natural-language AI search assistant
4. Search summary and active filter chips
5. Dashboard metrics panel
6. Saved searches
7. Result export
8. Pagination
9. CVE result list

### CVE Detail (`/cve/[id]`)

1. Bookmark to watchlist
3. Copy link
5. Triage workspace
7. Human approval checkpoint
10. Aliases
11. CVSS score breakdown
12. EPSS enrichment
13. Affected products
14. Problem types / CWE
15. References
16. Linked vulnerabilities
17. CAPEC attack patterns
18. Comments
19. Raw JSON data

### Dashboard Watchlist (`/dashboard#watchlist`)

1. Watchlist summary cards
2. Status filtering
3. Bulk selection
4. Bulk remove
5. Bulk triage update
6. Selectable CVE list

### Dashboard Saved Searches (`/dashboard#saved-searches`)

1. Save current search
2. Rule-by-rule match evaluation
3. Unread match calculation
4. Open saved search
5. Mark single saved search checked
6. Mark all checked
7. Delete saved search
8. Matching CVE preview list

### Repos (`/repos`)

1. Browse GitHub repositories
2. Search GitHub repositories
3. Monitor repository
4. Unmonitor repository
5. Token scope warnings
6. Scan single repository
7. Scan all monitored repositories
8. Persisted scan history
9. Vulnerability result display
10. Fix workflow modal

### Settings (`/settings`)

1. Server-side AI configuration summary
2. Available provider badges
3. Sensitive-data redaction notice
4. Per-feature AI configuration cards
5. Prompt version catalog
7. Inventory mapping
8. Workspace export
9. Workspace import in merge mode
10. Workspace import in replace mode

## Detailed User Journeys

### 1. Global Navigation and Reachability

#### 1.1 Load every main route

- Entry point: direct browser navigation
- Preconditions: app is running locally
- User journey:
  1. Open `/`
  2. Open `/dashboard`
  3. Open `/repos`
  4. Open `/settings`
  5. Open `/alerts`, `/watchlist`, and `/workspace`
- Expected result: every main route returns `200` and renders its primary page shell without crashing; `/alerts` redirects to `/dashboard#saved-searches`, `/watchlist` to `/dashboard#watchlist`, and `/workspace` to `/dashboard`
- Verification: `Smoke-tested`

#### 1.2 Navigate from page actions back to search

- Entry point: any non-home route
- Preconditions: app is running
- User journey:
  1. Open a secondary page such as `/repos`
  2. Use the page-level `Back to Search` action
- Expected result: navigation returns to `/`
- Verification: `Partial`

### 2. Search Workspace

#### 2.1 Run a keyword search

- Entry point: `/`
- Preconditions: none
- User journey:
  1. Enter a keyword such as `openssl`
  2. Submit the search
- Expected result: the URL search params update, the result list refreshes, and the summary reflects the active query
- Verification: `Automated` via `tests/search.test.ts`

#### 2.2 Apply structured filters and sorting

- Entry point: `/`
- Preconditions: homepage loaded
- User journey:
  1. Set vendor, product, or CWE filters
  2. Set a `since` date
  3. Change minimum severity
  4. Change sort order
- Expected result: result ordering and filtering update, and active filter chips appear above the result list
- Verification: `Automated` via `tests/search.test.ts`

#### 2.3 Use the natural-language AI search assistant

- Entry point: `/`
- Preconditions: homepage loaded
- User journey:
  1. Ask a natural-language question such as `show critical OpenSSL issues from the last 30 days`
  2. Apply the generated search parameters
- Expected result: the assistant translates the prompt into structured search state and the homepage reloads with those filters
- Verification: `Smoke-tested` through `POST /api/ai/search`, `Automated` via `tests/ai.test.ts` and `tests/ai-platform.test.ts`

#### 2.4 Review dashboard metrics

- Entry point: `/`
- Preconditions: homepage returns dashboard data
- User journey:
  1. Load the homepage with a normal search state
  2. Review the dashboard cards and summary panels
- Expected result: dashboard metrics render without blocking the search workflow
- Verification: `Partial`

#### 2.5 Save the current search as a saved search

- Entry point: `/dashboard` (Saved Searches section)
- Preconditions: a non-trivial search is active
- User journey:
  1. Enter a saved-search name or accept the generated default
  2. Click `Save Current Search`
  3. Click `Open Search` on the saved search
  4. Delete the saved search
- Expected result: the search is persisted as an alert rule, reopening it restores the search params, and deletion removes it from the list
- Verification: `Smoke-tested` via `POST /api/alerts` and `DELETE /api/alerts/[id]`, `Automated` via `tests/alerts.test.ts`

#### 2.6 Export visible search results

- Entry point: `/`
- Preconditions: at least one search result is visible
- User journey:
  1. Click `Export CSV`
  2. Click `Export JSON`
- Expected result: downloads are generated with search-specific filenames and include the currently visible results
- Verification: `Partial`

#### 2.7 Move through result pages

- Entry point: `/`
- Preconditions: enough results exist to paginate
- User journey:
  1. Move to the next page
  2. Move back
- Expected result: the page number updates in the URL and the viewport scrolls to the top on page change
- Verification: `Automated` via `tests/search.test.ts`

### 3. Search Result Cards

#### 3.1 Review CVE card metadata

- Entry point: any CVE list
- Preconditions: results available
- User journey:
  1. Open a result list
  2. Inspect severity, score, KEV/ransomware/EPSS badges, exploit reference count, products, assigner, and CWE metadata
- Expected result: cards show concise triage-relevant metadata without opening the detail page
- Verification: `Partial`

#### 3.2 Bookmark a CVE from the card

- Entry point: any CVE list
- Preconditions: result list loaded
- User journey:
  1. Click the bookmark control on a CVE card
  2. Open the Watchlist section on `/dashboard`
- Expected result: the CVE appears in the watchlist
- Verification: `Smoke-tested` via watchlist API flow

#### 3.4 Copy a deep link to a CVE from the card

- Entry point: any CVE list
- Preconditions: result list loaded
- User journey:
  1. Click the copy-link action
  2. Open the copied URL
- Expected result: the clipboard receives the `/cve/[id]` URL and the link opens the matching detail page
- Verification: `Partial`

#### 3.5 Open the CVE detail page from the card

- Entry point: any CVE list
- Preconditions: result list loaded
- User journey:
  1. Click the CVE title or footer link
- Expected result: the app opens `/cve/[id]`
- Verification: `Partial`

### 4. CVE Detail Page

#### 4.1 Load the CVE detail shell

- Entry point: `/cve/[id]`
- Preconditions: valid CVE identifier
- User journey:
  1. Navigate directly to a known CVE detail page
- Expected result: summary metadata, action buttons, AI panels, triage panel, and supporting sections render together
- Verification: `Partial`

#### 4.2 Bookmark and copy link from detail view

- Entry point: `/cve/[id]`
- Preconditions: detail page loaded
- User journey:
  1. Bookmark the CVE
  2. Copy the deep link
- Expected result: the actions behave the same as the result-card controls
- Verification: `Smoke-tested` through the underlying watchlist API, `Partial` for clipboard UI

#### 4.3 Update triage status, owner, tags, and notes

- Entry point: `/cve/[id]`
- Preconditions: detail page loaded
- User journey:
  1. Change the triage status
  2. Enter an owner
  3. Enter comma-separated tags
  4. Add analyst notes
- Expected result: the record persists, `updatedAt` changes, and recent activity captures the edits
- Verification: `Smoke-tested` via `GET /api/triage/[id]` and `PUT /api/triage/[id]`, `Automated` via `tests/triage.test.ts`

#### 4.6 Review aliases, CVSS, and EPSS enrichment

- Entry point: `/cve/[id]`
- Preconditions: CVE has alias or scoring data available
- User journey:
  1. Review aliases
  2. Review the CVSS score breakdown
  3. Review EPSS if available
- Expected result: normalized upstream data is displayed consistently even when the source shape varies
- Verification: `Automated` via `tests/validation.test.ts`

#### 4.7 Review affected products, problem types, references, linked vulnerabilities, CAPEC, comments, and raw data

- Entry point: `/cve/[id]`
- Preconditions: CVE detail loaded
- User journey:
  1. Review affected product entries
  2. Review CWE/problem-type information
  3. Open references
  4. Review linked vulnerabilities
  5. Review CAPEC attack patterns
  6. Review comments
  7. Expand raw JSON
- Expected result: the full investigation context is visible without leaving the detail page
- Verification: `Partial`

### 5. Watchlist

#### 5.1 Add and remove a watchlist item

- Entry point: any result card or detail page, then `/dashboard`
- Preconditions: known CVE ID
- User journey:
  1. Add a CVE to the watchlist
  2. Load the Watchlist section on `/dashboard`
  3. Remove the CVE
- Expected result: the watchlist shows the CVE when added and no longer shows it after removal
- Verification: `Smoke-tested` via `GET /api/watchlist`, `POST /api/watchlist`, and `DELETE /api/watchlist`

#### 5.2 Filter watchlist by triage status

- Entry point: `/dashboard` (Watchlist section)
- Preconditions: watchlist contains items across multiple statuses
- User journey:
  1. Click `Total`, `New`, `Investigating`, `Mitigated`, `Accepted`, and `Closed`
- Expected result: the list filters by the selected status and the summary cards remain in sync with triage state
- Verification: `Partial`

#### 5.3 Select visible items and clear selection

- Entry point: `/dashboard` (Watchlist section)
- Preconditions: at least one watchlist item exists
- User journey:
  1. Click `Select Visible`
  2. Confirm item selection counts
  3. Click `Clear Selection`
- Expected result: bulk-selection state is accurately reflected across the current filtered list
- Verification: `Partial`

#### 5.4 Bulk remove selected CVEs

- Entry point: `/dashboard` (Watchlist section)
- Preconditions: one or more items selected
- User journey:
  1. Select multiple watchlist items
  2. Click `Remove Selected`
- Expected result: all selected items are removed and success feedback shows the count
- Verification: `Smoke-tested` through watchlist delete flow

#### 5.5 Bulk update triage status

- Entry point: `/dashboard` (Watchlist section)
- Preconditions: one or more items selected
- User journey:
  1. Select a target triage status
  2. Click `Apply`
- Expected result: triage records update for all selected CVEs
- Verification: `Smoke-tested` through the triage API flow

### 6. Saved Searches

#### 6.1 Review saved-search metrics and evaluated searches

- Entry point: `/dashboard` (Saved Searches section)
- Preconditions: at least one saved search exists
- User journey:
  1. Open `/dashboard#saved-searches`
  2. Review each saved search's chips, match and unread badges, and last-checked time
  3. Review up to 8 matching CVEs per saved search
- Expected result: each saved search shows matching CVEs against the sampled latest dataset
- Verification: `Partial`

#### 6.2 Mark a single saved search checked

- Entry point: `/dashboard` (Saved Searches section)
- Preconditions: at least one saved search exists
- User journey:
  1. Click `Mark Checked` on a saved search
- Expected result: `lastCheckedAt` updates and unread calculations recalculate accordingly, including the Dashboard nav badge
- Verification: `Smoke-tested` via `PATCH /api/alerts/[id]`, `Automated` via `tests/alerts.test.ts`

#### 6.3 Mark all saved searches checked

- Entry point: `/dashboard` (Saved Searches section)
- Preconditions: at least one saved search exists
- User journey:
  1. Click `Mark All Checked`
- Expected result: all saved searches receive a new `lastCheckedAt`
- Verification: `Smoke-tested` via `POST /api/alerts/mark-all`, `Automated` via `tests/alerts.test.ts`

#### 6.4 Delete a saved search

- Entry point: `/dashboard` (Saved Searches section)
- Preconditions: at least one saved search exists
- User journey:
  1. Click `Delete` on a saved search
- Expected result: the saved search disappears from the page and from local workspace storage
- Verification: `Smoke-tested` via `DELETE /api/alerts/[id]`

#### 6.5 Migrate legacy saved views

- Entry point: DB open, or `/settings` import
- Preconditions: a database with legacy saved views, or an old export containing `savedViews`
- User journey:
  1. Open the app against the legacy database, or import the old export
  2. Review the Saved Searches section
- Expected result: old saved views appear as saved searches (alert rules); new exports no longer contain `savedViews`
- Verification: `Automated` via `tests/workspace-store.test.ts`

### 7. Repos

#### 7.1 Open the GitHub repo browser

- Entry point: `/repos`
- Preconditions: GitHub integration is configured
- User journey:
  1. Click `Browse GitHub Repositories`
- Expected result: the GitHub repo list loads and the browser panel opens
- Verification: `Partial`, `Environment-dependent`

#### 7.2 Filter the GitHub repository list

- Entry point: `/repos`
- Preconditions: repo browser is open and contains results
- User journey:
  1. Enter text in `Search repositories...`
- Expected result: the repo list narrows to matching `full_name` values
- Verification: `Partial`, `Environment-dependent`

#### 7.3 Monitor and unmonitor repositories

- Entry point: `/repos`
- Preconditions: GitHub repo browser loaded
- User journey:
  1. Click `Monitor` for a repository
  2. Confirm the repo appears in the monitored list
  3. Click `Remove`
- Expected result: the repo moves into and out of the monitored workspace set
- Verification: `Partial` for UI, `Automated` via `tests/monitored-repos-store.test.ts` and `tests/github.test.ts`

#### 7.4 Surface token-scope guidance

- Entry point: `/repos`
- Preconditions: GitHub token lacks required access or returns only a subset of repos
- User journey:
  1. Open the GitHub repo browser with a limited token
- Expected result: scope warnings explain missing `repo` access or missing fine-grained repo grants
- Verification: `Partial`, `Environment-dependent`

#### 7.5 Load monitored repositories

- Entry point: `/repos`
- Preconditions: monitored repos exist
- User journey:
  1. Open `/repos`
- Expected result: monitored repositories load immediately and existing scan history is fetched for each one
- Verification: `Smoke-tested` via `GET /api/github/monitored`

#### 7.6 Scan a single monitored repository

- Entry point: `/repos`
- Preconditions: monitored repository exists and GitHub API access works
- User journey:
  1. Click `Scan` on a monitored repo
- Expected result: the repo enters a scanning state, then shows vulnerabilities or a surfaced scan error
- Verification: `Partial`, `Environment-dependent`

#### 7.7 Scan all monitored repositories

- Entry point: `/repos`
- Preconditions: at least one monitored repo exists
- User journey:
  1. Click `Scan All`
- Expected result: all monitored repos begin scanning concurrently and settle individually
- Verification: `Partial`, `Environment-dependent`

#### 7.8 Review persisted scan history

- Entry point: `/repos`
- Preconditions: at least one repo has been scanned previously
- User journey:
  1. Open the monitored repo card
  2. Review scan-history entries
- Expected result: prior scans are listed from persisted SQLite-backed history
- Verification: `Automated` via `tests/repo-scans-store.test.ts`

#### 7.9 Review repository vulnerability rows

- Entry point: `/repos`
- Preconditions: a successful scan exists
- User journey:
  1. Expand scan results
  2. Review affected package, severity, advisory, and fix metadata
- Expected result: vulnerabilities are grouped under the scanned repository with severity context
- Verification: `Automated` via `tests/dependency-parser.test.ts` and `tests/github.test.ts`

#### 7.10 Open the fix workflow modal

- Entry point: `/repos`
- Preconditions: successful scan results include actionable vulnerabilities
- User journey:
  1. Open the vulnerability fix modal from a finding
  2. Review proposed fix options and PR flow inputs
- Expected result: the modal prepares a fix workflow for GitHub PR creation
- Verification: `Automated` via `tests/github-pr.test.ts`, `Environment-dependent` for live PR creation

#### 7.11 Negative-path repo scanning

- Entry point: `/repos`
- Preconditions: local environment without a known-good upstream target
- User journey:
  1. Submit a scan request for a monitored repository
- Expected result: the app surfaces the upstream failure instead of crashing
- Verification: `Smoke-tested`; observed `POST /api/github/scan` returned `502` with `GitHub API error: Not Found`

### 8. Settings

#### 8.1 Review the server-side AI configuration summary

- Entry point: `/settings`
- Preconditions: settings page loaded
- User journey:
  1. Open the page
  2. Review provider, mode, and model summary cards
- Expected result: the user can see whether AI is running in configured-provider or heuristic mode
- Verification: `Partial`

#### 8.2 Review provider availability and redaction posture

- Entry point: `/settings`
- Preconditions: settings page loaded
- User journey:
  1. Review available provider badges
  2. Review the redaction safeguard callout
- Expected result: the page clearly communicates whether sensitive metadata is redacted before third-party model calls
- Verification: `Partial`

#### 8.3 Review per-feature AI configuration

- Entry point: `/settings`
- Preconditions: settings page loaded
- User journey:
  1. Review each feature card in `Per-Feature Configuration`
- Expected result: every AI feature shows its provider, model, and configured versus heuristic mode
- Verification: `Partial`

#### 8.5 Add an inventory asset

- Entry point: `/settings`
- Preconditions: none
- User journey:
  1. Enter asset name
  2. Enter vendor and/or product
  3. Optionally enter version, environment, criticality, and notes
  4. Click `Add Asset`
- Expected result: the asset appears in `Tracked Assets` and inventory counts update
- Verification: `Smoke-tested` via `POST /api/inventory`, `Automated` via related workspace-store coverage

#### 8.6 Remove an inventory asset

- Entry point: `/settings`
- Preconditions: at least one asset exists
- User journey:
  1. Click `Delete` on an asset
- Expected result: the asset is removed from the tracked list
- Verification: `Smoke-tested` via `DELETE /api/inventory/[id]`

#### 8.7 Export workspace data

- Entry point: `/settings`
- Preconditions: workspace has data
- User journey:
  1. Click `Export JSON`
- Expected result: a JSON snapshot downloads containing watchlist, saved searches (alert rules), inventory, and triage records
- Verification: `Smoke-tested` via `GET /api/workspace/export`, `Automated` via `tests/workspace-store.test.ts`

#### 8.8 Import workspace data in merge mode

- Entry point: `/settings`
- Preconditions: valid workspace export file available
- User journey:
  1. Choose `Merge Import`
  2. Select a workspace snapshot JSON
- Expected result: imported records are upserted without clearing existing workspace data
- Verification: `Automated` via `tests/workspace-store.test.ts`

#### 8.9 Import workspace data in replace mode

- Entry point: `/settings`
- Preconditions: valid workspace export file available
- User journey:
  1. Choose `Replace Existing`
  2. Select a workspace snapshot JSON
- Expected result: current workspace data is cleared and then replaced by the imported snapshot
- Verification: `Automated` via `tests/workspace-store.test.ts`

## Automated Coverage Map

- Search, filtering, and result preference logic: `tests/search.test.ts`
- Triage persistence and workflow behavior: `tests/triage.test.ts`
- Saved search (alert rule) persistence and evaluation behavior: `tests/alerts.test.ts`
- Repo monitoring and GitHub integration helpers: `tests/github.test.ts`, `tests/monitored-repos-store.test.ts`
- Repo scan persistence: `tests/repo-scans-store.test.ts`
- Fix PR workflow logic: `tests/github-pr.test.ts`
- Dependency parsing for repo scans: `tests/dependency-parser.test.ts`
- AI provider behavior and heuristic fallbacks: `tests/ai.test.ts`, `tests/ai-platform.test.ts`
- AI run history persistence: `tests/ai-runs-store.test.ts`
- Workspace import/export store behavior: `tests/workspace-store.test.ts`
- Validation and upstream normalization: `tests/validation.test.ts`
- General utility coverage: `tests/utils.test.ts`
- API route guards: `tests/api-route-guard.test.ts`

## Environment Caveats

### GitHub Scanning and Fix PR Creation

- Live repository browsing, dependency scanning, and fix PR creation depend on valid GitHub credentials and repository access.
- In the March 7, 2026 local verification run, monitored-repo loading worked, but a live scan request returned `502` with `GitHub API error: Not Found`.
- The negative path was therefore validated, but a successful end-to-end scan plus PR flow still needs a fully provisioned GitHub test environment.

### Browser-Only Interactions

- Clipboard, download, and some visual-state interactions were validated primarily through UI inspection and underlying API behavior rather than automated browser playback.
- If stricter regression protection is needed, the next best step is to add Playwright journeys for the highest-value flows:
  1. Search to watchlist to triage
  2. Repo scan happy-path with mocked GitHub responses
