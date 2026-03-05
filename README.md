# CVE Search

A fast web interface for searching and exploring CVE (Common Vulnerabilities and Exposures) records. Built with Next.js and powered by the [CIRCL vulnerability-lookup API](https://vulnerability.circl.lu/).

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Screenshots

### Search Interface
![CVE Search Interface](docs/images/screenshot-search.png)
*Search and explore CVE vulnerability records with filters, saved views, and export options*

### CVE Detail View
![CVE Detail View](docs/images/screenshot-detail.png)
*Detailed vulnerability information including CVSS score breakdown, affected products, and references*

## Features

- **URL-driven search state** — Search query, filters, and pagination are encoded in the URL for shareable result pages
- **Keyword and CVE lookup** — Search by product keyword or jump directly to a CVE ID such as `CVE-2024-1234`
- **Filterable result sets** — Filter by product, vendor/product pair, CWE, published-since date, and minimum severity
- **Prioritization controls** — Sort by newest, oldest, highest CVSS, or lowest CVSS
- **Vendor and product browse assist** — Filter inputs now offer vendor suggestions and vendor-scoped product suggestions
- **Server-rendered homepage results** — Initial search results are resolved on the server for faster first paint
- **Saved views** — Save reusable searches locally, inspired by OpenCVE views
- **Local watchlist** — Bookmark CVEs or advisories and revisit them on a dedicated watchlist page
- **Analyst dashboard** — Start from curated views like latest critical, highest CVSS, and recent high-impact vulnerabilities
- **Richer result cards** — See affected-product hints and copy deep links directly from search results
- **Export actions** — Download the currently visible result set as CSV or JSON
- **Detailed CVE views** — Review CVSS scores, EPSS exploit probability when a CVE ID exists, affected products, references, and raw source data
- **Severity indicators** — Color-coded CVSS severity badges
- **Paginated results** — Navigate through large result sets
- **Responsive dark UI** — Works on desktop and mobile
- **Server-side API proxy** — Avoids browser CORS issues and caches upstream responses

## Current Limitations

- Vendor-only filtering is intentionally blocked. The current data flow only supports a trustworthy vendor filter when paired with a product.
- Saved views and watchlist are browser-local only. They are not synced across devices or users.
- CWE enrichment and linked-vulnerability rendering are still partial.
- The proxy now uses path allowlisting, timeout handling, and response validation, but it still does not include retries, rate limits, or richer observability.
- OpenCVE-style notifications, projects, tags, assignments, and reports are not implemented yet.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-username/cvesearch.git
cd cvesearch

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

```bash
# Start the local dev server
npm run dev

# Lint the codebase
npm run lint

# Run unit tests
npm test

# Build for production
npm run build

# Start the production server
npm start
```

### Production Build

```bash
npm run build
npm start
```

## Testing

The project includes lightweight TypeScript unit tests for:

- search-state parsing and URL param generation
- CVE ID detection and search validation rules
- core CVSS and description extraction helpers
- upstream response validation for CVE, EPSS, CWE, and browse payloads

GitHub Actions runs `lint`, `test`, and `build` on pushes and pull requests.

## Project Structure

```
src/
├── app/
│   ├── api/proxy/route.ts    # API proxy to CIRCL backend
│   ├── cve/[id]/page.tsx     # CVE detail page
│   ├── layout.tsx            # Root layout with dark theme
│   ├── page.tsx              # Server-rendered home page entry
│   ├── watchlist/page.tsx    # Watchlist route
│   └── globals.css           # Global styles
├── components/
│   ├── BookmarkButton.tsx    # Local watchlist toggle
│   ├── DashboardPanel.tsx    # Homepage analyst dashboard sections
│   ├── HomePageClient.tsx    # Client shell for URL-driven search interactions
│   ├── Header.tsx            # Navigation header
│   ├── SavedViewsPanel.tsx   # Local saved views UI
│   ├── SearchBar.tsx         # Search input
│   ├── Filters.tsx           # Product/vendor/CWE/date filters
│   ├── CVEList.tsx           # CVE results list
│   ├── CVECard.tsx           # Individual CVE summary card
│   ├── SeverityBadge.tsx     # CVSS severity color badge
│   ├── WatchlistPageClient.tsx # Watchlist page client UI
│   └── Pagination.tsx        # Page navigation
└── lib/
    ├── api.ts                # API client functions
    ├── search.ts             # Canonical search state + URL param helpers
    ├── server-api.ts         # Server-side data fetching helpers
    ├── saved-views.ts        # Browser-local saved views
    ├── types.ts              # TypeScript type definitions
    ├── utils.ts              # Utility functions
    └── watchlist.ts          # Browser-local watchlist helpers

tests/
├── search.test.ts            # Search-state and validation tests
└── utils.test.ts             # Utility function tests
```

## API

This app uses a server-side proxy (`/api/proxy`) to communicate with the [CIRCL vulnerability-lookup API](https://vulnerability.circl.lu/). The proxy avoids CORS issues and adds 60-second response caching.

### Endpoints Used

| CIRCL Endpoint | Purpose |
|---|---|
| `GET /api/vulnerability/` | List/search vulnerabilities with filters |
| `GET /api/vulnerability/{id}` | Get full CVE details |
| `GET /api/vulnerability/search/{vendor}/{product}` | Search by vendor and product |
| `GET /api/vulnerability/browse/` | List all vendors |
| `GET /api/vulnerability/browse/{vendor}` | List products for a vendor |
| `GET /api/epss/{cve_id}` | Get EPSS exploit probability score |
| `GET /api/cwe/{cwe_id}` | Get CWE weakness details |

All requests go through `/api/proxy?path=<encoded_path>` which forwards to `https://vulnerability.circl.lu/api`.

## Roadmap Docs

Planning and backlog docs live in [`docs/`](./docs):

- `docs/review-findings.md`
- `docs/improvement-plan.md`
- `docs/execution-backlog.md`
- `docs/opencve-benchmark.md`

## Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **UI:** [React 19](https://react.dev/)
- **Language:** [TypeScript 5](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/)
- **Data Source:** [CIRCL vulnerability-lookup](https://vulnerability.circl.lu/)

## License

[MIT](./LICENSE)
