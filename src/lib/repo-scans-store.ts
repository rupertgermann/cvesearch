import { getDb } from "./db";
import { DependencyScanResult, RepoScanRecord } from "./github-types";
import { getMonitoredRepo } from "./monitored-repos-store";
import { findingKey } from "./repo-scan-diff";

interface RepoScanRow {
  id: string;
  repoId: string | null;
  repoFullName: string;
  branch: string;
  scannedAt: string;
  dependencyCount: number;
  locationCount: number;
  vulnerabilityCount: number;
  resultJson: string;
  error: string;
}

// branch narrows to scans of that branch; omitted means every branch.
export async function listRepoScansForRepo(
  userId: string,
  repoFullName: string,
  limit = 6,
  branch: string | null = null
): Promise<RepoScanRecord[]> {
  const rows = getDb().prepare(`
    SELECT
      id,
      repo_id as repoId,
      repo_full_name as repoFullName,
      branch,
      scanned_at as scannedAt,
      dependency_count as dependencyCount,
      location_count as locationCount,
      vulnerability_count as vulnerabilityCount,
      result_json as resultJson,
      error
    FROM monitored_repo_scans
    WHERE user_id = ? AND repo_full_name = ? AND (? IS NULL OR branch = ?)
    ORDER BY scanned_at DESC
    LIMIT ?
  `).all(userId, repoFullName, branch, branch, limit) as RepoScanRow[];

  return rows.map(parseRepoScanRow);
}

export async function persistRepoScanResult(
  userId: string,
  repoFullName: string,
  branch: string,
  result: DependencyScanResult,
  error: string | null = null
): Promise<RepoScanRecord> {
  const repo = await getMonitoredRepo(userId, repoFullName);
  const [previous] = await listRepoScansForRepo(userId, repoFullName, 1, branch);
  const firstSeenAt: Record<string, string> = {};
  for (const match of result.vulnerabilities) {
    const key = findingKey(match);
    // Scans stored before first-seen was recorded only tell us the finding was there at the previous scan.
    firstSeenAt[key] = previous?.firstSeenAt?.[key]
      ?? (previous?.vulnerabilities.some((item) => findingKey(item) === key) ? previous.scannedAt : result.scannedAt);
  }
  const record: RepoScanRecord = {
    id: crypto.randomUUID(),
    repoId: repo?.id ?? null,
    repoFullName,
    branch,
    scannedAt: result.scannedAt,
    dependencyCount: result.dependencyCount,
    locationCount: result.locationCount,
    vulnerabilityCount: result.vulnerabilities.length,
    vulnerabilities: result.vulnerabilities,
    firstSeenAt,
    error,
  };

  getDb().prepare(`
    INSERT INTO monitored_repo_scans (
      id,
      user_id,
      repo_id,
      repo_full_name,
      branch,
      scanned_at,
      dependency_count,
      location_count,
      vulnerability_count,
      result_json,
      error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    userId,
    record.repoId,
    record.repoFullName,
    record.branch,
    record.scannedAt,
    record.dependencyCount,
    record.locationCount,
    record.vulnerabilityCount,
    JSON.stringify({
      repoFullName: record.repoFullName,
      scannedAt: record.scannedAt,
      dependencyCount: record.dependencyCount,
      locationCount: record.locationCount,
      vulnerabilities: record.vulnerabilities,
      firstSeenAt,
    } satisfies DependencyScanResult),
    error ?? ""
  );

  return record;
}

function parseRepoScanRow(row: RepoScanRow): RepoScanRecord {
  const parsed = parseResult(row.resultJson);

  return {
    id: row.id,
    repoId: row.repoId,
    repoFullName: row.repoFullName,
    branch: row.branch,
    scannedAt: row.scannedAt,
    dependencyCount: row.dependencyCount,
    locationCount: row.locationCount,
    vulnerabilityCount: row.vulnerabilityCount,
    vulnerabilities: parsed.vulnerabilities,
    firstSeenAt: parsed.firstSeenAt,
    error: row.error || null,
  };
}

function parseResult(value: string): DependencyScanResult {
  try {
    const parsed = JSON.parse(value) as Partial<DependencyScanResult>;
    return {
      repoFullName: typeof parsed.repoFullName === "string" ? parsed.repoFullName : "",
      scannedAt: typeof parsed.scannedAt === "string" ? parsed.scannedAt : "",
      dependencyCount: typeof parsed.dependencyCount === "number" ? parsed.dependencyCount : 0,
      locationCount: typeof parsed.locationCount === "number" ? parsed.locationCount : 0,
      vulnerabilities: Array.isArray(parsed.vulnerabilities) ? parsed.vulnerabilities : [],
      firstSeenAt: parsed.firstSeenAt && typeof parsed.firstSeenAt === "object" ? parsed.firstSeenAt : undefined,
    };
  } catch {
    return {
      repoFullName: "",
      scannedAt: "",
      dependencyCount: 0,
      locationCount: 0,
      vulnerabilities: [],
    };
  }
}

// In-app notification for findings a rescan found that the previous scan did not.
export interface RepoFindingsNotification {
  id: string;
  repoFullName: string;
  findings: string[];
  createdAt: string;
}

export function createRepoFindingsNotification(userId: string, repoFullName: string, findings: string[]): void {
  getDb().prepare(`
    INSERT INTO user_repo_notifications (id, user_id, repo_full_name, findings_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), userId, repoFullName, JSON.stringify(findings), new Date().toISOString());
}

export function listRecentRepoNotifications(userId: string, limit = 10): RepoFindingsNotification[] {
  const rows = getDb().prepare(`
    SELECT id, repo_full_name as repoFullName, findings_json as findingsJson, created_at as createdAt
    FROM user_repo_notifications
    WHERE user_id = ?
    ORDER BY created_at DESC, rowid DESC
    LIMIT ?
  `).all(userId, limit) as Array<Omit<RepoFindingsNotification, "findings"> & { findingsJson: string }>;

  return rows.map(({ findingsJson, ...row }) => ({ ...row, findings: JSON.parse(findingsJson) as string[] }));
}
