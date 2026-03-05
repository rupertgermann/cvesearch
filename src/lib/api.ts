import { CVEDetail, CVESummary, CWEData, EPSSData } from "./types";
import {
  parseCVEDetail,
  parseCVESummaryList,
  parseCWEData,
  parseEPSSResponse,
  parseStringList,
} from "./validation";

async function fetchAPI<T>(path: string): Promise<T> {
  const res = await fetch(`/api/proxy?path=${encodeURIComponent(path)}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function getLatestCVEs(page = 1, perPage = 20): Promise<CVESummary[]> {
  const data = await fetchAPI<unknown>(
    `/vulnerability/?per_page=${perPage}&page=${page}&sort_order=desc&date_sort=published`
  );
  return parseCVESummaryList(data);
}

export async function searchCVEs(params: {
  product?: string;
  cwe?: string;
  since?: string;
  page?: number;
  perPage?: number;
  source?: string;
}): Promise<CVESummary[]> {
  const searchParams = new URLSearchParams();
  if (params.product) searchParams.set("product", params.product);
  if (params.cwe) searchParams.set("cwe", params.cwe);
  if (params.since) searchParams.set("since", params.since);
  if (params.source) searchParams.set("source", params.source);
  searchParams.set("page", String(params.page || 1));
  searchParams.set("per_page", String(params.perPage || 20));
  searchParams.set("sort_order", "desc");
  searchParams.set("date_sort", "published");

  const data = await fetchAPI<unknown>(`/vulnerability/?${searchParams.toString()}`);
  return parseCVESummaryList(data);
}

export async function getCVEById(id: string): Promise<CVEDetail> {
  const data = await fetchAPI<unknown>(
    `/vulnerability/${encodeURIComponent(id)}?with_meta=true&with_linked=true&with_comments=true`
  );
  return parseCVEDetail(data);
}

export async function searchByVendorProduct(
  vendor: string,
  product: string,
  page = 1,
  perPage = 20
): Promise<CVESummary[]> {
  const data = await fetchAPI<unknown>(
    `/vulnerability/search/${encodeURIComponent(vendor)}/${encodeURIComponent(product)}?page=${page}&per_page=${perPage}`
  );
  return parseCVESummaryList(data);
}

export async function getVendors(): Promise<string[]> {
  const data = await fetchAPI<unknown>("/vulnerability/browse/");
  return parseStringList(data, "vendors");
}

export async function getVendorProducts(vendor: string): Promise<string[]> {
  const data = await fetchAPI<unknown>(`/vulnerability/browse/${encodeURIComponent(vendor)}`);
  return parseStringList(data, "vendor products");
}

export async function getEPSS(cveId: string): Promise<EPSSData | null> {
  try {
    const response = await fetchAPI<unknown>(`/epss/${encodeURIComponent(cveId)}`);
    return parseEPSSResponse(response);
  } catch {
    return null;
  }
}

export async function getEPSSQuietly(cveId: string): Promise<EPSSData | null> {
  try {
    const res = await fetch(`/api/proxy?path=${encodeURIComponent(`/epss/${cveId}`)}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return null;
    }

    const response = await res.json().catch(() => null);
    return parseEPSSResponse(response);
  } catch {
    return null;
  }
}

export async function getCWE(cweId: string): Promise<CWEData | null> {
  try {
    const data = await fetchAPI<unknown>(`/cwe/${encodeURIComponent(cweId)}`);
    return parseCWEData(data);
  } catch {
    return null;
  }
}
