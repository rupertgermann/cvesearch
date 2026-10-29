import { CVEDetail, CVESummary, CWEData, EPSSData, HomeDashboardData, KnownExploitedVulnerability } from "./types";
import { SearchState } from "./search";
import {
  applySearchResultPreferences,
  buildPresetHref,
  DEFAULT_MIN_SEVERITY,
  DEFAULT_SORT,
  getSearchValidationError,
  getExploitReferenceCount,
  hasActiveFilters,
  hasExploitSignals,
  isDirectVulnerabilityIdQuery,
  matchesSearchState,
  wasPublishedWithinDays,
} from "./search";
import { searchStoredCVESummaries } from "./cve-store";
import { extractCVEId } from "./utils";
import { parseCVEDetail, parseCVESummaryList, parseCWEData, parseEPSSResponse, parseKnownExploitedCatalog } from "./validation";
import {
  buildCVEDetailPath,
  buildCWEPath,
  buildEPSSPath,
  buildLatestCVEsPath,
  buildSearchCVEsPath,
  buildVendorProductSearchPath,
  fetchVulnerabilityAPIUpstream,
  type NextFetchOptions,
} from "./vulnerability-api";

const KEV_CATALOG_URL = "https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json";
const KEV_CACHE_TTL_MS = 60 * 60 * 1000;
const EPSS_API_URL = "https://api.first.org/data/v1/epss";
const EPSS_BATCH_SIZE = 100;
const HOME_RESULTS_WINDOW = 200;
// CIRCL silently falls back to 30 rows when per_page is above 100.
const UPSTREAM_MAX_PER_PAGE = 100;
const HOURLY_JSON_FETCH: NextFetchOptions = {
  headers: {
    Accept: "application/json",
    "User-Agent": "CVESearch-WebApp/1.0",
  },
  next: { revalidate: 3600 },
};

async function fetchUpstream<T>(path: string): Promise<T> {
  return fetchVulnerabilityAPIUpstream<T>(path);
}

// Fetches rows [(page-1)*perPage, page*perPage) using upstream pages of at most UPSTREAM_MAX_PER_PAGE.
async function fetchCVEList(buildPath: (page: number, perPage: number) => string, page: number, perPage: number): Promise<CVESummary[]> {
  if (perPage <= UPSTREAM_MAX_PER_PAGE) {
    return parseCVESummaryList(await fetchUpstream<unknown>(buildPath(page, perPage)));
  }

  const offset = (page - 1) * perPage;
  const firstPage = Math.floor(offset / UPSTREAM_MAX_PER_PAGE) + 1;
  const lastPage = Math.ceil((offset + perPage) / UPSTREAM_MAX_PER_PAGE);
  const pages = await Promise.all(
    Array.from({ length: lastPage - firstPage + 1 }, (_, index) =>
      fetchUpstream<unknown>(buildPath(firstPage + index, UPSTREAM_MAX_PER_PAGE)).then(parseCVESummaryList)
    )
  );
  const start = offset - (firstPage - 1) * UPSTREAM_MAX_PER_PAGE;
  return pages.flat().slice(start, start + perPage);
}

export async function getLatestCVEsServer(page: number, perPage: number): Promise<CVESummary[]> {
  return enrichCVEs(await fetchCVEList(buildLatestCVEsPath, page, perPage));
}

export async function searchCVEsServer(params: {
  product?: string;
  cwe?: string;
  since?: string;
  page: number;
  perPage: number;
}): Promise<CVESummary[]> {
  return enrichCVEs(
    await fetchCVEList((page, perPage) => buildSearchCVEsPath({ ...params, page, perPage }), params.page, params.perPage)
  );
}

export async function getCVEByIdServer(id: string): Promise<CVEDetail> {
  const data = await fetchUpstream<unknown>(buildCVEDetailPath(id));
  const detail = parseCVEDetail(data);
  const kev = await getKnownExploitedVulnerabilityById(extractCVEId(detail));
  return kev ? { ...detail, kev } : detail;
}

export async function getEPSSServer(cveId: string): Promise<EPSSData | null> {
  try {
    const data = await fetchUpstream<unknown>(buildEPSSPath(cveId));
    return parseEPSSResponse(data);
  } catch {
    return null;
  }
}

export async function getCWEServer(cweId: string): Promise<CWEData | null> {
  try {
    const data = await fetchUpstream<unknown>(buildCWEPath(cweId));
    return parseCWEData(data);
  } catch {
    return null;
  }
}

export async function searchByVendorProductServer(
  vendor: string,
  product: string,
  page: number,
  perPage: number
): Promise<CVESummary[]> {
  return enrichCVEs(
    await fetchCVEList((upstreamPage, upstreamPerPage) => buildVendorProductSearchPath(vendor, product, upstreamPage, upstreamPerPage), page, perPage)
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
    if (isDirectVulnerabilityIdQuery(state.query)) {
      const detail = await getCVEByIdServer(state.query.toUpperCase());
      return {
        cves: detail ? [detail as unknown as CVESummary] : [],
        error: null,
        totalHint: "1 result",
      };
    }

    // Upstream only sorts by published date, so non-default sort/severity runs over one fixed window.
    const windowed = state.sort !== DEFAULT_SORT || state.minSeverity !== DEFAULT_MIN_SEVERITY;
    const page = windowed ? 1 : state.page;
    const perPage = windowed ? HOME_RESULTS_WINDOW : state.perPage;
    const hasSearch = Boolean(state.query || state.product || state.cwe || state.since);

    let results = state.vendor && state.product
      ? await searchByVendorProductServer(state.vendor, state.product, page, perPage)
      : hasSearch
        ? await searchCVEsServer({
            product: state.product || state.query,
            cwe: state.cwe,
            since: state.since,
            page,
            perPage,
          })
        : await getLatestCVEsServer(page, perPage);
    let totalHint = `Page ${state.page}`;
    let pageLocally = windowed;

    if (state.query && !state.product && results.length === 0) {
      const recent = await fetchCVEList(buildLatestCVEsPath, 1, HOME_RESULTS_WINDOW);
      // Recent sample first so its fresher copy wins over the cached one.
      const seenIds = new Set<string>();
      results = await enrichCVEs(
        [...recent, ...searchStoredCVESummaries(state.query, HOME_RESULTS_WINDOW)].filter((cve) => {
          const id = extractCVEId(cve);
          if (seenIds.has(id) || !matchesSearchState(cve, state)) return false;
          seenIds.add(id);
          return true;
        })
      );
      pageLocally = true;
      if (results.length > 0) {
        totalHint = `Keyword matches from the ${HOME_RESULTS_WINDOW} most recent and locally cached CVEs only (not a full-text search)`;
      }
    }

    if (windowed) {
      totalHint += ` · sorted/filtered within the ${HOME_RESULTS_WINDOW} newest matches`;
    }

    return {
      cves: pageLocally
        ? applySearchResultPreferences(results, state).slice((state.page - 1) * state.perPage, state.page * state.perPage)
        : results,
      error: null,
      totalHint,
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
    const analystQueue = applySearchResultPreferences(
      latest.filter((cve) => Boolean(cve.kev) || (cve.epss ?? 0) >= 0.2 || wasPublishedWithinDays(cve, 14)),
      {
        ...state,
        minSeverity: "HIGH",
        sort: "risk_desc",
      }
    ).slice(0, 4);
    const maintainerPatchRadar = applySearchResultPreferences(
      latest.filter((cve) => (cve.vulnerable_product?.length ?? 0) > 0),
      {
        ...state,
        minSeverity: "HIGH",
        sort: "published_desc",
      }
    ).slice(0, 4);
    const incidentResponse = applySearchResultPreferences(
      latest.filter((cve) => Boolean(cve.kev) || hasExploitSignals(cve)),
      {
        ...state,
        minSeverity: "HIGH",
        sort: "risk_desc",
      }
    ).slice(0, 4);

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
        knownExploitedCount: latest.filter((cve) => Boolean(cve.kev)).length,
      },
      workflowViews: [
        {
          id: "analyst",
          title: "Analyst Queue",
          description: "Start with the vulnerabilities most likely to need fresh triage or coordination this morning.",
          accentClassName: "border-cyan-500/25 bg-cyan-500/10 text-cyan-100",
          href: buildPresetHref({ minSeverity: "HIGH", sort: "risk_desc" }),
          metrics: [
            { label: "Needs attention", value: String(analystQueue.length) },
            { label: "KEV in queue", value: String(analystQueue.filter((cve) => Boolean(cve.kev)).length) },
            { label: "Fresh this week", value: String(analystQueue.filter((cve) => wasPublishedWithinDays(cve, 7)).length) },
          ],
          cves: analystQueue,
        },
        {
          id: "maintainer",
          title: "Maintainer Patch Radar",
          description: "Focus on recently published package issues with product exposure and enough detail to plan remediation work.",
          accentClassName: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100",
          href: buildPresetHref({ minSeverity: "HIGH", sort: "published_desc" }),
          metrics: [
            { label: "Patch candidates", value: String(maintainerPatchRadar.length) },
            { label: "Product mentions", value: String(maintainerPatchRadar.reduce((sum, cve) => sum + Math.min(cve.vulnerable_product?.length ?? 0, 6), 0)) },
            { label: "Critical now", value: String(maintainerPatchRadar.filter((cve) => (cve.cvss3 ?? cve.cvss ?? 0) >= 9).length) },
          ],
          cves: maintainerPatchRadar,
        },
        {
          id: "incident_response",
          title: "Incident Response Signals",
          description: "Pull the vulnerabilities with the strongest exploitation evidence into a faster response loop.",
          accentClassName: "border-red-500/25 bg-red-500/10 text-red-100",
          href: buildPresetHref({ minSeverity: "HIGH", sort: "risk_desc" }),
          metrics: [
            { label: "Exploit-linked", value: String(incidentResponse.filter((cve) => hasExploitSignals(cve)).length) },
            { label: "Known exploited", value: String(incidentResponse.filter((cve) => Boolean(cve.kev)).length) },
            { label: "Exploit refs", value: String(incidentResponse.reduce((sum, cve) => sum + getExploitReferenceCount(cve), 0)) },
          ],
          cves: incidentResponse,
        },
      ],
    };
  } catch {
    return null;
  }
}

async function enrichCVEs<T extends CVESummary>(cves: T[]): Promise<T[]> {
  if (cves.length === 0) {
    return cves;
  }

  const ids = cves.map((cve) => extractCVEId(cve).toUpperCase());
  const [kevMap, epssMap] = await Promise.all([getKnownExploitedMap(), getEPSSMap(ids)]);
  return cves.map((cve, index) => {
    const kev = kevMap.get(ids[index]);
    const epss = epssMap.get(ids[index]);
    return {
      ...cve,
      ...(kev ? { kev } : {}),
      ...(epss !== undefined ? { epss } : {}),
    } satisfies T;
  });
}

async function getEPSSMap(cveIds: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(cveIds.filter((id) => id.startsWith("CVE-"))));
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += EPSS_BATCH_SIZE) {
    chunks.push(ids.slice(i, i + EPSS_BATCH_SIZE));
  }

  const results = await Promise.all(chunks.map(fetchEPSSBatch));
  return new Map(results.flat());
}

async function fetchEPSSBatch(cveIds: string[]): Promise<Array<[string, number]>> {
  try {
    const res = await fetch(`${EPSS_API_URL}?cve=${encodeURIComponent(cveIds.join(","))}`, HOURLY_JSON_FETCH);

    if (!res.ok) {
      throw new Error(`EPSS API error: ${res.status}`);
    }

    const body = (await res.json()) as { data?: unknown };
    if (!Array.isArray(body.data)) {
      return [];
    }

    return body.data.flatMap((row): Array<[string, number]> => {
      const record = row as { cve?: unknown; epss?: unknown };
      const epss = typeof record.epss === "string" ? Number.parseFloat(record.epss) : Number.NaN;
      return typeof record.cve === "string" && Number.isFinite(epss) ? [[record.cve.toUpperCase(), epss]] : [];
    });
  } catch {
    return [];
  }
}

async function getKnownExploitedVulnerabilityById(cveId: string): Promise<KnownExploitedVulnerability | undefined> {
  const kevMap = await getKnownExploitedMap();
  return kevMap.get(cveId.toUpperCase());
}

// The KEV catalog is over Next's 2 MB fetch-cache limit, so it is cached in memory instead.
let kevCache: { map: Map<string, KnownExploitedVulnerability>; expiresAt: number } | null = null;

async function getKnownExploitedMap(): Promise<Map<string, KnownExploitedVulnerability>> {
  if (kevCache && kevCache.expiresAt > Date.now()) {
    return kevCache.map;
  }

  try {
    const res = await fetch(KEV_CATALOG_URL, { headers: HOURLY_JSON_FETCH.headers, cache: "no-store" });

    if (!res.ok) {
      throw new Error(`KEV catalog error: ${res.status}`);
    }

    const data = parseKnownExploitedCatalog(await res.json());
    const map = new Map(data.map((item) => [item.cveID.toUpperCase(), item]));
    kevCache = { map, expiresAt: Date.now() + KEV_CACHE_TTL_MS };
    return map;
  } catch {
    return kevCache?.map ?? new Map();
  }
}
