import { CVEDetail, CVESummary, CWEData, EPSSData } from "./types";

export function parseCVESummaryList(value: unknown): CVESummary[] {
  if (!Array.isArray(value)) {
    throw new Error("Unexpected response format: expected a CVE list");
  }

  return value.map(parseCVESummary);
}

export function parseCVEDetail(value: unknown): CVEDetail {
  const record = getRecord(value, "Unexpected response format: expected a CVE detail object");

  if (typeof record.id !== "string" || record.id.length === 0) {
    throw new Error("Unexpected response format: CVE detail is missing an id");
  }

  return record as unknown as CVEDetail;
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

  if (typeof record.id !== "string" || record.id.length === 0) {
    throw new Error("Unexpected response format: CVE summary is missing an id");
  }

  return record as unknown as CVESummary;
}

function getRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}
