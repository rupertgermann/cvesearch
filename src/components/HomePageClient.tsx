"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CVESummary } from "@/lib/types";
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

interface HomePageClientProps {
  initialState: SearchState;
  cves: CVESummary[];
  error: string | null;
  totalHint: string;
}

export default function HomePageClient({
  initialState,
  cves,
  error,
  totalHint,
}: HomePageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const state = useMemo(() => normalizeSearchState(initialState), [initialState]);

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

  const handleFilters = useCallback(
    (filters: { vendor: string; product: string; cwe: string; since: string }) => {
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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Vulnerability Search
        </h1>
        <p className="mt-2 text-base text-gray-500">
          Search and explore CVE vulnerability records from the global database
        </p>
      </div>

      <div className="mb-6 space-y-4">
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
          }}
        />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span>{getSearchSummary(state)}</span>
          {totalHint && <span className="text-gray-600">&middot; {totalHint}</span>}
        </div>
        <div className="text-sm text-gray-600">{cves.length} shown</div>
      </div>

      {hasActiveFilters(state) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {state.vendor && (
            <FilterChip label={`Vendor: ${state.vendor}`} />
          )}
          {state.product && (
            <FilterChip label={`Product: ${state.product}`} />
          )}
          {state.cwe && (
            <FilterChip label={`CWE: ${state.cwe}`} />
          )}
          {state.since && (
            <FilterChip label={`Since: ${state.since}`} />
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span className="font-medium">Error:</span> {error}
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
    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-gray-300">
      {label}
    </span>
  );
}
