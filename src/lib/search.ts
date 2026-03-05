import { SearchFilters } from "./types";

export const DEFAULT_PAGE = 1;
export const PER_PAGE = 20;

export type SearchState = SearchFilters;

type SearchParamValue = string | string[] | undefined;

export function normalizeSearchValue(value: SearchParamValue): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parsePositiveInt(value: SearchParamValue, fallback = DEFAULT_PAGE): number {
  const parsed = Number.parseInt(normalizeSearchValue(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeSearchState(input: Partial<SearchState>): SearchState {
  return {
    query: input.query?.trim() || "",
    vendor: input.vendor?.trim() || "",
    product: input.product?.trim() || "",
    cwe: input.cwe?.trim() || "",
    since: input.since?.trim() || "",
    page: input.page && input.page > 0 ? input.page : DEFAULT_PAGE,
    perPage: input.perPage && input.perPage > 0 ? input.perPage : PER_PAGE,
  };
}

export function parseSearchState(searchParams: Record<string, SearchParamValue>): SearchState {
  return normalizeSearchState({
    query: normalizeSearchValue(searchParams.query),
    vendor: normalizeSearchValue(searchParams.vendor),
    product: normalizeSearchValue(searchParams.product),
    cwe: normalizeSearchValue(searchParams.cwe),
    since: normalizeSearchValue(searchParams.since),
    page: parsePositiveInt(searchParams.page, DEFAULT_PAGE),
    perPage: PER_PAGE,
  });
}

export function buildSearchParams(state: Partial<SearchState>): URLSearchParams {
  const normalized = normalizeSearchState(state);
  const params = new URLSearchParams();

  if (normalized.query) params.set("query", normalized.query);
  if (normalized.vendor) params.set("vendor", normalized.vendor);
  if (normalized.product) params.set("product", normalized.product);
  if (normalized.cwe) params.set("cwe", normalized.cwe);
  if (normalized.since) params.set("since", normalized.since);
  if (normalized.page > DEFAULT_PAGE) params.set("page", String(normalized.page));

  return params;
}

export function isCveIdQuery(query: string): boolean {
  return /^CVE-\d{4}-\d+$/i.test(query.trim());
}

export function hasActiveFilters(state: SearchState): boolean {
  return Boolean(state.vendor || state.product || state.cwe || state.since);
}

export function getSearchValidationError(state: SearchState): string | null {
  if (state.vendor && !state.product) {
    return "Vendor filtering currently requires a product. Add a product or clear the vendor filter.";
  }

  return null;
}

export function getSearchSummary(state: SearchState): string {
  if (state.query) {
    return `Results for "${state.query}"`;
  }

  if (hasActiveFilters(state)) {
    return "Filtered vulnerabilities";
  }

  return "Latest vulnerabilities";
}
