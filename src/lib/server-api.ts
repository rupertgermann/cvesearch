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

async function fetchUpstream<T>(path: string): Promise<T> {
  return fetchVulnerabilityAPIUpstream<T>(path);
}

export async function getLatestCVEsServer(page: number, perPage: number): Promise<CVESummary[]> {
  const data = await fetchUpstream<unknown>(buildLatestCVEsPath(page, perPage));
  return enrichCVEsWithKev(parseCVESummaryList(data));
}

export async function searchCVEsServer(params: {
  product?: string;
  cwe?: string;
  since?: string;
  page: number;
  perPage: number;
}): Promise<CVESummary[]> {
  const data = await fetchUpstream<unknown>(buildSearchCVEsPath(params));
  return enrichCVEsWithKev(parseCVESummaryList(data));
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
  const data = await fetchUpstream<unknown>(buildVendorProductSearchPath(vendor, product, page, perPage));
  return enrichCVEsWithKev(parseCVESummaryList(data));
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
    const HOME_RESULTS_WINDOW = 200;
    const windowed = state.sort !== DEFAULT_SORT || state.minSeverity !== DEFAULT_MIN_SEVERITY;
    const page = windowed ? 1 : state.page;
    const perPage = windowed ? HOME_RESULTS_WINDOW : state.perPage;
    const paginate = (results: CVESummary[]) =>
      windowed
        ? {
            cves: applySearchResultPreferences(results, state).slice((state.page - 1) * state.perPage, state.page * state.perPage),
            error: null,
            totalHint: `Page ${state.page} · sorted/filtered within the ${HOME_RESULTS_WINDOW} newest matches`,
          }
        : null;

    if (state.vendor && state.product) {
      const results = await searchByVendorProductServer(state.vendor, state.product, page, perPage);
      return paginate(results) ?? {
        cves: results,
        error: null,
        totalHint: `Page ${state.page}`,
      };
    }

    const hasSearch = Boolean(state.query || state.product || state.cwe || state.since);
    let results = hasSearch
      ? await searchCVEsServer({
          product: state.product || state.query,
          cwe: state.cwe,
          since: state.since,
          page,
          perPage,
        })
      : await getLatestCVEsServer(page, perPage);

    let totalHint = `Page ${state.page}`;

    if (state.query && !state.product && results.length === 0) {
      const fallbackSample = await getLatestCVEsServer(1, 200);
      results = fallbackSample.filter((cve) => matchesSearchState(cve, state)).slice(0, perPage);
      if (results.length > 0) {
        totalHint = "Fallback match from recent sample";
      }
    }

    return paginate(results) ?? {
      cves: results,
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

async function enrichCVEsWithKev<T extends CVESummary>(cves: T[]): Promise<T[]> {
  if (cves.length === 0) {
    return cves;
  }

  const kevMap = await getKnownExploitedMap();
  return cves.map((cve) => {
    const kev = kevMap.get(extractCVEId(cve).toUpperCase());
    return kev ? ({ ...cve, kev } satisfies T) : cve;
  });
}

async function getKnownExploitedVulnerabilityById(cveId: string): Promise<KnownExploitedVulnerability | undefined> {
  const kevMap = await getKnownExploitedMap();
  return kevMap.get(cveId.toUpperCase());
}

async function getKnownExploitedMap(): Promise<Map<string, KnownExploitedVulnerability>> {
  try {
    const options: NextFetchOptions = {
      headers: {
        Accept: "application/json",
        "User-Agent": "CVESearch-WebApp/1.0",
      },
      next: { revalidate: 3600 },
    };
    const res = await fetch(KEV_CATALOG_URL, options);

    if (!res.ok) {
      throw new Error(`KEV catalog error: ${res.status}`);
    }

    const data = parseKnownExploitedCatalog(await res.json());
    return new Map(data.map((item) => [item.cveID.toUpperCase(), item]));
  } catch {
    return new Map();
  }
}
