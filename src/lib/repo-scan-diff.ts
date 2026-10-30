import type { ExposureRow } from "./exposure";
import { VulnerabilityMatch } from "./github-types";

export interface ScanDiff {
  newFindings: string[];
  fixedFindings: string[];
  openFindings: string[];
}

// A finding is an advisory on a package; version bumps that stay vulnerable remain "still open".
export function diffScanFindings(previous: VulnerabilityMatch[], current: VulnerabilityMatch[]): ScanDiff {
  const before = findingKeys(previous);
  const after = findingKeys(current);
  return {
    newFindings: [...after].filter((key) => !before.has(key)).sort(),
    fixedFindings: [...before].filter((key) => !after.has(key)).sort(),
    openFindings: [...after].filter((key) => before.has(key)).sort(),
  };
}

export function findingKey(match: VulnerabilityMatch): string {
  return `${match.vulnerability.id} (${match.matchedDependency.name})`;
}

function findingKeys(matches: VulnerabilityMatch[]): Set<string> {
  return new Set(matches.map(findingKey));
}

// Repo exposure rows key their asset as `${repoId}:${ecosystem}:${name}` (see buildRepoExposureRows).
function repoRowDependency(row: Pick<ExposureRow, "assetId">): { ecosystem: string; name: string } {
  const [, ecosystem = "", ...name] = row.assetId.split(":");
  return { ecosystem, name: name.join(":") };
}

// The AI fix flow only handles npm and Composer, and only GitHub repos (uploaded source names never contain "/").
export function canOpenFixPR(row: Pick<ExposureRow, "source" | "assetId" | "repoFullName">): boolean {
  const { ecosystem } = repoRowDependency(row);
  return row.source === "repo" && Boolean(row.repoFullName?.includes("/")) && (ecosystem === "npm" || ecosystem === "Packagist");
}

export function findRepoRowMatch(row: Pick<ExposureRow, "assetId" | "vulnerabilityId">, matches: VulnerabilityMatch[]): VulnerabilityMatch | undefined {
  const { ecosystem, name } = repoRowDependency(row);
  return matches.find((match) =>
    match.matchedDependency.ecosystem === ecosystem &&
    match.matchedDependency.name === name &&
    (match.vulnerability.id === row.vulnerabilityId || (match.vulnerability.aliases ?? match.cveIds ?? []).includes(row.vulnerabilityId))
  );
}
