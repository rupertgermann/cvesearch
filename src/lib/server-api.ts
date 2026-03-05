import { CVEDetail, CVESummary, HomeDashboardData } from "./types";
import { SearchState } from "./search";
import {
  applySearchResultPreferences,
  buildPresetHref,
  getSearchValidationError,
  hasActiveFilters,
  isCveIdQuery,
  wasPublishedWithinDays,
} from "./search";
import { parseCVEDetail, parseCVESummaryList } from "./validation";

const API_BASE = "https://vulnerability.circl.lu/api";
type NextFetchOptions = RequestInit & { next?: { revalidate: number } };

async function fetchUpstream<T>(path: string): Promise<T> {
  const options: NextFetchOptions = {
    headers: {
      Accept: "application/json",
      "User-Agent": "CVESearch-WebApp/1.0",
    },
    next: { revalidate: 60 },
  };
  const res = await fetch(`${API_BASE}${path}`, options);

  if (!res.ok) {
    throw new Error(`Upstream API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function getLatestCVEsServer(page: number, perPage: number): Promise<CVESummary[]> {
  const data = await fetchUpstream<unknown>(
    `/vulnerability/?per_page=${perPage}&page=${page}&sort_order=desc&date_sort=published`
  );
  return parseCVESummaryList(data);
}

export async function searchCVEsServer(params: {
  product?: string;
  cwe?: string;
  since?: string;
  page: number;
  perPage: number;
}): Promise<CVESummary[]> {
  const searchParams = new URLSearchParams();

  if (params.product) searchParams.set("product", params.product);
  if (params.cwe) searchParams.set("cwe", params.cwe);
  if (params.since) searchParams.set("since", params.since);
  searchParams.set("page", String(params.page));
  searchParams.set("per_page", String(params.perPage));
  searchParams.set("sort_order", "desc");
  searchParams.set("date_sort", "published");

  const data = await fetchUpstream<unknown>(`/vulnerability/?${searchParams.toString()}`);
  return parseCVESummaryList(data);
}

export async function getCVEByIdServer(id: string): Promise<CVEDetail> {
  const data = await fetchUpstream<unknown>(
    `/vulnerability/${encodeURIComponent(id)}?with_meta=true&with_linked=true&with_comments=true`
  );
  return parseCVEDetail(data);
}

export async function searchByVendorProductServer(
  vendor: string,
  product: string,
  page: number,
  perPage: number
): Promise<CVESummary[]> {
  const data = await fetchUpstream<unknown>(
    `/vulnerability/search/${encodeURIComponent(vendor)}/${encodeURIComponent(product)}?page=${page}&per_page=${perPage}`
  );
  return parseCVESummaryList(data);
}

export async function getHomePageResults(state: SearchState): Promise<{
  cves: CVESummary[];
  error: string | null;
  totalHint: string;
}> {
  const validationError = getSearchValidationError(state);

  if (validationError) {
    return {
      cves: [],
      error: validationError,
      totalHint: "",
    };
  }

  try {
    if (isCveIdQuery(state.query)) {
      const detail = await getCVEByIdServer(state.query.toUpperCase());
      return {
        cves: detail ? [detail as unknown as CVESummary] : [],
        error: null,
        totalHint: "1 result",
      };
    }

    if (state.vendor && state.product) {
      const results = await searchByVendorProductServer(state.vendor, state.product, state.page, state.perPage);
      return {
        cves: results,
        error: null,
        totalHint: `Page ${state.page}`,
      };
    }

    const hasSearch = Boolean(state.query || state.product || state.cwe || state.since);
    const results = hasSearch
      ? await searchCVEsServer({
          product: state.product || state.query,
          cwe: state.cwe,
          since: state.since,
          page: state.page,
          perPage: state.perPage,
        })
      : await getLatestCVEsServer(state.page, state.perPage);

    return {
      cves: results,
      error: null,
      totalHint: `Page ${state.page}`,
    };
  } catch (error) {
    return {
      cves: [],
      error: error instanceof Error ? error.message : "Failed to fetch CVEs",
      totalHint: "",
    };
  }
}

export async function getHomeDashboardData(state: SearchState): Promise<HomeDashboardData | null> {
  if (state.query || hasActiveFilters(state)) {
    return null;
  }

  try {
    const latest = await getLatestCVEsServer(1, 60);
    const latestCritical = applySearchResultPreferences(latest, {
      ...state,
      minSeverity: "CRITICAL",
      sort: "published_desc",
    }).slice(0, 5);
    const highestCvss = applySearchResultPreferences(latest, {
      ...state,
      minSeverity: "HIGH",
      sort: "cvss_desc",
    }).slice(0, 5);
    const recentHighImpact = applySearchResultPreferences(
      latest.filter((cve) => wasPublishedWithinDays(cve, 7)),
      {
        ...state,
        minSeverity: "HIGH",
        sort: "published_desc",
      }
    ).slice(0, 5);

    return {
      summary: {
        sampledCount: latest.length,
        criticalCount: applySearchResultPreferences(latest, {
          ...state,
          minSeverity: "CRITICAL",
          sort: "published_desc",
        }).length,
        highOrAboveCount: applySearchResultPreferences(latest, {
          ...state,
          minSeverity: "HIGH",
          sort: "published_desc",
        }).length,
        publishedThisWeekCount: latest.filter((cve) => wasPublishedWithinDays(cve, 7)).length,
      },
      presets: [
        {
          title: "Latest Critical",
          description: "Jump straight into recently published critical issues.",
          href: buildPresetHref({ minSeverity: "CRITICAL" }),
          accentClassName: "border-red-500/25 bg-red-500/10 text-red-200",
        },
        {
          title: "Highest CVSS",
          description: "Sort the feed by highest severity score first.",
          href: buildPresetHref({ minSeverity: "HIGH", sort: "cvss_desc" }),
          accentClassName: "border-orange-500/25 bg-orange-500/10 text-orange-200",
        },
        {
          title: "Published This Week",
          description: "Focus on fresh records from the last 7 days.",
          href: buildPresetHref({ since: isoDateDaysAgo(7) }),
          accentClassName: "border-cyan-500/25 bg-cyan-500/10 text-cyan-200",
        },
      ],
      latestCritical,
      highestCvss,
      recentHighImpact,
    };
  } catch {
    return null;
  }
}

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
