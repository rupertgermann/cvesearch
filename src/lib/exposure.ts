import type { MonitoredRepo, RepoScanRecord } from "./github-types";
import type { AffectedProduct, CVESummary } from "./types";
import { parseCVESummaryList } from "./validation";
import type { InventoryAssetRecord } from "./workspace-types";

// One queue row per (vulnerability, asset). The key is stable across loads so per-finding state can hang off it.
export interface ExposureRow {
  key: string;
  vulnerabilityId: string;
  source: "inventory" | "repo";
  assetId: string;
  assetLabel: string;
  criticality: InventoryAssetRecord["criticality"] | null;
  repoFullName: string | null;
  firstSeenAt: string;
  cve: CVESummary;
}

export interface ExposureQueue {
  rows: ExposureRow[];
  hasSources: boolean;
  // The feed page cap stopped before every asset's cursor, so some new CVEs were not checked.
  truncated: boolean;
}

export function exposureRowKey(vulnerabilityId: string, assetId: string): string {
  return `${vulnerabilityId}::${assetId}`;
}

type AssetMatchFields = Pick<InventoryAssetRecord, "vendor" | "product" | "version">;
type CVEWithContainers = CVESummary & { containers?: { cna?: { affected?: unknown } } };

export function matchesInventoryAsset(cve: CVESummary, asset: AssetMatchFields): boolean {
  const product = normalizeName(asset.product);
  if (!product) return false;
  const vendor = normalizeName(asset.vendor);
  const version = asset.version.trim();
  const namesMatch = (entryVendor: string | undefined, entryProduct: string | undefined) => {
    const ev = normalizeName(entryVendor ?? "");
    return normalizeName(entryProduct ?? "") === product && (!vendor || !ev || ev === vendor);
  };

  const affected = (cve as CVEWithContainers).containers?.cna?.affected;
  for (const entry of Array.isArray(affected) ? (affected as AffectedProduct[]) : []) {
    if (entry && typeof entry === "object" && namesMatch(entry.vendor, entry.product) && (!version || cnaEntryCoversVersion(entry, version))) {
      return true;
    }
  }

  return (cve.affectedProducts ?? []).some((entry) =>
    entry.ecosystem !== "cna"
    && namesMatch(entry.vendor, entry.product)
    && (!version || !isComparableVersion(entry.version) || compareVersions(entry.version, version) === 0)
  );
}

// "Where data allows": entries whose versions cannot be compared count as affected rather than silently dropped.
function cnaEntryCoversVersion(entry: AffectedProduct, version: string): boolean {
  const versions = Array.isArray(entry.versions) ? entry.versions : [];
  const affected = versions.filter((item) => item && item.status === "affected");
  if (versions.length === 0) return entry.defaultStatus !== "unaffected";
  if (affected.length === 0) return entry.defaultStatus === "affected";
  if (!isComparableVersion(version)) return true;

  return affected.some((item) => {
    const raw = item as typeof item & { lessThanOrEqual?: string };
    const upper = raw.lessThan ?? raw.lessThanOrEqual;
    if (raw.versionType === "git") return true;
    if (upper !== undefined) {
      if (!isComparableVersion(upper)) return true;
      const start = item.version;
      const aboveStart = !isComparableVersion(start) || start === "0" || compareVersions(version, start) >= 0;
      const cmp = compareVersions(version, upper);
      return aboveStart && (raw.lessThan !== undefined ? cmp < 0 : cmp <= 0);
    }
    return isComparableVersion(item.version) ? compareVersions(item.version, version) === 0 : true;
  });
}

function isComparableVersion(value: string | undefined): value is string {
  return typeof value === "string" && /^v?\d+(\.[0-9A-Za-z-]+)*$/.test(value.trim());
}

// shortcut: tokenised compare (numbers numerically, letters lexically, shorter prefix first); not full semver
// pre-release semantics (1.0.0-rc1 sorts after 1.0.0). Swap for a semver/ecosystem comparator if that matters.
export function compareVersions(a: string, b: string): number {
  const tokens = (value: string) => (value.trim().replace(/^v/i, "").toLowerCase().match(/\d+|[a-z]+/g) ?? []);
  const left = trimZeros(tokens(a));
  const right = trimZeros(tokens(b));
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const l = left[index];
    const r = right[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const ln = /^\d+$/.test(l);
    const rn = /^\d+$/.test(r);
    const diff = ln && rn ? Number(l) - Number(r) : ln ? -1 : rn ? 1 : l.localeCompare(r);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

// "1.2" and "1.2.0" are the same version.
function trimZeros(tokens: string[]): string[] {
  const next = [...tokens];
  while (next.length > 1 && next[next.length - 1] === "0") next.pop();
  return next;
}

function normalizeName(value: string): string {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, "");
  return normalized === "n/a" ? "" : normalized;
}

// scans: newest first, as listRepoScansForRepo returns them.
export function buildRepoExposureRows(repo: Pick<MonitoredRepo, "id" | "fullName">, scans: RepoScanRecord[]): ExposureRow[] {
  const [latest] = scans;
  if (!latest) return [];

  const rows = new Map<string, ExposureRow>();
  for (const match of latest.vulnerabilities) {
    const [cve] = parseCVESummaryList([match.vulnerability]);
    if (!cve) continue;
    const dependency = match.matchedDependency;
    const assetId = `${repo.id}:${dependency.ecosystem}:${dependency.name}`;
    const key = exposureRowKey(cve.id, assetId);
    if (rows.has(key)) continue;

    // shortcut: first-seen only looks as far back as the scans passed in.
    const firstSeenAt = scans.reduce(
      (oldest, scan) =>
        scan.vulnerabilities.some((item) => item.vulnerability.id === match.vulnerability.id && item.matchedDependency.name === dependency.name)
          ? scan.scannedAt
          : oldest,
      latest.scannedAt
    );

    rows.set(key, {
      key,
      vulnerabilityId: cve.id,
      source: "repo",
      assetId,
      assetLabel: `${dependency.name}@${dependency.version}`,
      criticality: null,
      repoFullName: repo.fullName,
      firstSeenAt,
      cve,
    });
  }

  return Array.from(rows.values());
}
