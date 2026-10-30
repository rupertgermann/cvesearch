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
