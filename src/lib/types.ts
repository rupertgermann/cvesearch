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
  kev?: KnownExploitedVulnerability;
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
  kev?: KnownExploitedVulnerability;
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
  presets: DashboardPreset[];
  latestCritical: CVESummary[];
  highestRisk: CVESummary[];
  recentHighImpact: CVESummary[];
  workflowViews: DashboardWorkflowView[];
}

export interface ProjectItem {
  cveId: string;
  note?: string;
  addedAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  items: ProjectItem[];
  activity: AuditLogEntry[];
}

export interface AITriageContextSnapshot {
  status: "new" | "investigating" | "mitigated" | "accepted" | "closed";
  owner: string;
  notes: string;
  tags: string[];
  updatedAt: string;
}

export interface AIContextCluster {
  canonicalId: string;
  sourceIds: string[];
  relatedIds: string[];
  summary: string;
}

export interface AITriageSignal {
  label: string;
  value: string;
  level: "high" | "medium" | "low";
  rationale: string;
}

export interface AITriageRecommendation {
  priority: "critical" | "high" | "medium" | "low";
  status: "new" | "investigating" | "mitigated" | "accepted" | "closed";
  confidence: "high" | "medium" | "low";
  ownerRecommendation: string;
  rationale: string;
  nextSteps: string[];
  signals: AITriageSignal[];
}

export interface AIProjectContext {
  projectCount: number;
  projectNames: string[];
  summary: string;
}

export interface AICveInsight {
  summary: string;
  triage: AITriageRecommendation;
  remediation: string[];
  cluster: AIContextCluster;
  projectContext: AIProjectContext;
}

export interface AITriageSuggestion {
  summary: string;
  recommendation: AITriageRecommendation;
  recommendedTags: string[];
  recommendedOwner: string;
  ownershipRationale: string;
  projectContext: AIProjectContext;
  requiresHumanApproval: boolean;
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
  projectContext: AIProjectContext;
  requiresHumanApproval: boolean;
}

export interface AIWatchlistReviewCluster {
  label: string;
  cveIds: string[];
  summary: string;
}

export interface AIWatchlistReview {
  headline: string;
  summary: string;
  newMatches: string[];
  changedSinceLastReview: string[];
  clusters: AIWatchlistReviewCluster[];
  recommendedActions: string[];
  previousReviewAt: string | null;
  reviewedAt: string;
}

export interface AIProjectSummarySection {
  headline: string;
  summary: string;
  bullets: string[];
}

export interface AIProjectSummary {
  projectName: string;
  overview: string;
  executive: AIProjectSummarySection;
  analyst: AIProjectSummarySection;
  engineering: AIProjectSummarySection;
  metrics: {
    totalItems: number;
    criticalCount: number;
    highCount: number;
    kevCount: number;
    investigatingCount: number;
  };
}

export interface AIAlertInvestigationMatch {
  id: string;
  summary: string;
  rationale: string;
  unread: boolean;
}

export interface AIAlertInvestigation {
  ruleName: string;
  summary: string;
  whyMatched: string[];
  topMatches: AIAlertInvestigationMatch[];
  recommendedAction: string;
  nextSteps: string[];
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
  createdAt: string;
}

export type AIProvider = "heuristic" | "openai" | "anthropic";

export type AIFeature = "search_assistant" | "cve_insight" | "daily_digest" | "triage_agent" | "remediation_agent" | "watchlist_analyst" | "project_summary" | "alert_investigation";

export interface AISettings {
  provider: AIProvider;
  model: string;
  apiKey: string;
}
