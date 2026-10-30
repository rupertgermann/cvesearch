import { MonitoredRepo, ParsedDependency } from "./github-types";
import { getDb, withTransaction } from "./db";

export const listMonitoredRepos = async (userId: string): Promise<MonitoredRepo[]> => {
  const rows = getDb().prepare(`
    SELECT
      id,
      github_id as githubId,
      full_name as fullName,
      html_url as htmlUrl,
      is_private as isPrivate,
      default_branch as defaultBranch,
      added_at as addedAt,
      last_scanned_at as lastScannedAt,
      last_scan_vulnerability_count as lastScanVulnerabilityCount,
      source_kind as sourceKind
    FROM monitored_repos
    WHERE user_id = ?
    ORDER BY added_at DESC
  `).all(userId) as MonitoredRepoRow[];

  return rows.map((row) => normalizeMonitoredRepoRow(row));
};

export const addMonitoredRepo = async (userId: string, input: {
  githubId: number;
  fullName: string;
  htmlUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
  sourceKind?: MonitoredRepo["sourceKind"];
}): Promise<MonitoredRepo> => {
  return withTransaction((db) => {
    const existing = db.prepare(`
      SELECT
        id,
        github_id as githubId,
        full_name as fullName,
        html_url as htmlUrl,
        is_private as isPrivate,
        default_branch as defaultBranch,
        added_at as addedAt,
        last_scanned_at as lastScannedAt,
        last_scan_vulnerability_count as lastScanVulnerabilityCount,
        source_kind as sourceKind
      FROM monitored_repos
      WHERE user_id = ? AND full_name = ?
    `).get(userId, input.fullName) as MonitoredRepoRow | undefined;

    if (existing) {
      return normalizeMonitoredRepoRow(existing);
    }

    const repo: MonitoredRepo = {
      id: crypto.randomUUID(),
      githubId: input.githubId,
      fullName: input.fullName,
      htmlUrl: input.htmlUrl,
      isPrivate: input.isPrivate,
      defaultBranch: input.defaultBranch,
      addedAt: new Date().toISOString(),
      lastScannedAt: null,
      lastScanVulnerabilityCount: null,
      sourceKind: input.sourceKind ?? "github",
    };

    db.prepare(`
      INSERT INTO monitored_repos (
        id,
        user_id,
        github_id,
        full_name,
        html_url,
        is_private,
        default_branch,
        added_at,
        last_scanned_at,
        last_scan_vulnerability_count,
        source_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      repo.id,
      userId,
      repo.githubId,
      repo.fullName,
      repo.htmlUrl,
      repo.isPrivate ? 1 : 0,
      repo.defaultBranch,
      repo.addedAt,
      repo.lastScannedAt,
      repo.lastScanVulnerabilityCount,
      repo.sourceKind
    );

    return repo;
  });
};

export const removeMonitoredRepo = async (userId: string, repoId: string): Promise<boolean> => {
  const result = getDb().prepare("DELETE FROM monitored_repos WHERE user_id = ? AND id = ?").run(userId, repoId);
  return result.changes > 0;
};

export const updateLastScan = async (
  userId: string,
  repoFullName: string,
  vulnerabilityCount: number
): Promise<void> => {
  getDb().prepare(`
    UPDATE monitored_repos
    SET last_scanned_at = ?, last_scan_vulnerability_count = ?
    WHERE user_id = ? AND full_name = ?
  `).run(new Date().toISOString(), vulnerabilityCount, userId, repoFullName);
};

// The upload's filename is kept as its branch, like the scans of it.
export function saveUploadedDependencies(userId: string, fullName: string, filename: string, dependencies: ParsedDependency[]): void {
  getDb().prepare(`
    UPDATE monitored_repos SET upload_dependencies_json = ?, default_branch = ?
    WHERE user_id = ? AND full_name = ? AND source_kind = 'upload'
  `).run(JSON.stringify(dependencies), filename, userId, fullName);
}

export function readUploadedDependencies(userId: string, fullName: string): { filename: string; dependencies: ParsedDependency[] } | null {
  const row = getDb().prepare(`
    SELECT default_branch as filename, upload_dependencies_json as json FROM monitored_repos
    WHERE user_id = ? AND full_name = ? AND source_kind = 'upload' AND upload_dependencies_json IS NOT NULL
  `).get(userId, fullName) as { filename: string; json: string } | undefined;
  return row ? { filename: row.filename, dependencies: JSON.parse(row.json) as ParsedDependency[] } : null;
}

export const getMonitoredRepo = async (userId: string, repoIdOrFullName: string): Promise<MonitoredRepo | null> => {
  const row = getDb().prepare(`
    SELECT
      id,
      github_id as githubId,
      full_name as fullName,
      html_url as htmlUrl,
      is_private as isPrivate,
      default_branch as defaultBranch,
      added_at as addedAt,
      last_scanned_at as lastScannedAt,
      last_scan_vulnerability_count as lastScanVulnerabilityCount,
      source_kind as sourceKind
    FROM monitored_repos
    WHERE user_id = ? AND (id = ? OR full_name = ?)
    LIMIT 1
  `).get(userId, repoIdOrFullName, repoIdOrFullName) as MonitoredRepoRow | undefined;

  return row ? normalizeMonitoredRepoRow(row) : null;
};

interface MonitoredRepoRow {
  id: string;
  githubId: number;
  fullName: string;
  htmlUrl: string;
  isPrivate: number | boolean;
  defaultBranch: string;
  addedAt: string;
  lastScannedAt: string | null;
  lastScanVulnerabilityCount: number | null;
  sourceKind: string;
}

function normalizeMonitoredRepoRow(row: MonitoredRepoRow): MonitoredRepo {
  return {
    id: row.id,
    githubId: row.githubId,
    fullName: row.fullName,
    htmlUrl: row.htmlUrl,
    isPrivate: row.isPrivate === true || row.isPrivate === 1,
    defaultBranch: row.defaultBranch,
    addedAt: row.addedAt,
    lastScannedAt: row.lastScannedAt,
    lastScanVulnerabilityCount: row.lastScanVulnerabilityCount,
    sourceKind: row.sourceKind === "upload" ? "upload" : "github",
  };
}
