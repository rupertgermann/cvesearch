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

const fetchOSV = async <T>(path: string, body: unknown): Promise<T> => {
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

    const response = await fetchOSV<OSVBatchResponse>("/querybatch", { queries });

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

  return matches;
};

export const queryOSVSingle = async (
  ecosystem: string,
  packageName: string,
  version: string
): Promise<OSVVulnerability[]> => {
  const response = await fetchOSV<{ vulns?: OSVVulnerability[] }>("/query", {
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

export const parseCvssScore = (vectorString: string): number | null => {
  const match = vectorString.match(/CVSS:\d+\.\d+\/.*$/);
  if (!match) return null;

  const metricsMatch = vectorString.match(
    /AV:([NALP])\/AC:([LH])\/PR:([NLH])\/UI:([NR])\/S:([UC])\/C:([NLH])\/I:([NLH])\/A:([NLH])/
  );
  if (!metricsMatch) return null;

  return null;
};

export const getSeverityLabel = (vuln: OSVVulnerability): string => {
  const cvssString = getHighestSeverity(vuln);
  if (!cvssString) return "UNKNOWN";

  const scoreMatch = cvssString.match(/(\d+\.?\d*)/);
  if (!scoreMatch) return "UNKNOWN";

  const score = parseFloat(scoreMatch[1]);
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  if (score > 0) return "LOW";
  return "NONE";
};
