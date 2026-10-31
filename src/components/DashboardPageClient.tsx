"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  buildSearchParams,
  getSearchSummary,
  hasActiveFilters,
  SearchState,
} from "@/lib/search";
import { HomeDashboardData } from "@/lib/types";
import DashboardPanel from "@/components/DashboardPanel";
import SavedSearchesPanel from "@/components/SavedSearchesPanel";
import WatchlistPanel from "@/components/WatchlistPanel";

interface DashboardPageClientProps {
  dashboard: HomeDashboardData | null;
  search: SearchState;
}

export default function DashboardPageClient({
  dashboard,
  search,
}: DashboardPageClientProps) {
  const searchHref = useMemo(() => {
    const params = buildSearchParams(search);
    return params.toString() ? `/?${params.toString()}` : "/";
  }, [search]);
  const hasSearchContext = Boolean(search.query || hasActiveFilters(search));

  return (
    <div className="app-shell px-4 py-8 sm:px-6">
      <div className="page-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-medium text-emerald-300/80">Ops</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Vulnerability Dashboard</h1>
          <span className="hidden text-sm text-white/25 sm:inline">Feed, AI summaries, and workflows</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={searchHref} className="btn-primary inline-flex px-3 py-1.5 text-sm">
            Open Search
          </Link>
          <Link href="#saved-searches" className="btn-ghost inline-flex px-3 py-1.5 text-sm">
            Saved Searches
          </Link>
          <Link href="#watchlist" className="btn-ghost inline-flex px-3 py-1.5 text-sm">
            Watchlist
          </Link>
        </div>
      </div>

      {hasSearchContext && (
        <div className="mb-6 rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">
          Dashboard tools are using your current search context:{" "}
          <span className="font-medium">{getSearchSummary(search)}</span>
        </div>
      )}

      {dashboard ? (
        <DashboardPanel dashboard={dashboard} />
      ) : (
        <div className="mb-6 rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-sm text-white/45">
          Dashboard data is temporarily unavailable. Saved searches and the watchlist are still available below.
        </div>
      )}

      <div className="mt-8 space-y-10">
        <SavedSearchesPanel search={search} />
        <WatchlistPanel />
      </div>
    </div>
  );
}
