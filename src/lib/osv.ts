import {
  ParsedDependency,
  OSVVulnerability,
  VulnerabilityMatch,
} from "./github-types";

const OSV_API_BASE = "https://api.osv.dev/v1";
const REQUEST_TIMEOUT_MS = 30_000;
const BATCH_SIZE = 1000;

interface OSVQueryRequest {
  package: { name: string; ecosystem: string };
  version: string;
}

interface OSVBatchResponse {
  results: { vulns?: OSVVulnerability[] }[];
}

const fetchOSVPost = async <T>(path: string, body: unknown): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OSV_API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "CVESearch-WebApp/1.0",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`OSV API error: ${response.status} ${response.statusText} – ${errorBody}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OSV API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchOSVGet = async <T>(path: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OSV_API_BASE}${path}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CVESearch-WebApp/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OSV API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OSV API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchVulnerabilityById = async (
  vulnId: string
): Promise<OSVVulnerability | null> => {
  try {
    return await fetchOSVGet<OSVVulnerability>(`/vulns/${encodeURIComponent(vulnId)}`);
  } catch {
    return null;
  }
};

const ENRICHMENT_CONCURRENCY = 5;

const enrichMatches = async (
  matches: VulnerabilityMatch[]
): Promise<VulnerabilityMatch[]> => {
  const uniqueVulnIds = [...new Set(matches.map((m) => m.vulnerability.id))];

  const detailMap = new Map<string, OSVVulnerability>();

  for (let offset = 0; offset < uniqueVulnIds.length; offset += ENRICHMENT_CONCURRENCY) {
    const chunk = uniqueVulnIds.slice(offset, offset + ENRICHMENT_CONCURRENCY);
    const results = await Promise.all(chunk.map(fetchVulnerabilityById));

    results.forEach((detail, index) => {
      if (detail) {
        detailMap.set(chunk[index], detail);
      }
    });
  }

  return matches.map((match) => {
    const detail = detailMap.get(match.vulnerability.id);
    if (!detail) return match;

    return {
      ...match,
      vulnerability: detail,
      cveIds: extractCveIds(detail),
    };
  });
};

export const queryOSVBatch = async (
  dependencies: ParsedDependency[]
): Promise<VulnerabilityMatch[]> => {
  if (dependencies.length === 0) return [];

  const matches: VulnerabilityMatch[] = [];
  const seenVulnKeys = new Set<string>();

  for (let offset = 0; offset < dependencies.length; offset += BATCH_SIZE) {
    const batch = dependencies.slice(offset, offset + BATCH_SIZE);

    const queries: OSVQueryRequest[] = batch.map((dep) => ({
      package: { name: dep.name, ecosystem: dep.ecosystem },
      version: dep.version,
    }));

    const response = await fetchOSVPost<OSVBatchResponse>("/querybatch", { queries });

    response.results.forEach((result, index) => {
      if (!result.vulns || result.vulns.length === 0) return;

      const dependency = batch[index];

      result.vulns.forEach((vuln) => {
        const dedupeKey = `${vuln.id}:${dependency.name}`;
        if (seenVulnKeys.has(dedupeKey)) return;
        seenVulnKeys.add(dedupeKey);

        matches.push({
          vulnerability: vuln,
          matchedDependency: dependency,
          cveIds: extractCveIds(vuln),
        });
      });
    });
  }

  return enrichMatches(matches);
};

export const queryOSVSingle = async (
  ecosystem: string,
  packageName: string,
  version: string
): Promise<OSVVulnerability[]> => {
  const response = await fetchOSVPost<{ vulns?: OSVVulnerability[] }>("/query", {
    package: { name: packageName, ecosystem },
    version,
  });

  return response.vulns ?? [];
};

export const extractCveIds = (vuln: OSVVulnerability): string[] => {
  const cvePattern = /^CVE-\d{4}-\d{4,}$/;

  if (cvePattern.test(vuln.id)) {
    return [vuln.id];
  }

  return (vuln.aliases ?? []).filter((alias) => cvePattern.test(alias));
};

export const getHighestSeverity = (vuln: OSVVulnerability): string | null => {
  if (!vuln.severity || vuln.severity.length === 0) return null;

  const cvssEntry = vuln.severity.find((s) => s.type === "CVSS_V3");
  if (!cvssEntry) return vuln.severity[0].score;

  return cvssEntry.score;
};

const CVSS_V3_WEIGHTS: Record<string, Record<string, number>> = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  PR_U: { N: 0.85, L: 0.62, H: 0.27 },
  PR_C: { N: 0.85, L: 0.68, H: 0.5 },
  UI: { N: 0.85, R: 0.62 },
  C: { H: 0.56, L: 0.22, N: 0 },
  I: { H: 0.56, L: 0.22, N: 0 },
  A: { H: 0.56, L: 0.22, N: 0 },
};

export const parseCvssScore = (vectorString: string): number | null => {
  const metricsMatch = vectorString.match(
    /AV:([NALP])\/AC:([LH])\/PR:([NLH])\/UI:([NR])\/S:([UC])\/C:([NLH])\/I:([NLH])\/A:([NLH])/
  );
  if (!metricsMatch) return null;

  const [, av, ac, pr, ui, s, c, i, a] = metricsMatch;
  const scopeChanged = s === "C";

  const attackVector = CVSS_V3_WEIGHTS.AV[av] ?? 0;
  const attackComplexity = CVSS_V3_WEIGHTS.AC[ac] ?? 0;
  const privilegesRequired = scopeChanged
    ? (CVSS_V3_WEIGHTS.PR_C[pr] ?? 0)
    : (CVSS_V3_WEIGHTS.PR_U[pr] ?? 0);
  const userInteraction = CVSS_V3_WEIGHTS.UI[ui] ?? 0;
  const confidentiality = CVSS_V3_WEIGHTS.C[c] ?? 0;
  const integrity = CVSS_V3_WEIGHTS.I[i] ?? 0;
  const availability = CVSS_V3_WEIGHTS.A[a] ?? 0;

  const exploitability = 8.22 * attackVector * attackComplexity * privilegesRequired * userInteraction;
  const iss = 1 - (1 - confidentiality) * (1 - integrity) * (1 - availability);

  if (iss <= 0) return 0;

  const impact = scopeChanged
    ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
    : 6.42 * iss;

  const baseScore = scopeChanged
    ? Math.min(1.08 * (impact + exploitability), 10)
    : Math.min(impact + exploitability, 10);

  return Math.ceil(baseScore * 10) / 10;
};

const scoreToSeverityLabel = (score: number): string => {
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  if (score > 0) return "LOW";
  return "NONE";
};

export const getSeverityLabel = (vuln: OSVVulnerability): string => {
  const cvssString = getHighestSeverity(vuln);
  if (!cvssString) return "UNKNOWN";

  const calculatedScore = parseCvssScore(cvssString);
  if (calculatedScore !== null) return scoreToSeverityLabel(calculatedScore);

  return "UNKNOWN";
};
