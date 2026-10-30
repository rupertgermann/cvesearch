"use client";

import Link from "next/link";
import { useCallback, useMemo, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CVESummary, DataSource } from "@/lib/types";
import {
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
import ExportResultsButtons from "@/components/ExportResultsButtons";
import AISearchAssistantPanel from "@/components/AISearchAssistantPanel";
import CachedDataNotice from "@/components/CachedDataNotice";

interface HomePageClientProps {
  initialState: SearchState;
  cves: CVESummary[];
  error: string | null;
  totalHint: string;
  source: DataSource;
  storedAt?: string;
}

export default function HomePageClient({
  initialState,
  cves,
  error,
  totalHint,
  source,
  storedAt,
}: HomePageClientProps) {
  const router = useRouter();
  // Rendered at /search and, for users without inventory or repos, at /.
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const state = useMemo(() => normalizeSearchState(initialState), [initialState]);
  const dashboardHref = useMemo(() => {
    const params = buildSearchParams(state);
    return params.toString() ? `/dashboard?${params.toString()}` : "/dashboard";
  }, [state]);

  const navigate = useCallback(
    (nextState: SearchState) => {
      const params = buildSearchParams(nextState);
      const href = params.toString() ? `${pathname}?${params.toString()}` : pathname;

      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [router, pathname]
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
      <div className="page-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {source === "cache" ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-[11px] font-medium text-amber-300/90">Cached</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/15 bg-cyan-500/5 px-2.5 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[11px] font-medium text-cyan-300/80">Live</span>
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-white">Vulnerability Search</h1>
          <span className="hidden text-sm text-white/25 sm:inline">Search and filter CVE records</span>
        </div>
        <Link href={dashboardHref} className="btn-ghost inline-flex px-3 py-1.5 text-sm">
          Open Dashboard
        </Link>
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
      </div>

      {source === "cache" && <CachedDataNotice storedAt={storedAt} />}

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
          <span className="font-mono text-cyan-400/60">{cves.length} shown</span>
        </div>
        <ExportResultsButtons cves={cves} search={state} />
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

      <CVEList cves={cves} loading={isPending} />

      {cves.length > 0 && !error && (
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
