import { SeverityLevel, CVEDetail, CVESummary, MetricEntry } from "./types";

export function getSeverityFromScore(score: number | undefined | null): SeverityLevel {
  if (score === undefined || score === null) return "UNKNOWN";
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  if (score > 0) return "LOW";
  return "NONE";
}

export function severityColor(severity: SeverityLevel): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "HIGH":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "MEDIUM":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "LOW":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "NONE":
      return "bg-gray-500/15 text-gray-400 border-gray-500/30";
    default:
      return "bg-gray-500/15 text-gray-500 border-gray-500/30";
  }
}

export function severityDotColor(severity: SeverityLevel): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-500";
    case "HIGH":
      return "bg-orange-500";
    case "MEDIUM":
      return "bg-yellow-500";
    case "LOW":
      return "bg-blue-500";
    case "NONE":
      return "bg-gray-500";
    default:
      return "bg-gray-600";
  }
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function extractDescription(cve: CVEDetail | CVESummary): string {
  if ("containers" in cve && cve.containers?.cna?.descriptions?.length) {
    const en = cve.containers.cna.descriptions.find((d) => d.lang === "en" || d.lang === "en-US");
    if (en) return en.value;
    return cve.containers.cna.descriptions[0].value;
  }
  if (cve.summary) return cve.summary;
  if (cve.description) return cve.description;
  return "No description available.";
}

export function extractCVSSScore(cve: CVEDetail): { score: number; version: string; severity: SeverityLevel } | null {
  if (cve.containers?.cna?.metrics?.length) {
    for (const metric of cve.containers.cna.metrics) {
      const m = metric as MetricEntry;
      if (m.cvssV3_1?.baseScore !== undefined) {
        return {
          score: m.cvssV3_1.baseScore,
          version: "3.1",
          severity: (m.cvssV3_1.baseSeverity?.toUpperCase() as SeverityLevel) || getSeverityFromScore(m.cvssV3_1.baseScore),
        };
      }
      if (m.cvssV3_0?.baseScore !== undefined) {
        return {
          score: m.cvssV3_0.baseScore,
          version: "3.0",
          severity: (m.cvssV3_0.baseSeverity?.toUpperCase() as SeverityLevel) || getSeverityFromScore(m.cvssV3_0.baseScore),
        };
      }
      if (m.cvssV2_0?.baseScore !== undefined) {
        return {
          score: m.cvssV2_0.baseScore,
          version: "2.0",
          severity: getSeverityFromScore(m.cvssV2_0.baseScore),
        };
      }
    }
  }
  if (cve.cvss3 !== undefined) {
    return { score: cve.cvss3, version: "3.x", severity: getSeverityFromScore(cve.cvss3) };
  }
  if (cve.cvss !== undefined) {
    return { score: cve.cvss, version: "2.0", severity: getSeverityFromScore(cve.cvss) };
  }
  return null;
}

export function extractPublishedDate(cve: CVEDetail | CVESummary): string | undefined {
  if ("cveMetadata" in cve && cve.cveMetadata?.datePublished) {
    return cve.cveMetadata.datePublished;
  }
  return cve.published;
}

export function extractModifiedDate(cve: CVEDetail | CVESummary): string | undefined {
  if ("cveMetadata" in cve && cve.cveMetadata?.dateUpdated) {
    return cve.cveMetadata.dateUpdated;
  }
  return cve.modified;
}

export function extractCVEId(cve: CVEDetail | CVESummary): string {
  if ("cveMetadata" in cve && cve.cveMetadata?.cveId) {
    return cve.cveMetadata.cveId;
  }
  const alias = cve.aliases?.find((item) => /^CVE-\d{4}-\d+$/i.test(item));
  if (alias) {
    return alias;
  }
  return cve.id;
}

export function extractSourceId(cve: CVEDetail | CVESummary): string | undefined {
  return cve.sourceId && cve.sourceId !== extractCVEId(cve) ? cve.sourceId : undefined;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}
