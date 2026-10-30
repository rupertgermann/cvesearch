import { parseDependencyFiles } from "./dependency-parser";
import { fetchRepoDependencyFiles } from "./github";
import { DependencyScanResult } from "./github-types";
import { updateLastScan } from "./monitored-repos-store";
import { queryOSVBatch } from "./osv";
import { diffScanFindings, ScanDiff } from "./repo-scan-diff";
import { createRepoFindingsNotification, listRepoScansForRepo, persistRepoScanResult } from "./repo-scans-store";

// Scans, persists, and diffs against the previous scan; new findings become an in-app notification. diff is null for a first scan.
export async function scanRepoForUser(
  userId: string,
  fullName: string,
  branch?: string
): Promise<{ result: DependencyScanResult; diff: ScanDiff | null }> {
  const files = await fetchRepoDependencyFiles(fullName, branch);
  const { dependencies, locationCount } = files.length > 0 ? parseDependencyFiles(files) : { dependencies: [], locationCount: 0 };
  const vulnerabilities = await queryOSVBatch(dependencies);

  const result: DependencyScanResult = {
    repoFullName: fullName,
    scannedAt: new Date().toISOString(),
    dependencyCount: dependencies.length,
    locationCount,
    vulnerabilities,
  };

  const branchKey = branch ?? "default";
  const [previous] = await listRepoScansForRepo(userId, fullName, 1, branchKey);
  await updateLastScan(userId, fullName, vulnerabilities.length);
  await persistRepoScanResult(userId, fullName, branchKey, result);

  const diff = previous ? diffScanFindings(previous.vulnerabilities, vulnerabilities) : null;
  if (diff && diff.newFindings.length > 0) {
    createRepoFindingsNotification(userId, fullName, diff.newFindings);
  }
  return { result, diff };
}
