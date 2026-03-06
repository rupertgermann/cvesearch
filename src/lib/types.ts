export interface CVESummary {
  id: string;
  sourceId?: string;
  summary?: string;
  description?: string;
  aliases?: string[];
  assigner?: string;
  cvss?: number;
  cvss3?: number;
  epss?: number;
  cwe?: string;
  published?: string;
  modified?: string;
  references?: string[];
  vulnerable_product?: string[];
  state?: string;
}

export interface CVEDetail {
  id: string;
  sourceId?: string;
  summary?: string;
  description?: string;
  aliases?: string[];
  assigner?: string;
  cvss?: number;
  cvss3?: number;
  epss?: number;
  cwe?: string;
  cwe_name?: string;
  published?: string;
  modified?: string;
  references?: string[];
  vulnerable_product?: string[];
  vulnerable_configuration?: string[];
  capec?: CAPECItem[];
  state?: string;
  // vulnerability.circl.lu fields
  containers?: {
    cna?: {
      affected?: AffectedProduct[];
      descriptions?: { lang: string; value: string }[];
      metrics?: MetricEntry[];
      references?: { url: string; tags?: string[] }[];
      problemTypes?: { descriptions: { lang: string; description: string; cweId?: string; type?: string }[] }[];
    };
  };
  cveMetadata?: {
    cveId?: string;
    assignerOrgId?: string;
    assignerShortName?: string;
    state?: string;
    datePublished?: string;
    dateUpdated?: string;
    dateReserved?: string;
  };
  taxonomy?: {
    cwe?: {
      id?: string;
      description?: string;
    };
  };
}

export interface AffectedProduct {
  vendor?: string;
  product?: string;
  versions?: { version: string; status: string; lessThan?: string; versionType?: string }[];
  defaultStatus?: string;
  platforms?: string[];
  cpes?: string[];
}

export interface MetricEntry {
  cvssV3_1?: CVSSv3;
  cvssV3_0?: CVSSv3;
  cvssV2_0?: CVSSv2;
  format?: string;
  scenarios?: { lang: string; value: string }[];
  [key: string]: unknown;
}

export interface CVSSv3 {
  version?: string;
  vectorString?: string;
  attackVector?: string;
  attackComplexity?: string;
  privilegesRequired?: string;
  userInteraction?: string;
  scope?: string;
  confidentialityImpact?: string;
  integrityImpact?: string;
  availabilityImpact?: string;
  baseScore?: number;
  baseSeverity?: string;
}

export interface CVSSv2 {
  version?: string;
  vectorString?: string;
  accessVector?: string;
  accessComplexity?: string;
  authentication?: string;
  confidentialityImpact?: string;
  integrityImpact?: string;
  availabilityImpact?: string;
  baseScore?: number;
}

export interface CAPECItem {
  id: string;
  name: string;
  summary?: string;
  prerequisites?: string;
  solutions?: string;
  related_weakness?: string[];
}

export interface EPSSData {
  cve: string;
  epss: number;
  percentile: number;
  date?: string;
}

export interface CWEData {
  id: string;
  name?: string;
  description?: string;
}

export interface SearchFilters {
  query: string;
  vendor: string;
  product: string;
  cwe: string;
  since: string;
  minSeverity: SearchSeverityFilter;
  sort: SearchSortOption;
  page: number;
  perPage: number;
}

export type SeverityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE" | "UNKNOWN";
export type SearchSeverityFilter = "ANY" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type SearchSortOption = "published_desc" | "published_asc" | "cvss_desc" | "cvss_asc";

export interface DashboardPreset {
  title: string;
  description: string;
  href: string;
  accentClassName: string;
}

export interface DashboardSummary {
  sampledCount: number;
  criticalCount: number;
  highOrAboveCount: number;
  publishedThisWeekCount: number;
}

export interface HomeDashboardData {
  summary: DashboardSummary;
  presets: DashboardPreset[];
  latestCritical: CVESummary[];
  highestCvss: CVESummary[];
  recentHighImpact: CVESummary[];
}

export interface ProjectItem {
  cveId: string;
  note?: string;
  addedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  items: ProjectItem[];
}

export interface AIContextCluster {
  canonicalId: string;
  sourceIds: string[];
  relatedIds: string[];
  summary: string;
}

export interface AITriageRecommendation {
  priority: "critical" | "high" | "medium" | "low";
  status: "new" | "investigating" | "mitigated" | "accepted" | "closed";
  rationale: string;
  nextSteps: string[];
}

export interface AICveInsight {
  summary: string;
  triage: AITriageRecommendation;
  remediation: string[];
  cluster: AIContextCluster;
}

export type AISearchFilterField = "query" | "vendor" | "product" | "cwe" | "since" | "minSeverity" | "sort";

export interface AISearchAppliedFilter {
  field: AISearchFilterField;
  value: string;
  reason: string;
}

export interface AISearchToolTrace {
  tool: string;
  summary: string;
}

export interface AISearchInterpretation {
  query: string;
  vendor: string;
  product: string;
  cwe: string;
  since: string;
  minSeverity: SearchSeverityFilter;
  sort: SearchSortOption;
  explanation: string;
  assumptions: string[];
  appliedFilters: AISearchAppliedFilter[];
  toolCalls: AISearchToolTrace[];
  needsClarification: boolean;
  clarificationQuestion: string;
}

export interface AIDigestSection {
  title: string;
  body: string;
  items: string[];
}

export interface AIDigest {
  headline: string;
  sections: AIDigestSection[];
}

export type AIProvider = "heuristic" | "openai" | "anthropic";

export type AIFeature = "search_assistant" | "cve_insight" | "daily_digest";

export interface AISettings {
  provider: AIProvider;
  model: string;
  apiKey: string;
}
