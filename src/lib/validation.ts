import {
  CVEDetail,
  CVESummary,
  CWEData,
  EPSSData,
  KnownExploitedVulnerability,
  LinkedVulnerability,
  NormalizedAffectedProduct,
  VulnerabilityReference,
} from "./types";
import { parseCvssScore } from "./osv";
import { extractCVSSScore } from "./utils";

export function parseCVESummaryList(value: unknown): CVESummary[] {
  const items = normalizeCVEListPayload(value);

  const parsed = items.flatMap((item) => {
    try {
      return [parseCVESummary(item)];
    } catch {
      return [];
    }
  });

  const deduped = new Map<string, CVESummary>();
  for (const item of parsed) {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item);
    }
  }

  return Array.from(deduped.values());
}

/**
 * Normalize different upstream response shapes into a flat array of CVE-like
 * objects that `parseCVESummary` can handle.
 *
 * Supported shapes:
 *  1. Bare array – returned by `/vulnerability/?...`
 *  2. Wrapped object – returned by `/vulnerability/search/vendor/product`,
 *     shaped like `{ results: { source_name: [[key, obj], ...], ... }, ... }`.
 *     Each source contains an array of `[identifier, cveObject]` tuples.
 */
function normalizeCVEListPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    // Handle the { results: { source: [[key, obj], ...] } } shape
    if (record.results && typeof record.results === "object" && !Array.isArray(record.results)) {
      const sources = record.results as Record<string, unknown>;
      const items: unknown[] = [];

      for (const sourceEntries of Object.values(sources)) {
        if (!Array.isArray(sourceEntries)) continue;

        for (const entry of sourceEntries) {
          // Each entry is a [identifier, cveObject] tuple
          if (Array.isArray(entry) && entry.length >= 2 && entry[1] && typeof entry[1] === "object") {
            items.push(entry[1]);
          } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
            // Also accept plain objects in case the format varies
            items.push(entry);
          }
        }
      }

      if (items.length > 0) {
        return items;
      }
    }
  }

  throw new Error("Unexpected response format: expected a CVE list");
}

export function parseCVEDetail(value: unknown): CVEDetail {
  const record = getRecord(value, "Unexpected response format: expected a CVE detail object");
  const normalizedId = getPreferredIdentifier(record);

  if (!normalizedId) {
    throw new Error("Unexpected response format: CVE detail is missing an id");
  }

  return normalizeSupplementalData(normalizeRecordIdentifiers(record, normalizedId)) as unknown as CVEDetail;
}

export function parseStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Unexpected response format: expected ${label} to be a string list`);
  }

  return value;
}

export function parseEPSSResponse(value: unknown): EPSSData | null {
  const record = getRecord(value, "Unexpected response format: expected an EPSS response object");
  if (!Array.isArray(record.data)) {
    throw new Error("Unexpected response format: EPSS response is missing data");
  }

  if (record.data.length === 0) {
    return null;
  }

  const first = getRecord(record.data[0], "Unexpected response format: expected an EPSS item");
  if (typeof first.cve !== "string" || typeof first.epss !== "string" || typeof first.percentile !== "string") {
    throw new Error("Unexpected response format: EPSS item is missing required fields");
  }

  const epss = Number.parseFloat(first.epss);
  const percentile = Number.parseFloat(first.percentile);

  if (!Number.isFinite(epss) || !Number.isFinite(percentile)) {
    throw new Error("Unexpected response format: EPSS scores must be numeric");
  }

  return {
    cve: first.cve,
    epss,
    percentile,
    date: typeof first.date === "string" ? first.date : undefined,
  };
}

export function parseCWEData(value: unknown): CWEData {
  const record = getRecord(value, "Unexpected response format: expected a CWE object");

  if (typeof record.id !== "string" || record.id.length === 0) {
    throw new Error("Unexpected response format: CWE object is missing an id");
  }

  return record as unknown as CWEData;
}

export function parseKnownExploitedCatalog(value: unknown): KnownExploitedVulnerability[] {
  const record = getRecord(value, "Unexpected response format: expected a KEV catalog object");
  if (!Array.isArray(record.vulnerabilities)) {
    throw new Error("Unexpected response format: KEV catalog is missing vulnerabilities");
  }

  return record.vulnerabilities.flatMap((item) => {
    try {
      return [parseKnownExploitedVulnerability(item)];
    } catch {
      return [];
    }
  });
}

function parseCVESummary(value: unknown): CVESummary {
  const record = getRecord(value, "Unexpected response format: expected a CVE summary object");
  const normalizedId = getPreferredIdentifier(record);

  if (!normalizedId) {
    throw new Error("Unexpected response format: CVE summary is missing an id");
  }

  return normalizeSummaryFields(normalizeSupplementalData(normalizeRecordIdentifiers(record, normalizedId))) as unknown as CVESummary;
}

// Lists mix CVE 5 records and OSV records; fill the flat fields that search, sort and cards read.
function normalizeSummaryFields(record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };

  if (typeof next.cvss3 !== "number" && typeof next.cvss !== "number") {
    const cveScore = extractCVSSScore(next as unknown as CVEDetail);
    const osvVector = Array.isArray(next.severity)
      ? (next.severity as Array<{ type?: unknown; score?: unknown }>).find((entry) => entry?.type === "CVSS_V3")?.score
      : undefined;
    const osvScore = typeof osvVector === "string" ? parseCvssScore(osvVector) : null;

    if (cveScore) {
      next[cveScore.version === "2.0" ? "cvss" : "cvss3"] = cveScore.score;
    } else if (osvScore !== null) {
      next.cvss3 = osvScore;
    }
  }

  if (typeof next.summary !== "string" && typeof next.description !== "string" && typeof next.details === "string") {
    next.description = next.details;
  }
  next.published ??= getNestedString(next, "cveMetadata", "datePublished") ?? undefined;
  next.modified ??= getNestedString(next, "cveMetadata", "dateUpdated") ?? undefined;
  return next;
}

function parseKnownExploitedVulnerability(value: unknown): KnownExploitedVulnerability {
  const record = getRecord(value, "Unexpected response format: expected a KEV vulnerability object");

  if (
    typeof record.cveID !== "string" ||
    typeof record.vendorProject !== "string" ||
    typeof record.product !== "string" ||
    typeof record.vulnerabilityName !== "string" ||
    typeof record.dateAdded !== "string" ||
    typeof record.shortDescription !== "string" ||
    typeof record.requiredAction !== "string" ||
    typeof record.dueDate !== "string"
  ) {
    throw new Error("Unexpected response format: KEV vulnerability is missing required fields");
  }

  return {
    cveID: record.cveID,
    vendorProject: record.vendorProject,
    product: record.product,
    vulnerabilityName: record.vulnerabilityName,
    dateAdded: record.dateAdded,
    shortDescription: record.shortDescription,
    requiredAction: record.requiredAction,
    dueDate: record.dueDate,
    knownRansomwareCampaignUse: typeof record.knownRansomwareCampaignUse === "string" ? record.knownRansomwareCampaignUse : undefined,
    notes: typeof record.notes === "string" ? record.notes : undefined,
    cwes: Array.isArray(record.cwes) ? record.cwes.filter((item): item is string => typeof item === "string") : undefined,
  };
}

function getRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function getPreferredIdentifier(record: Record<string, unknown>): string | null {
  const rawId = typeof record.id === "string" && record.id.trim().length > 0 ? record.id.trim() : null;
  const metadataId = getNestedString(record, "cveMetadata", "cveId");
  const aliases = normalizeAliases(record.aliases);
  const cveAlias = aliases.find((alias) => /^CVE-\d{4}-\d+$/i.test(alias));

  return cveAlias ?? metadataId ?? rawId ?? aliases[0] ?? null;
}

function normalizeAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normalizeRecordIdentifiers(record: Record<string, unknown>, preferredId: string): Record<string, unknown> {
  const rawId = typeof record.id === "string" && record.id.trim().length > 0 ? record.id.trim() : undefined;
  const metadataId = getNestedString(record, "cveMetadata", "cveId");
  const aliases = normalizeAliases(record.aliases);
  const nextAliases = Array.from(
    new Set(
      [rawId, metadataId, ...aliases]
        .filter((item): item is string => typeof item === "string" && item.length > 0)
        .filter((item) => item !== preferredId)
    )
  );

  return {
    ...record,
    id: preferredId,
    sourceId:
      (rawId && rawId !== preferredId ? rawId : undefined) ??
      (metadataId && metadataId !== preferredId ? metadataId : undefined) ??
      record.sourceId,
    aliases: nextAliases,
  };
}

function normalizeSupplementalData(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...record,
    referenceMeta: normalizeReferences(record),
    linkedVulnerabilities: normalizeLinkedVulnerabilities(record, typeof record.id === "string" ? record.id : ""),
    affectedProducts: normalizeAffectedProducts(record),
  };
}

function getNestedString(record: Record<string, unknown>, ...path: string[]): string | null {
  let current: unknown = record;

  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(segment in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

function normalizeReferences(record: Record<string, unknown>): VulnerabilityReference[] {
  const rawContainerReferences = getNestedArray(record, "containers", "cna", "references");
  const containerReferences = rawContainerReferences.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const reference = entry as Record<string, unknown>;
    const url = extractReferenceUrl(reference.url);
    if (!url) return [];

    return [{
      url,
      host: extractHost(url),
      tags: Array.isArray(reference.tags)
        ? reference.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
        : [],
      type: detectReferenceType(url, Array.isArray(reference.tags) ? reference.tags : []),
    }];
  });

  const fallbackReferences = Array.isArray(record.references)
    ? record.references.flatMap((entry) => {
        const url = extractReferenceUrl(entry);
        if (!url) return [];
        return [{
          url,
          host: extractHost(url),
          tags: [],
          type: detectReferenceType(url, []),
        }];
      })
    : [];

  return dedupeByUrl([...containerReferences, ...fallbackReferences]);
}

function normalizeLinkedVulnerabilities(record: Record<string, unknown>, currentId: string): LinkedVulnerability[] {
  const sources: Array<{ relationship: string; value: unknown }> = [
    { relationship: "related", value: record.related_vulnerabilities },
    { relationship: "linked", value: record.linked_vulnerabilities },
    { relationship: "related", value: record.vulnerabilities },
    { relationship: "related", value: record.related },
  ];

  const values = sources.flatMap(({ relationship, value }) =>
    normalizeLinkedValues(value).map((id) => ({ id, relationship }))
  );

  const unique = new Map<string, LinkedVulnerability>();
  for (const entry of values) {
    if (!entry.id || entry.id === currentId) continue;
    if (!unique.has(entry.id)) {
      unique.set(entry.id, entry);
    }
  }

  return Array.from(unique.values());
}

function normalizeAffectedProducts(record: Record<string, unknown>): NormalizedAffectedProduct[] {
  const normalized: NormalizedAffectedProduct[] = [];

  const affected = getNestedArray(record, "containers", "cna", "affected");
  for (const entry of affected) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const vendor = typeof item.vendor === "string" ? item.vendor.trim() : "";
    const product = typeof item.product === "string" ? item.product.trim() : "";
    const versions = Array.isArray(item.versions) ? item.versions : [];

    if (versions.length > 0) {
      for (const versionEntry of versions) {
        if (!versionEntry || typeof versionEntry !== "object" || Array.isArray(versionEntry)) continue;
        const versionRecord = versionEntry as Record<string, unknown>;
        normalized.push({
          vendor,
          product,
          version: typeof versionRecord.version === "string" ? versionRecord.version.trim() : "",
          ecosystem: "cna",
        });
      }
      continue;
    }

    normalized.push({ vendor, product, version: "", ecosystem: "cna" });
  }

  const vulnerableProducts = Array.isArray(record.vulnerable_product) ? record.vulnerable_product : [];
  for (const value of vulnerableProducts) {
    if (typeof value !== "string") continue;
    normalized.push(parseAffectedProductString(value, "vulnerable_product"));
  }

  const vulnerableConfigurations = Array.isArray(record.vulnerable_configuration) ? record.vulnerable_configuration : [];
  for (const value of vulnerableConfigurations) {
    if (typeof value !== "string") continue;
    normalized.push(parseAffectedProductString(value, "vulnerable_configuration"));
  }

  const unique = new Map<string, NormalizedAffectedProduct>();
  for (const entry of normalized) {
    const key = `${entry.vendor}|${entry.product}|${entry.version}|${entry.ecosystem}`.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  }

  return Array.from(unique.values()).filter((entry) => entry.vendor || entry.product || entry.version);
}

function getNestedArray(record: Record<string, unknown>, ...path: string[]): unknown[] {
  let current: unknown = record;

  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(segment in current)) {
      return [];
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return Array.isArray(current) ? current : [];
}

function extractReferenceUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function detectReferenceType(url: string, tags: unknown[]): string {
  const lowerUrl = url.toLowerCase();
  const normalizedTags = tags.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());

  if (normalizedTags.some((item) => item.includes("exploit")) || /exploit|poc|proof/i.test(lowerUrl)) return "exploit";
  if (normalizedTags.some((item) => item.includes("patch")) || /commit|patch|release-notes|advisories/i.test(lowerUrl)) return "patch";
  if (normalizedTags.some((item) => item.includes("advisory")) || /advisory|security/i.test(lowerUrl)) return "advisory";
  return "reference";
}

function dedupeByUrl(references: VulnerabilityReference[]): VulnerabilityReference[] {
  const unique = new Map<string, VulnerabilityReference>();
  for (const reference of references) {
    if (!unique.has(reference.url)) {
      unique.set(reference.url, reference);
    }
  }
  return Array.from(unique.values());
}

function normalizeLinkedValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const values: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      values.push(item.trim());
      continue;
    }

    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const candidate = [record.id, record.cve, record.vulnerability, record.title].find(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
      );
      if (candidate) {
        values.push(candidate.trim());
      }
    }
  }

  return Array.from(new Set(values.filter(Boolean)));
}

function parseAffectedProductString(value: string, ecosystem: string): NormalizedAffectedProduct {
  const trimmed = value.trim();
  const cpe = trimmed.startsWith("cpe:2.3:") ? trimmed.split(":") : null;

  if (cpe && cpe.length >= 6) {
    return {
      vendor: cpe[3] || "",
      product: cpe[4] || "",
      version: cpe[5] || "",
      ecosystem,
    };
  }

  const segments = trimmed.split(":");
  if (segments.length >= 2) {
    return {
      vendor: segments[0] || "",
      product: segments[1] || "",
      version: segments.slice(2).join(":"),
      ecosystem,
    };
  }

  return {
    vendor: "",
    product: trimmed,
    version: "",
    ecosystem,
  };
}
