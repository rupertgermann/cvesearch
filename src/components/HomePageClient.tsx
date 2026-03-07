"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CVESummary, HomeDashboardData } from "@/lib/types";
import {
  applySearchResultPreferences,
  buildSearchParams,
  DEFAULT_PAGE,
  getSearchSummary,
  hasActiveFilters,
  normalizeSearchState,
  PER_PAGE,
  SearchState,
} from "@/lib/search";
import SearchBar from "@/components/SearchBar";
import Filters from "@/components/Filters";
import CVEList from "@/components/CVEList";
import Pagination from "@/components/Pagination";
import SavedViewsPanel from "@/components/SavedViewsPanel";
import ExportResultsButtons from "@/components/ExportResultsButtons";
import DashboardPanel from "@/components/DashboardPanel";
import AlertRulesPanel from "@/components/AlertRulesPanel";
import AISearchAssistantPanel from "@/components/AISearchAssistantPanel";
import AIDigestPanel from "@/components/AIDigestPanel";

interface HomePageClientProps {
  initialState: SearchState;
  cves: CVESummary[];
  dashboard: HomeDashboardData | null;
  error: string | null;
  totalHint: string;
}

export default function HomePageClient({
  initialState,
  cves,
  dashboard,
  error,
  totalHint,
}: HomePageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const state = useMemo(() => normalizeSearchState(initialState), [initialState]);
  const visibleCves = useMemo(() => applySearchResultPreferences(cves, state), [cves, state]);

  const navigate = useCallback(
    (nextState: SearchState) => {
      const params = buildSearchParams(nextState);
      const href = params.toString() ? `/?${params.toString()}` : "/";

      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [router]
  );

  const handleSearch = useCallback(
    (query: string) => {
      navigate(
        normalizeSearchState({
          ...state,
          query,
          page: DEFAULT_PAGE,
        })
      );
    },
    [navigate, state]
  );

  const handleAISearchApply = useCallback(
    (next: Partial<SearchState>) => {
      navigate(
        normalizeSearchState({
          query: "",
          vendor: "",
          product: "",
          cwe: "",
          since: "",
          minSeverity: "ANY",
          sort: "published_desc",
          perPage: state.perPage,
          ...next,
          page: DEFAULT_PAGE,
        })
      );
    },
    [navigate, state.perPage]
  );

  const handleFilters = useCallback(
    (filters: {
      vendor: string;
      product: string;
      cwe: string;
      since: string;
      minSeverity: SearchState["minSeverity"];
      sort: SearchState["sort"];
    }) => {
      navigate(
        normalizeSearchState({
          ...state,
          ...filters,
          page: DEFAULT_PAGE,
        })
      );
    },
    [navigate, state]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      navigate(
        normalizeSearchState({
          ...state,
          page,
        })
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [navigate, state]
  );

  return (
    <div className="app-shell px-4 py-8 sm:px-6">
      {/* Hero */}
      <div className="page-header text-center">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/15 bg-cyan-500/5 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-medium text-cyan-300/80">Live threat intelligence</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Vulnerability Search
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-[15px] text-white/35">
          Search and explore CVE vulnerability records from the global database
        </p>
      </div>

      <div className="mb-6 space-y-4">
        <AISearchAssistantPanel onApply={handleAISearchApply} />
        <SearchBar
          key={state.query}
          onSearch={handleSearch}
          initialQuery={state.query}
          loading={isPending}
        />
        <Filters
          key={[state.vendor, state.product, state.cwe, state.since].join("|")}
          onApply={handleFilters}
          initialFilters={{
            vendor: state.vendor,
            product: state.product,
            cwe: state.cwe,
            since: state.since,
            minSeverity: state.minSeverity,
            sort: state.sort,
          }}
        />
        <SavedViewsPanel search={state} />
        <AlertRulesPanel search={state} />
      </div>

      {dashboard && !error && <DashboardPanel dashboard={dashboard} />}
      {!error && <div className="mb-6"><AIDigestPanel /></div>}

      {/* Results bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/35">
          <span>{getSearchSummary(state)}</span>
          {totalHint && (
            <>
              <span className="text-white/15">/</span>
              <span className="text-white/25">{totalHint}</span>
            </>
          )}
          <span className="text-white/15">/</span>
          <span className="font-mono text-cyan-400/60">{visibleCves.length} shown</span>
        </div>
        <ExportResultsButtons cves={visibleCves} search={state} />
      </div>

      {hasActiveFilters(state) && (
        <div className="mb-4 flex flex-wrap gap-1.5 animate-fade-in">
          {state.vendor && <FilterChip label={`Vendor: ${state.vendor}`} />}
          {state.product && <FilterChip label={`Product: ${state.product}`} />}
          {state.cwe && <FilterChip label={`CWE: ${state.cwe}`} />}
          {state.since && <FilterChip label={`Since: ${state.since}`} />}
          {state.minSeverity !== "ANY" && <FilterChip label={`Min: ${state.minSeverity}`} />}
          {state.sort !== "published_desc" && <FilterChip label={`Sort: ${formatSortLabel(state.sort)}`} />}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300 animate-fade-in">
          <span className="font-semibold">Error:</span> {error}
        </div>
      )}

      <CVEList cves={visibleCves} loading={isPending} />

      {visibleCves.length > 0 && !error && (
        <div className="mt-6">
          <Pagination
            page={state.page}
            hasMore={cves.length >= PER_PAGE}
            onPageChange={handlePageChange}
            loading={isPending}
          />
        </div>
      )}
    </div>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <span className="badge badge-xs border-white/[0.08] bg-white/[0.04] text-white/50">
      {label}
    </span>
  );
}

function formatSortLabel(sort: SearchState["sort"]): string {
  switch (sort) {
    case "risk_desc":
      return "Highest risk";
    case "published_asc":
      return "Oldest first";
    case "cvss_desc":
      return "Highest CVSS";
    case "cvss_asc":
      return "Lowest CVSS";
    default:
      return "Newest first";
  }
}
