import { SearchFilters } from "./types";
import { CVESummary, SearchSeverityFilter } from "./types";
import { extractDescription, extractModifiedDate, extractPublishedDate, getSeverityFromScore } from "./utils";

export const DEFAULT_PAGE = 1;
export const PER_PAGE = 20;
export const DEFAULT_MIN_SEVERITY: SearchSeverityFilter = "ANY";
export const DEFAULT_SORT = "published_desc";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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
    minSeverity: normalizeSeverityFilter(input.minSeverity),
    sort: normalizeSortOption(input.sort),
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
    minSeverity: normalizeSearchValue(searchParams.minSeverity) as SearchSeverityFilter,
    sort: normalizeSearchValue(searchParams.sort) as SearchState["sort"],
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
  if (normalized.minSeverity !== DEFAULT_MIN_SEVERITY) params.set("minSeverity", normalized.minSeverity);
  if (normalized.sort !== DEFAULT_SORT) params.set("sort", normalized.sort);
  if (normalized.page > DEFAULT_PAGE) params.set("page", String(normalized.page));

  return params;
}

export function isCveIdQuery(query: string): boolean {
  return /^CVE-\d{4}-\d+$/i.test(query.trim());
}

export function isDirectVulnerabilityIdQuery(query: string): boolean {
  return /^(CVE-\d{4}-\d+|GHSA-[A-Za-z0-9-]+|GCVE-[A-Za-z0-9-]+)$/i.test(query.trim());
}

export function hasActiveFilters(state: SearchState): boolean {
  return Boolean(
    state.vendor ||
      state.product ||
      state.cwe ||
      state.since ||
      state.minSeverity !== DEFAULT_MIN_SEVERITY ||
      state.sort !== DEFAULT_SORT
  );
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

export function applySearchResultPreferences(cves: CVESummary[], state: SearchState): CVESummary[] {
  const filtered = cves.filter((cve) => matchesSeverityFilter(cve, state.minSeverity));

  return filtered.sort((left, right) => compareCVEs(left, right, state.sort));
}

export function buildPresetHref(state: Partial<SearchState>): string {
  const params = buildSearchParams(state);
  return params.toString() ? `/?${params.toString()}` : "/";
}

export function matchesSearchState(cve: CVESummary, state: SearchState): boolean {
  if (!matchesSeverityFilter(cve, state.minSeverity)) return false;
  if (!matchesSinceFilter(cve, state.since)) return false;
  if (!matchesTextFilter(cve, state.query)) return false;
  if (!matchesProductFilter(cve, state.product)) return false;
  if (!matchesVendorFilter(cve, state.vendor, state.product)) return false;
  if (!matchesCweFilter(cve, state.cwe)) return false;

  return true;
}

export function wasPublishedWithinDays(cve: CVESummary, days: number, now = Date.now()): boolean {
  const published = publishedForSort(cve);
  if (!published) return false;

  return now - published <= days * DAY_IN_MS;
}

export function sortByModifiedDesc(cves: CVESummary[]): CVESummary[] {
  return [...cves].sort((left, right) => modifiedForSort(right) - modifiedForSort(left));
}

function matchesSeverityFilter(cve: CVESummary, minSeverity: SearchSeverityFilter): boolean {
  if (minSeverity === "ANY") return true;

  const score = cve.cvss3 ?? cve.cvss;
  const severity = getSeverityFromScore(score);
  const rank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4, NONE: 0, UNKNOWN: 0 };

  return rank[severity] >= rank[minSeverity];
}

function matchesSinceFilter(cve: CVESummary, since: string): boolean {
  if (!since) return true;

  const published = publishedForSort(cve);
  const sinceTs = Date.parse(since);
  if (!published || Number.isNaN(sinceTs)) return false;

  return published >= sinceTs;
}

function matchesTextFilter(cve: CVESummary, query: string): boolean {
  if (!query) return true;

  const haystack = [
    cve.id,
    extractDescription(cve),
    cve.summary,
    cve.description,
    ...(cve.aliases ?? []),
    ...(cve.vulnerable_product ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function matchesProductFilter(cve: CVESummary, product: string): boolean {
  if (!product) return true;

  return (cve.vulnerable_product ?? []).some((item) => item.toLowerCase().includes(product.toLowerCase()));
}

function matchesVendorFilter(cve: CVESummary, vendor: string, product: string): boolean {
  if (!vendor) return true;

  const products = cve.vulnerable_product ?? [];
  const vendorLower = vendor.toLowerCase();
  const productLower = product.toLowerCase();

  return products.some((item) => {
    const lower = item.toLowerCase();
    if (!lower.includes(vendorLower)) return false;
    return product ? lower.includes(productLower) : true;
  });
}

function matchesCweFilter(cve: CVESummary, cwe: string): boolean {
  if (!cwe) return true;
  return (cve.cwe ?? "").toLowerCase() === cwe.toLowerCase();
}

function compareCVEs(left: CVESummary, right: CVESummary, sort: SearchState["sort"]): number {
  if (sort === "cvss_desc") {
    return scoreForSort(right) - scoreForSort(left);
  }

  if (sort === "cvss_asc") {
    return scoreForSort(left) - scoreForSort(right);
  }

  const leftPublished = publishedForSort(left);
  const rightPublished = publishedForSort(right);

  if (sort === "published_asc") {
    return leftPublished - rightPublished;
  }

  return rightPublished - leftPublished;
}

function scoreForSort(cve: CVESummary): number {
  return cve.cvss3 ?? cve.cvss ?? -1;
}

function publishedForSort(cve: CVESummary): number {
  const published = extractPublishedDate(cve);
  if (!published) return 0;

  const parsed = new Date(published).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function modifiedForSort(cve: CVESummary): number {
  const modified = extractModifiedDate(cve);
  if (!modified) return 0;

  const parsed = new Date(modified).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSeverityFilter(value: SearchState["minSeverity"] | undefined): SearchState["minSeverity"] {
  const allowed: SearchSeverityFilter[] = ["ANY", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
  return value && allowed.includes(value) ? value : DEFAULT_MIN_SEVERITY;
}

function normalizeSortOption(value: SearchState["sort"] | undefined): SearchState["sort"] {
  const allowed: SearchState["sort"][] = ["published_desc", "published_asc", "cvss_desc", "cvss_asc"];
  return value && allowed.includes(value) ? value : DEFAULT_SORT;
}
