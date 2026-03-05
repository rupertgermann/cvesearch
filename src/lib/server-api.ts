import { CVEDetail, CVESummary } from "./types";
import { SearchState } from "./search";
import { getSearchValidationError, isCveIdQuery } from "./search";

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
  return fetchUpstream<CVESummary[]>(
    `/vulnerability/?per_page=${perPage}&page=${page}&sort_order=desc&date_sort=published`
  );
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

  return fetchUpstream<CVESummary[]>(`/vulnerability/?${searchParams.toString()}`);
}

export async function getCVEByIdServer(id: string): Promise<CVEDetail> {
  return fetchUpstream<CVEDetail>(
    `/vulnerability/${encodeURIComponent(id)}?with_meta=true&with_linked=true&with_comments=true`
  );
}

export async function searchByVendorProductServer(
  vendor: string,
  product: string,
  page: number,
  perPage: number
): Promise<CVESummary[]> {
  return fetchUpstream<CVESummary[]>(
    `/vulnerability/search/${encodeURIComponent(vendor)}/${encodeURIComponent(product)}?page=${page}&per_page=${perPage}`
  );
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
