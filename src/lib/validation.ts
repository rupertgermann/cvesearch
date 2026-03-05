import { CVEDetail, CVESummary, CWEData, EPSSData } from "./types";

export function parseCVESummaryList(value: unknown): CVESummary[] {
  if (!Array.isArray(value)) {
    throw new Error("Unexpected response format: expected a CVE list");
  }

  const parsed = value.flatMap((item) => {
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

export function parseCVEDetail(value: unknown): CVEDetail {
  const record = getRecord(value, "Unexpected response format: expected a CVE detail object");
  const normalizedId = getPreferredIdentifier(record);

  if (!normalizedId) {
    throw new Error("Unexpected response format: CVE detail is missing an id");
  }

  return normalizeRecordIdentifiers(record, normalizedId) as unknown as CVEDetail;
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

function parseCVESummary(value: unknown): CVESummary {
  const record = getRecord(value, "Unexpected response format: expected a CVE summary object");
  const normalizedId = getPreferredIdentifier(record);

  if (!normalizedId) {
    throw new Error("Unexpected response format: CVE summary is missing an id");
  }

  return normalizeRecordIdentifiers(record, normalizedId) as unknown as CVESummary;
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
