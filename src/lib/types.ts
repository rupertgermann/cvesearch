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
  referenceMeta?: VulnerabilityReference[];
  vulnerable_product?: string[];
  affectedProducts?: NormalizedAffectedProduct[];
  linkedVulnerabilities?: LinkedVulnerability[];
  state?: string;
  kev?: KnownExploitedVulnerability;
}

export type DataSource = "live" | "cache";

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
  referenceMeta?: VulnerabilityReference[];
  vulnerable_product?: string[];
  vulnerable_configuration?: string[];
  affectedProducts?: NormalizedAffectedProduct[];
  linkedVulnerabilities?: LinkedVulnerability[];
  capec?: CAPECItem[];
  state?: string;
  // Set by the server API: "cache" means served from the local store during an upstream outage.
  source?: DataSource;
  storedAt?: string;
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
  kev?: KnownExploitedVulnerability;
}

export interface VulnerabilityReference {
  url: string;
  host: string;
  tags: string[];
  type: string;
}

export interface LinkedVulnerability {
  id: string;
  relationship: string;
}

export interface NormalizedAffectedProduct {
  vendor: string;
  product: string;
  version: string;
  ecosystem: string;
}

export interface KnownExploitedVulnerability {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse?: string;
  notes?: string;
  cwes?: string[];
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
  cvssV4_0?: CVSSv3;
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
export type SearchSortOption = "published_desc" | "published_asc" | "cvss_desc" | "cvss_asc" | "risk_desc";

export interface DashboardSummary {
  sampledCount: number;
  criticalCount: number;
  highOrAboveCount: number;
  publishedThisWeekCount: number;
  knownExploitedCount: number;
}

export interface DashboardMetric {
  label: string;
  value: string;
}

export interface DashboardWorkflowView {
  id: "analyst" | "maintainer" | "incident_response";
  title: string;
  description: string;
  accentClassName: string;
  href: string;
  metrics: DashboardMetric[];
  cves: CVESummary[];
}

export interface HomeDashboardData {
  summary: DashboardSummary;
  workflowViews: DashboardWorkflowView[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
}

export interface AITriageContextSnapshot {
  status: "new" | "investigating" | "mitigated" | "accepted" | "closed";
  owner: string;
  notes: string;
  tags: string[];
  updatedAt: string;
}

export interface AIRemediationPlan {
  summary: string;
  strategy: string;
  compensatingControls: string[];
  validationSteps: string[];
  rolloutNotes: string[];
  changeRisk: "high" | "medium" | "low";
  recommendedOwner: string;
  ownerRationale: string;
  requiresHumanApproval: boolean;
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

export type AIRunStatus = "success" | "fallback" | "error";

export interface AIRunRecord {
  id: string;
  feature: AIFeature;
  provider: AIProvider;
  model: string;
  mode: "heuristic" | "configured";
  status: AIRunStatus;
  prompt: string;
  output: string;
  toolCalls: AISearchToolTrace[];
  error: string;
  durationMs: number;
  promptTokensEstimate?: number;
  outputTokensEstimate?: number;
  estimatedCostUsd?: number;
  createdAt: string;
}

export type AIProvider = "heuristic" | "openai" | "anthropic";

export type AIFeature = "search_assistant" | "remediation_agent";

export interface AISettings {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

// Client-supplied AI selection: never carries a key.
export interface AIOverrides {
  provider?: string;
  model?: string;
}
