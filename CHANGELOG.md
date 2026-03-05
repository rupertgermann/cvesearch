# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog, and this project follows a simple date-based release history.

## [2026-03-05] - AI Workflows Release

### Added

- AI-assisted CVE insight panels on vulnerability detail pages
- AI search assistant for turning natural-language prompts into structured filters
- AI digest panels for watchlist and workspace context
- Browser-local AI settings page for provider, model, and API key configuration
- Support for `heuristic`, `openai`, and `anthropic` AI providers
- Heuristic fallback behavior so AI features still work without a configured model provider
- AI API routes for CVE insights, digests, and search interpretation
- Automated tests for AI heuristics and interpretation logic

### Changed

- README updated to reflect the AI feature set and settings workflow
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
