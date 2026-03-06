export type DependencyEcosystem = "npm" | "Packagist";

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  archived: boolean;
  html_url: string;
  default_branch: string;
  language: string | null;
  description: string | null;
  updated_at: string;
}

export interface MonitoredRepo {
  id: string;
  githubId: number;
  fullName: string;
  htmlUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
  addedAt: string;
  lastScannedAt: string | null;
  lastScanVulnerabilityCount: number | null;
}

export interface ParsedDependency {
  name: string;
  version: string;
  ecosystem: DependencyEcosystem;
  isDev: boolean;
}

export interface OSVSeverity {
  type: string;
  score: string;
}

export interface OSVAffectedRange {
  type: string;
  events: { introduced?: string; fixed?: string; last_affected?: string }[];
}

export interface OSVAffectedPackage {
  package: {
    name: string;
    ecosystem: string;
    purl?: string;
  };
  ranges?: OSVAffectedRange[];
  versions?: string[];
}

export interface OSVVulnerability {
  id: string;
  summary: string;
  details: string;
  aliases: string[];
  severity: OSVSeverity[];
  affected: OSVAffectedPackage[];
  references: { type: string; url: string }[];
  published: string;
  modified: string;
}

export interface VulnerabilityMatch {
  vulnerability: OSVVulnerability;
  matchedDependency: ParsedDependency;
  cveIds: string[];
}

export interface DependencyScanResult {
  repoFullName: string;
  scannedAt: string;
  dependencyCount: number;
  locationCount: number;
  vulnerabilities: VulnerabilityMatch[];
}

export interface RepoFileContent {
  path: string;
  content: string;
}

export interface FixFileChange {
  path: string;
  content: string;
  description: string;
}

export interface AIFixResult {
  analysis: string;
  fileChanges: FixFileChange[];
  prTitle: string;
  prBody: string;
}

export interface FixRequestPayload {
  repoFullName: string;
  vulnerability: OSVVulnerability;
  matchedDependency: ParsedDependency;
  aiSettings?: {
    provider?: string;
    model?: string;
    apiKey?: string;
  };
}

export interface FixResponse {
  prUrl: string;
  analysis: string;
  fileChanges: FixFileChange[];
  branchName: string;
  existingPr?: boolean;
}
