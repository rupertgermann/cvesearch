# CVE Search

Fast, analyst-friendly CVE search, GitHub repository monitoring, and automated vulnerability remediation built with Next.js.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Overview

CVE Search turns raw vulnerability data into a workflow-oriented web app for research, prioritization, and lightweight tracking.

It combines URL-driven search, rich CVE detail pages, saved views, watchlists, alerts, triage state, and project grouping in a single interface. The app is designed to feel closer to an analyst workstation than a simple API browser.

It also includes an optional AI layer for natural-language search, analyst-facing CVE summaries, remediation guidance, and cross-workspace digests, with provider settings stored locally in the browser.

The GitHub Repos feature connects private and public repositories, scans their dependency trees for known vulnerabilities via the OSV.dev API, and can automatically generate fix PRs using AI.

## Screenshots

### Search Workspace

URL-driven search, saved views, alert rules, analyst dashboard presets, and AI-assisted search in one screen.

![CVE Search Workspace](docs/images/screenshot-search.png)

### CVE Detail View

Structured vulnerability detail with AI insight, triage state, CVSS context, affected products, and linked references.

![CVE Detail View](docs/images/screenshot-detail.png)

### AI Settings

Browser-local AI provider settings for choosing the provider, model, and API key used by AI workflows.

![AI Settings](docs/images/screenshot-settings.png)

## Highlights

- URL-driven search state for shareable result pages
- Direct CVE lookup plus keyword/product search
- Vendor and product browse assist
- Severity filters and result sorting
- Server-rendered homepage results
- Rich CVE detail pages with EPSS, CWE, CAPEC, references, comments, and linked vulnerabilities when available
- Saved views, watchlist, alerts, and triage workflow
- Server-persisted projects workspace
- AI-assisted search, summaries, triage guidance, and workspace digests
- GitHub repository monitoring with deep dependency scanning (npm, pnpm, Composer) across monorepo subdirectories
- AI-powered vulnerability fix generation with automatic pull request creation
- Duplicate PR detection to avoid redundant fix branches
- Export to CSV and JSON
- Upstream response validation and hardened proxy behavior

## Feature Set

### Search and Prioritization

- Search by CVE ID such as `CVE-2024-1234`
- Search by keyword or product
- Filter by vendor/product pair, CWE, published-since date, and minimum severity
- Sort by newest, oldest, highest CVSS, or lowest CVSS
- Copy deep links to exact search states

### Analyst Workflow

- Save reusable searches as local saved views
- Bookmark CVEs and advisories in a local watchlist
- Create local alert rules and review matches in an alerts center
- Track local triage status, owner, tags, and notes
- Group CVEs into server-persisted projects stored in the workspace

### AI Workspace

- Translate natural-language prompts into structured search filters
- Generate analyst-friendly CVE summaries and triage recommendations
- Draft remediation notes from affected products, references, and available metadata
- Build watchlist, alerts, and project digests from current workspace context
- Configure provider, model, and API key in a browser-local settings page

### Vulnerability Detail

- CVSS score breakdown and severity badges
- EPSS lookup when a real CVE identifier is available
- Structured affected product rendering
- CWE enrichment when available
- CAPEC entries, comments, linked vulnerabilities, and references when present upstream
- Raw source payload for deeper inspection

### GitHub Repository Monitoring

- Connect private and public GitHub repositories via a personal access token
- Deep dependency scanning using the GitHub Tree API to discover dependency files across all subdirectories
- Supports npm (`package.json`, `package-lock.json`), pnpm (`pnpm-lock.yaml`), and Composer (`composer.json`, `composer.lock`)
- Batch vulnerability lookup via the OSV.dev API with CVSS v3 base score calculation
- Vulnerability detail links to internal CVE pages when a CVE alias is available
- AI-powered fix generation: analyzes the vulnerability, generates file changes, creates a branch, commits, and opens a pull request
- Heuristic fallback when no AI provider is configured (version bump to known fixed version)
- Detects existing fix PRs to prevent duplicates
- Archived and disabled repository detection with clear error messages

### Engineering Quality

- Server-rendered initial result loading
- URL-first state management
- Server-side API proxy with allowlisting and timeout handling
- Upstream response validation for key CIRCL payloads
- Automated lint, test, and build checks in CI
- Heuristic AI fallback when no model provider is configured

## Current Boundaries

- Vendor-only filtering is intentionally blocked because the current upstream flow is only trustworthy when vendor is paired with product.
- Saved views, watchlist, alerts, and triage state are browser-local, not synced across devices or users.
- AI provider settings and API keys are stored in browser local storage and are not encrypted.
- Projects and monitored repositories are persisted in the app workspace via JSON storage, not a production database.
- Team assignments, user accounts, email or Slack notifications, and scheduled reports are not implemented.
- Lock file regeneration (`npm install`, `composer update`) must be run locally after merging AI-generated fix PRs.

## Quick Start

```bash
git clone https://github.com/rupertgermann/cvesearch.git
cd cvesearch
npm install
```

Copy the example environment file and add your GitHub token:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set `GITHUB_TOKEN` to a GitHub PAT with the required scopes (see below).

```bash
npm run dev
```

Open `http://localhost:3000`.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | For Repos feature | GitHub Personal Access Token. Classic PAT needs `repo` scope. Fine-grained PAT needs **Contents: Read and write** and **Pull requests: Read and write**. |

### AI Configuration

To use model-backed AI features instead of the built-in heuristic fallback, open `/settings` in the app and configure:

- provider (OpenAI or Anthropic)
- model
- API key

AI settings are stored in browser `localStorage` and apply to search interpretation, CVE summaries, triage guidance, workspace digests, and vulnerability fix generation.

## Scripts

```bash
npm run dev
npm run lint
npm test
npm run build
npm start
```

## Testing

The project includes lightweight TypeScript tests for:

- search-state parsing and URL generation
- prioritization and local alert matching
- triage helpers
- upstream response validation
- project helper logic
- CVSS and description extraction

GitHub Actions runs `lint`, `test`, and `build` on pushes and pull requests.

## Project Structure

```text
src/
├── app/
│   ├── api/
│   │   ├── ai/              # AI summary, search, and digest APIs
│   │   ├── github/          # GitHub integration APIs
│   │   │   ├── fix/         # AI fix generation and PR creation
│   │   │   ├── repos/       # Repository listing
│   │   │   └── scan/        # Dependency scanning
│   │   ├── projects/        # Workspace project APIs
│   │   └── proxy/           # CIRCL proxy
│   ├── alerts/              # Alerts route
│   ├── cve/[id]/            # CVE detail route
│   ├── projects/            # Projects route
│   ├── repos/               # GitHub repository monitoring route
│   ├── settings/            # Browser-local AI provider settings
│   ├── watchlist/           # Watchlist route
│   └── page.tsx             # Homepage
├── components/              # Search, detail, workflow, repos, and navigation UI
└── lib/                     # Search logic, AI helpers, API clients, GitHub integration,
                             # dependency parsing, storage, validation, utilities

data/
├── monitored-repos.json     # Monitored repository persistence
└── projects.json            # Workspace project persistence

tests/                       # Node-based TypeScript test suite
```

## API Usage

### CIRCL vulnerability-lookup

The app talks to CIRCL through `/api/proxy`, which forwards to `https://vulnerability.circl.lu/api`.

Primary upstream endpoints:

- `GET /api/vulnerability/`
- `GET /api/vulnerability/{id}`
- `GET /api/vulnerability/search/{vendor}/{product}`
- `GET /api/vulnerability/browse/`
- `GET /api/vulnerability/browse/{vendor}`
- `GET /api/epss/{cve_id}`
- `GET /api/cwe/{cwe_id}`

### OSV.dev

Used for dependency vulnerability scanning:

- `POST /v1/querybatch` — batch lookup of dependencies by ecosystem and version
- `GET /v1/vulns/{id}` — full vulnerability details for enrichment

### GitHub API v3

Used for repository monitoring, dependency file discovery, and PR creation:

- `GET /user/repos` — list accessible repositories
- `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` — discover all dependency files
- `GET /repos/{owner}/{repo}/contents/{path}` — fetch file contents
- `GET /repos/{owner}/{repo}/pulls` — check for existing fix PRs
- `POST /repos/{owner}/{repo}/git/refs` — create fix branches
- `PUT /repos/{owner}/{repo}/contents/{path}` — commit file changes
- `POST /repos/{owner}/{repo}/pulls` — open pull requests

## Docs

Planning and benchmark docs live in [`docs/`](./docs):

- `docs/review-findings.md`
- `docs/improvement-plan.md`
- `docs/execution-backlog.md`
- `docs/opencve-benchmark.md`
- [`CHANGELOG.md`](./CHANGELOG.md)

## Tech Stack

- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS 4
- CIRCL vulnerability-lookup API
- OSV.dev API
- GitHub API v3
- Optional OpenAI or Anthropic provider integration

## License

[MIT](./LICENSE)
