import {
  AIAlertInvestigation,
  AICveInsight,
  AIDigest,
  AIExposureAssessment,
  AIFeature,
  AIProjectSummary,
  AIRemediationPlan,
  AIRunRecord,
  AITriageContextSnapshot,
  AITriageSignal,
  AITriageSuggestion,
  AIProvider,
  AISearchAppliedFilter,
  AISearchFilterField,
  AISearchInterpretation,
  AISearchToolTrace,
  AIWatchlistReview,
  CVEDetail,
  EPSSData,
  ProjectRecord,
  SearchSeverityFilter,
  SearchSortOption,
} from "./types";
import { appendAIRun, listRecentAIRuns } from "./ai-runs-store";
import { SearchState, normalizeSearchState } from "./search";
import { extractCVEId, extractDescription, getSeverityFromScore } from "./utils";
import {
  getAlertInvestigationPromptTemplate,
  getCveInsightPromptTemplate,
  getDailyDigestPromptTemplate,
  getExposureAgentPromptTemplate,
  getProjectSummaryPromptTemplate,
  getRemediationAgentPromptTemplate,
  getSearchAssistantPromptTemplate,
  getTriageAgentPromptTemplate,
  getWatchlistAnalystPromptTemplate,
  listPromptTemplates,
} from "./ai-prompts";
import { listAITools } from "./ai-tool-registry";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
const SEARCH_DEFAULT_SORT: SearchSortOption = "published_desc";
const SEARCH_DEFAULT_MIN_SEVERITY: SearchSeverityFilter = "ANY";
const AI_FEATURES: AIFeature[] = ["search_assistant", "cve_insight", "daily_digest", "triage_agent", "remediation_agent", "watchlist_analyst", "project_summary", "alert_investigation", "exposure_agent"];
const AI_FEATURE_ENV_SEGMENTS: Record<AIFeature, string> = {
  search_assistant: "SEARCH_ASSISTANT",
  cve_insight: "CVE_INSIGHT",
  daily_digest: "DAILY_DIGEST",
  triage_agent: "TRIAGE_AGENT",
  remediation_agent: "REMEDIATION_AGENT",
  watchlist_analyst: "WATCHLIST_ANALYST",
  project_summary: "PROJECT_SUMMARY",
  alert_investigation: "ALERT_INVESTIGATION",
  exposure_agent: "EXPOSURE_AGENT",
};
const SEARCH_VENDOR_PRODUCT_ALIASES: Array<{ vendor: string; product: string; aliases: string[] }> = [
  { vendor: "OpenSSL", product: "OpenSSL", aliases: ["openssl", "libssl"] },
  { vendor: "Microsoft", product: "Exchange", aliases: ["microsoft exchange", "exchange server", "exchange"] },
  { vendor: "Apache", product: "HTTP Server", aliases: ["apache http server", "apache httpd", "httpd"] },
  { vendor: "VMware", product: "vCenter Server", aliases: ["vmware vcenter", "vcenter"] },
  { vendor: "Palo Alto Networks", product: "PAN-OS", aliases: ["pan-os", "palo alto pan-os", "panos"] },
  { vendor: "F5", product: "BIG-IP", aliases: ["big-ip", "f5 big-ip", "bigip"] },
  { vendor: "Kubernetes", product: "Kubernetes", aliases: ["kubernetes", "k8s"] },
];
const SEARCH_CWE_FAMILY_ALIASES: Array<{ cwe: string; aliases: string[] }> = [
  { cwe: "CWE-79", aliases: ["cross-site scripting", "xss"] },
  { cwe: "CWE-89", aliases: ["sql injection", "sqli"] },
  { cwe: "CWE-78", aliases: ["command injection", "shell injection", "os command injection"] },
  { cwe: "CWE-22", aliases: ["path traversal", "directory traversal"] },
  { cwe: "CWE-287", aliases: ["authentication bypass", "auth bypass"] },
  { cwe: "CWE-918", aliases: ["server-side request forgery", "ssrf"] },
  { cwe: "CWE-502", aliases: ["deserialization", "insecure deserialization"] },
];

export interface DigestInput {
  watchlist: Array<{ id: string; summary?: string; severity?: string }>;
  alerts: Array<{ name: string; unread: number; topMatches: string[] }>;
  projects: Pick<ProjectRecord, "name" | "items" | "updatedAt">[];
}

export interface CveInsightInput {
  detail: CVEDetail;
  epss: EPSSData | null;
  triage: AITriageContextSnapshot | null;
  relatedProjects: Pick<ProjectRecord, "name" | "items" | "updatedAt">[];
}

export type TriageSuggestionInput = CveInsightInput;
export type RemediationPlanInput = CveInsightInput;

export interface WatchlistReviewInput {
  items: Array<{
    id: string;
    summary: string;
    severity: SearchSeverityFilter | "NONE" | "UNKNOWN";
    kev: boolean;
    addedAt: string;
    triageStatus: AITriageContextSnapshot["status"];
    triageUpdatedAt: string;
    projectNames: string[];
    projectUpdatedAt: string | null;
    aliases: string[];
    relatedIds: string[];
    affectedProducts: string[];
    published: string;
    modified: string;
  }>;
  previousReviewAt: string | null;
}

export interface ProjectSummaryInput {
  project: Pick<ProjectRecord, "id" | "name" | "description" | "updatedAt" | "items" | "activity">;
  items: Array<{
    id: string;
    summary: string;
    severity: SearchSeverityFilter | "NONE" | "UNKNOWN";
    kev: boolean;
    triageStatus: AITriageContextSnapshot["status"];
    owner: string;
    affectedProducts: string[];
    published: string;
  }>;
}

export interface AlertInvestigationInput {
  rule: {
    id: string;
    name: string;
    lastCheckedAt: string | null;
    search: SearchState;
  };
  matches: Array<{
    id: string;
    summary: string;
    severity: SearchSeverityFilter | "NONE" | "UNKNOWN";
    kev: boolean;
    published: string;
    modified: string;
    unread: boolean;
  }>;
}

export interface ExposureAssessmentInput {
  detail: CVEDetail;
  triage: AITriageContextSnapshot | null;
  relatedProjects: Pick<ProjectRecord, "name" | "items" | "updatedAt">[];
  inventoryAssets: Array<{
    id: string;
    name: string;
    vendor: string;
    product: string;
    version: string;
    environment: string;
    criticality: "critical" | "high" | "medium" | "low";
    notes: string;
  }>;
}

export interface ServerAIConfigurationSummary {
  provider: AIProvider;
  model: string;
  mode: "heuristic" | "configured";
  configured: boolean;
  availableProviders: AIProvider[];
  redactionEnabledForExternalModels: boolean;
  sensitiveDataAllowedToModels: boolean;
  featureConfigurations: Array<{
    feature: AIFeature;
    provider: AIProvider;
    model: string;
    mode: "heuristic" | "configured";
    configured: boolean;
  }>;
  promptTemplates: Array<{
    feature: AIFeature;
    version: string;
    description: string;
  }>;
  toolRegistry: Array<{
    name: string;
    description: string;
    access: "read" | "write";
    features: AIFeature[];
  }>;
}

interface AIRuntimeSettings {
  provider: AIProvider;
  model: string;
  apiKey: string;
  mode: "heuristic" | "configured";
}

interface StructuredTask<T> {
  feature: AIFeature;
  prompt: string;
  fallback: () => T;
  sanitize: (value: unknown) => T;
  toolCalls?: AISearchToolTrace[];
}

interface SearchToolContext {
  prompt: string;
  lower: string;
}

interface SearchFilterCatalog {
  fields: AISearchFilterField[];
  minSeverity: SearchSeverityFilter[];
  sort: SearchSortOption[];
}

interface ExtractedPromptSignals {
  query: string;
  vendor: string;
  product: string;
  cwe: string;
  minSeverity: SearchSeverityFilter;
  sort: SearchSortOption;
  assumptions: string[];
}

interface RelativeTimeSignal {
  since: string;
  label: string;
}

interface ClarificationSignal {
  needsClarification: boolean;
  clarificationQuestion: string;
}

interface SearchToolOutputs {
  catalog: SearchFilterCatalog;
  extracted: ExtractedPromptSignals;
  time: RelativeTimeSignal;
  clarification: ClarificationSignal;
}

interface SearchPlanningResult {
  outputs: SearchToolOutputs;
  toolCalls: AISearchToolTrace[];
}

export function getServerAIConfigurationSummary(): ServerAIConfigurationSummary {
  const runtime = resolveAIRuntime();
  const availableProviders: AIProvider[] = [];

  if (process.env.OPENAI_API_KEY) {
    availableProviders.push("openai");
  }

  if (process.env.ANTHROPIC_API_KEY) {
    availableProviders.push("anthropic");
  }

  return {
    provider: runtime.provider,
    model: runtime.model,
    mode: runtime.mode,
    configured: runtime.mode === "configured",
    availableProviders,
    redactionEnabledForExternalModels: !isSensitiveModelDataAllowed(),
    sensitiveDataAllowedToModels: isSensitiveModelDataAllowed(),
    promptTemplates: listPromptTemplates(),
    toolRegistry: listAITools(),
    featureConfigurations: AI_FEATURES.map((feature) => {
      const featureRuntime = resolveAIRuntime(feature);

      return {
        feature,
        provider: featureRuntime.provider,
        model: featureRuntime.model,
        mode: featureRuntime.mode,
        configured: featureRuntime.mode === "configured",
      };
    }),
  };
}

export async function getRecentAIRuns(limit = 25): Promise<AIRunRecord[]> {
  return listRecentAIRuns(limit);
}

export function preparePromptInputForFeature<T>(feature: AIFeature, input: T): T {
  const runtime = resolveAIRuntime(feature);
  if (!shouldRedactPromptInput(runtime)) {
    return input;
  }

  switch (feature) {
    case "cve_insight":
    case "triage_agent":
    case "remediation_agent":
      return redactCveInsightInput(input as CveInsightInput) as T;
    case "daily_digest":
      return redactDigestInput(input as DigestInput) as T;
    case "watchlist_analyst":
      return redactWatchlistReviewInput(input as WatchlistReviewInput) as T;
    case "project_summary":
      return redactProjectSummaryInput(input as ProjectSummaryInput) as T;
    case "exposure_agent":
      return redactExposureAssessmentInput(input as ExposureAssessmentInput) as T;
    default:
      return input;
  }
}

export async function generateCveInsight(input: CveInsightInput): Promise<AICveInsight> {
  const promptTemplate = getCveInsightPromptTemplate();
  return executeStructuredTask({
    feature: "cve_insight",
    prompt: promptTemplate.build(preparePromptInputForFeature("cve_insight", input)),
    fallback: () => buildHeuristicCveInsight(input),
    sanitize: sanitizeInsight,
    toolCalls: [{ tool: "prompt_template", summary: `${promptTemplate.feature}@${promptTemplate.version}` }],
  });
}

export async function generateTriageSuggestion(input: TriageSuggestionInput): Promise<AITriageSuggestion> {
  const promptTemplate = getTriageAgentPromptTemplate();
  return executeStructuredTask({
    feature: "triage_agent",
    prompt: promptTemplate.build(preparePromptInputForFeature("triage_agent", input)),
    fallback: () => buildHeuristicTriageSuggestion(input),
    sanitize: sanitizeTriageSuggestion,
    toolCalls: [{ tool: "prompt_template", summary: `${promptTemplate.feature}@${promptTemplate.version}` }],
  });
}

export async function generateRemediationPlan(input: RemediationPlanInput): Promise<AIRemediationPlan> {
  const promptTemplate = getRemediationAgentPromptTemplate();
  return executeStructuredTask({
    feature: "remediation_agent",
    prompt: promptTemplate.build(preparePromptInputForFeature("remediation_agent", input)),
    fallback: () => buildHeuristicRemediationPlan(input),
    sanitize: sanitizeRemediationPlan,
    toolCalls: [{ tool: "prompt_template", summary: `${promptTemplate.feature}@${promptTemplate.version}` }],
  });
}

export async function generateWatchlistReview(input: WatchlistReviewInput): Promise<AIWatchlistReview> {
  const promptTemplate = getWatchlistAnalystPromptTemplate();
  return executeStructuredTask({
    feature: "watchlist_analyst",
    prompt: promptTemplate.build(preparePromptInputForFeature("watchlist_analyst", input)),
    fallback: () => buildHeuristicWatchlistReview(input),
    sanitize: sanitizeWatchlistReview,
    toolCalls: [{ tool: "prompt_template", summary: `${promptTemplate.feature}@${promptTemplate.version}` }],
  });
}

export async function generateProjectSummary(input: ProjectSummaryInput): Promise<AIProjectSummary> {
  const promptTemplate = getProjectSummaryPromptTemplate();
  return executeStructuredTask({
    feature: "project_summary",
    prompt: promptTemplate.build(preparePromptInputForFeature("project_summary", input)),
    fallback: () => buildHeuristicProjectSummary(input),
    sanitize: sanitizeProjectSummary,
    toolCalls: [{ tool: "prompt_template", summary: `${promptTemplate.feature}@${promptTemplate.version}` }],
  });
}

export async function generateAlertInvestigation(input: AlertInvestigationInput): Promise<AIAlertInvestigation> {
  const promptTemplate = getAlertInvestigationPromptTemplate();
  return executeStructuredTask({
    feature: "alert_investigation",
    prompt: promptTemplate.build(preparePromptInputForFeature("alert_investigation", input)),
    fallback: () => buildHeuristicAlertInvestigation(input),
    sanitize: sanitizeAlertInvestigation,
    toolCalls: [{ tool: "prompt_template", summary: `${promptTemplate.feature}@${promptTemplate.version}` }],
  });
}

export async function generateExposureAssessment(input: ExposureAssessmentInput): Promise<AIExposureAssessment> {
  const promptTemplate = getExposureAgentPromptTemplate();
  return executeStructuredTask({
    feature: "exposure_agent",
    prompt: promptTemplate.build(preparePromptInputForFeature("exposure_agent", input)),
    fallback: () => buildHeuristicExposureAssessment(input),
    sanitize: sanitizeExposureAssessment,
    toolCalls: [{ tool: "prompt_template", summary: `${promptTemplate.feature}@${promptTemplate.version}` }],
  });
}

export async function generateSearchInterpretation(prompt: string): Promise<AISearchInterpretation> {
  const plan = runSearchPlanning(prompt);
  const heuristic = buildSearchInterpretationFromPlan(prompt, plan);
  const runtime = resolveAIRuntime("search_assistant");
  const startedAt = Date.now();
  const promptTemplate = getSearchAssistantPromptTemplate();
  const promptTemplateTrace = { tool: "prompt_template", summary: `${promptTemplate.feature}@${promptTemplate.version}` };

  if (runtime.mode === "heuristic") {
    await persistAIRun({
      feature: "search_assistant",
      runtime,
      status: "fallback",
      prompt,
      output: JSON.stringify(heuristic),
      toolCalls: [...plan.toolCalls, promptTemplateTrace],
      durationMs: Date.now() - startedAt,
      error: "",
    });
    return heuristic;
  }

  try {
    const response = await callModel(
      promptTemplate.build({ request: prompt, toolOutputs: plan.outputs }),
      runtime,
      "search_assistant"
    );

    const parsed = sanitizeSearchInterpretation(parseModelJSON(response, "search_assistant"), heuristic);
    const result = {
      ...parsed,
      toolCalls: [...plan.toolCalls, promptTemplateTrace],
    };
    await persistAIRun({
      feature: "search_assistant",
      runtime,
      status: "success",
      prompt,
      output: JSON.stringify(result),
      toolCalls: [...plan.toolCalls, promptTemplateTrace],
      durationMs: Date.now() - startedAt,
      error: "",
    });
    return result;
  } catch {
    await persistAIRun({
      feature: "search_assistant",
      runtime,
      status: "fallback",
      prompt,
      output: JSON.stringify(heuristic),
      toolCalls: [...plan.toolCalls, promptTemplateTrace],
      durationMs: Date.now() - startedAt,
      error: "model_generation_failed",
    });
    return heuristic;
  }
}

export async function generateDigest(input: DigestInput): Promise<AIDigest> {
  const promptTemplate = getDailyDigestPromptTemplate();
  return executeStructuredTask({
    feature: "daily_digest",
    prompt: promptTemplate.build(preparePromptInputForFeature("daily_digest", input)),
    fallback: () => buildHeuristicDigest(input),
    sanitize: sanitizeDigest,
    toolCalls: [{ tool: "prompt_template", summary: `${promptTemplate.feature}@${promptTemplate.version}` }],
  });
}

export function buildHeuristicCveInsight(input: CVEDetail | CveInsightInput): AICveInsight {
  const normalized = normalizeCveInsightInput(input);
  const { detail, epss, triage, relatedProjects } = normalized;
  const id = extractCVEId(detail);
  const severityScore = detail.cvss3 ?? detail.cvss;
  const severity = getSeverityFromScore(severityScore);
  const description = extractDescription(detail);
  const affected = detail.containers?.cna?.affected?.slice(0, 3) ?? [];
  const aliases = detail.aliases ?? [];
  const relatedIds = extractRelatedIds(detail);
  const referenceSummary = summarizeReferences(detail);
  const projectContext = buildProjectContext(relatedProjects);
  const signals = buildTriageSignals({ severity, severityScore, epss, referenceSummary, triage, projectContext, affected });
  const priority = derivePriority(severity, epss, referenceSummary, projectContext.projectCount);
  const status = deriveStatus(priority, triage?.status);
  const confidence = deriveConfidence(severityScore, epss, referenceSummary);

  return {
    summary: `${id} is a ${severity.toLowerCase()} severity vulnerability${affected.length ? ` affecting ${affected.map((item) => item.product || item.vendor).filter(Boolean).join(", ")}` : ""}. ${truncateSentence(description)}`,
    triage: {
      priority,
      status,
      confidence,
      ownerRecommendation: triage?.owner ? `Keep ${triage.owner} as the current owner unless product ownership has changed.` : projectContext.projectCount > 0 ? "Assign the owning engineering or service team tied to the impacted project." : "Assign a security or service owner before remediation work begins.",
      rationale:
        buildTriageRationale({ priority, epss, referenceSummary, projectContext, triage }),
      nextSteps: [
        "Confirm whether the affected product or version exists in your environment.",
        referenceSummary.patchCount > 0 ? "Review the available patch or advisory references and determine the rollout path." : "Review upstream references for patches, advisories, or mitigation guidance.",
        projectContext.projectCount > 0 ? "Coordinate remediation with the linked project owners and track the rollout decision." : "Track ownership and remediation notes in triage before closing the issue.",
      ],
      signals,
    },
    remediation: [
      "Identify exposed versions and compare them against vendor-fixed releases.",
      referenceSummary.patchCount > 0 ? "Apply the vendor patch path first, then fall back to compensating controls where rollout timing is constrained." : "Apply patches or compensating controls where an immediate upgrade is not possible.",
      "Validate remediation with version checks, changelog confirmation, or environment-specific testing.",
    ],
    cluster: {
      canonicalId: id,
      sourceIds: aliases.filter((alias) => alias !== id),
      relatedIds,
      summary:
        relatedIds.length > 0
          ? "This issue appears alongside linked advisories or aliases and should be reviewed as part of a broader context cluster."
          : "This issue currently stands alone in the available alias and linked-vulnerability context.",
    },
    projectContext,
  };
}

export function buildHeuristicTriageSuggestion(input: TriageSuggestionInput | CVEDetail): AITriageSuggestion {
  const normalized = normalizeCveInsightInput(input as CVEDetail | CveInsightInput);
  const insight = buildHeuristicCveInsight(normalized);
  const tags = buildRecommendedTags(normalized.detail, normalized.epss, normalized.triage, normalized.relatedProjects);

  return {
    summary: insight.summary,
    recommendation: insight.triage,
    recommendedTags: tags,
    recommendedOwner: deriveSuggestedOwner(normalized.triage, normalized.relatedProjects),
    ownershipRationale: normalized.triage?.owner
      ? `Keep ${normalized.triage.owner} unless product ownership has changed, because this CVE is already being handled in the current workflow.`
      : insight.triage.ownerRecommendation,
    projectContext: insight.projectContext,
    requiresHumanApproval: true,
  };
}

export function buildHeuristicRemediationPlan(input: RemediationPlanInput | CVEDetail): AIRemediationPlan {
  const normalized = normalizeCveInsightInput(input as CVEDetail | CveInsightInput);
  const insight = buildHeuristicCveInsight(normalized);
  const referenceSummary = summarizeReferences(normalized.detail);
  const severity = getSeverityFromScore(normalized.detail.cvss3 ?? normalized.detail.cvss);
  const affectedProducts = (normalized.detail.containers?.cna?.affected ?? [])
    .map((item) => item.product || item.vendor)
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
  const internetFacing =
    normalized.triage?.tags.some((tag) => /internet-facing/i.test(tag)) ||
    /internet|remote|network|gateway|edge/i.test(extractDescription(normalized.detail));
  const recommendedOwner = deriveSuggestedOwner(normalized.triage, normalized.relatedProjects);

  return {
    summary: `${extractCVEId(normalized.detail)} remediation should start with ${referenceSummary.patchCount > 0 ? "vendor patch validation" : "version exposure validation"}${affectedProducts.length > 0 ? ` for ${affectedProducts.join(", ")}` : ""}.`,
    strategy:
      referenceSummary.patchCount > 0
        ? "Validate the vendor-fixed release path first, then schedule rollout through the owning service team with a fallback to compensating controls if change windows are constrained."
        : "Confirm affected versions in the environment, define an upgrade or isolation plan, and use compensating controls until a stable fix path is available.",
    compensatingControls: [
      internetFacing ? "Prioritize edge filtering, WAF or reverse-proxy rules, and temporary exposure reduction for internet-facing entry points." : "Reduce exposure by limiting access to affected services while remediation is in progress.",
      severity === "CRITICAL" || severity === "HIGH"
        ? "Increase logging and detection coverage for exploit attempts tied to the vulnerable component."
        : "Add targeted monitoring around the vulnerable component to catch failed or suspicious access patterns.",
      referenceSummary.patchCount > 0
        ? "If rollout must wait, apply vendor-recommended mitigations from the published advisory references."
        : "Document temporary configuration changes, feature flags, or service isolation steps that reduce exploitability.",
    ],
    validationSteps: [
      "Inventory deployed versions and confirm which environments actually run an affected build.",
      referenceSummary.patchCount > 0 ? "Verify the selected fixed release or advisory guidance applies to each affected deployment path." : "Confirm the target upgrade or mitigation path with the owning engineering team before rollout.",
      "Validate remediation with version checks, smoke tests, and review of logs or telemetry after deployment.",
    ],
    rolloutNotes: [
      normalized.relatedProjects.length > 0
        ? `Coordinate rollout with the linked projects: ${normalized.relatedProjects.map((project) => project.name).slice(0, 3).join(", ")}.`
        : "Capture rollout ownership before making production changes.",
      insight.triage.priority === "critical" || normalized.detail.kev
        ? "Use the fastest approved change path and communicate urgency because severity or exploitation signals are elevated."
        : "Prefer staged deployment with checkpoints for validation and rollback readiness.",
      normalized.triage?.notes
        ? `Preserve existing analyst notes during rollout: ${truncateSentence(normalized.triage.notes, 140)}`
        : "Record validation evidence and any residual risk decisions in triage notes after rollout.",
    ],
    changeRisk: insight.triage.priority === "critical" || normalized.relatedProjects.length > 1 ? "high" : insight.triage.priority === "high" ? "medium" : "low",
    recommendedOwner,
    ownerRationale: normalized.triage?.owner
      ? `Keep ${normalized.triage.owner} as remediation owner so the rollout stays aligned with the current analyst workflow.`
      : normalized.relatedProjects.length > 0
        ? `Use the owning team for ${normalized.relatedProjects[0].name} because that project is already linked to the affected CVE.`
        : "Assign the security or service owner who can validate exposure and coordinate the change window.",
    projectContext: insight.projectContext,
    requiresHumanApproval: true,
  };
}

export function buildHeuristicWatchlistReview(input: WatchlistReviewInput): AIWatchlistReview {
  const reviewedAt = new Date().toISOString();
  const sortedItems = [...input.items].sort((left, right) => compareWatchlistRisk(right, left));
  const previousReviewAt = input.previousReviewAt;
  const newMatches = previousReviewAt
    ? sortedItems.filter((item) => item.addedAt > previousReviewAt)
    : sortedItems.slice(0, Math.min(sortedItems.length, 5));
  const changedItems = previousReviewAt
    ? sortedItems.filter((item) => {
        const projectChanged = item.projectUpdatedAt ? item.projectUpdatedAt > previousReviewAt : false;
        return item.triageUpdatedAt > previousReviewAt || projectChanged || item.modified > previousReviewAt;
      })
    : [];
  const clusters = buildWatchlistClusters(sortedItems);
  const trackedHighRisk = sortedItems.filter((item) => item.kev || item.severity === "CRITICAL" || item.severity === "HIGH").length;

  return {
    headline:
      newMatches.length > 0
        ? `${newMatches.length} watchlist ${newMatches.length === 1 ? "change" : "changes"} need review`
        : trackedHighRisk > 0
          ? `${trackedHighRisk} high-risk watchlist ${trackedHighRisk === 1 ? "item" : "items"} remain active`
          : `Watchlist review covers ${sortedItems.length} tracked ${sortedItems.length === 1 ? "item" : "items"}`,
    summary: previousReviewAt
      ? `Compared the current watchlist against the last saved review from ${new Date(previousReviewAt).toLocaleString("en-US")}. Focus on newly added matches, triage changes, and related clusters that may need coordinated handling.`
      : "No prior watchlist review was saved, so this pass establishes a first analyst baseline from the current tracked items.",
    newMatches: newMatches.slice(0, 6).map((item) => `${item.id} • ${buildWatchlistItemSummary(item)}`),
    changedSinceLastReview: changedItems.slice(0, 8).map((item) => {
      const reasons: string[] = [];
      if (previousReviewAt && item.triageUpdatedAt > previousReviewAt) {
        reasons.push(`triage is now ${item.triageStatus}`);
      }
      if (previousReviewAt && item.projectUpdatedAt && item.projectUpdatedAt > previousReviewAt) {
        reasons.push(`project context changed (${item.projectNames.join(", ")})`);
      }
      if (previousReviewAt && item.modified > previousReviewAt) {
        reasons.push("upstream record was updated");
      }
      return `${item.id} • ${reasons.join("; ") || buildWatchlistItemSummary(item)}`;
    }),
    clusters,
    recommendedActions: buildWatchlistActions(sortedItems, newMatches, changedItems, clusters),
    previousReviewAt,
    reviewedAt,
  };
}

export function buildHeuristicProjectSummary(input: ProjectSummaryInput): AIProjectSummary {
  const criticalCount = input.items.filter((item) => item.severity === "CRITICAL").length;
  const highCount = input.items.filter((item) => item.severity === "HIGH").length;
  const kevCount = input.items.filter((item) => item.kev).length;
  const investigatingCount = input.items.filter((item) => item.triageStatus === "investigating").length;
  const topProducts = Array.from(new Set(input.items.flatMap((item) => item.affectedProducts))).slice(0, 3);
  const owners = Array.from(new Set(input.items.map((item) => item.owner).filter(Boolean))).slice(0, 4);
  const newest = [...input.items]
    .sort((left, right) => (right.published || "").localeCompare(left.published || ""))
    .slice(0, 3)
    .map((item) => item.id);

  return {
    projectName: input.project.name,
    overview: `${input.project.name} tracks ${input.items.length} ${input.items.length === 1 ? "vulnerability" : "vulnerabilities"}${topProducts.length > 0 ? ` across ${topProducts.join(", ")}` : ""}.`,
    executive: {
      headline: criticalCount > 0 || kevCount > 0 ? "Immediate leadership attention recommended" : "Project risk is active but bounded",
      summary: criticalCount > 0 || kevCount > 0
        ? `${input.project.name} includes ${criticalCount} critical ${criticalCount === 1 ? "issue" : "issues"} and ${kevCount} known-exploited ${kevCount === 1 ? "entry" : "entries"}, so remediation urgency and ownership should stay visible.`
        : `${input.project.name} currently centers on ${highCount} high-severity ${highCount === 1 ? "item" : "items"} with ongoing analyst follow-up.`,
      bullets: [
        `${input.items.length} total tracked ${input.items.length === 1 ? "item" : "items"} in the project workspace.`,
        investigatingCount > 0 ? `${investigatingCount} ${investigatingCount === 1 ? "item is" : "items are"} actively investigating.` : "No items are currently marked as investigating.",
        owners.length > 0 ? `Current ownership spans ${owners.join(", ")}.` : "Ownership is still loosely defined across the project.",
      ],
    },
    analyst: {
      headline: "Analyst queue and workflow focus",
      summary: newest.length > 0
        ? `Start with ${newest.join(", ")} and confirm whether triage state, project notes, and remediation plans still match current exposure.`
        : "Review triage state and confirm the project still reflects the right incident grouping.",
      bullets: [
        criticalCount > 0 ? `Prioritize the ${criticalCount} critical ${criticalCount === 1 ? "entry" : "entries"} for coordination and status checks.` : "No critical entries are present in this project right now.",
        kevCount > 0 ? `Reconfirm exploit exposure and mitigation posture for ${kevCount} known-exploited ${kevCount === 1 ? "item" : "items"}.` : "No KEV-linked items are currently in the project.",
        input.project.activity.length > 0 ? `Recent project activity suggests active coordination since ${new Date(input.project.activity[0].createdAt).toLocaleString("en-US")}.` : "Project activity history is still minimal.",
      ],
    },
    engineering: {
      headline: "Engineering rollout view",
      summary: topProducts.length > 0
        ? `Plan remediation by affected product area: ${topProducts.join(", ")}, and keep rollout notes aligned with existing project tracking.`
        : "Use the project list to align engineering rollout sequencing with current remediation ownership.",
      bullets: [
        owners.length > 0 ? `Coordinate implementation with ${owners.join(", ")}.` : "Assign a concrete engineering owner before scheduling rollout work.",
        highCount > 0 || criticalCount > 0 ? "Bundle high-severity and critical changes into a prioritized rollout path with validation checkpoints." : "Treat remaining work as normal-priority remediation unless exposure changes.",
        newest.length > 0 ? `Validate the newest impacted entries first: ${newest.join(", ")}.` : "Keep version validation and deployment checks attached to each project item.",
      ],
    },
    metrics: {
      totalItems: input.items.length,
      criticalCount,
      highCount,
      kevCount,
      investigatingCount,
    },
  };
}

export function buildHeuristicAlertInvestigation(input: AlertInvestigationInput): AIAlertInvestigation {
  const unreadMatches = input.matches.filter((item) => item.unread);
  const topMatches = input.matches.slice(0, 3);
  const whyMatched = [
    input.rule.search.query ? `The rule keeps matches whose text or aliases include ${input.rule.search.query}.` : "The rule evaluates the saved search filters against the latest upstream CVE sample.",
    input.rule.search.product ? `Product filtering is scoped to ${input.rule.search.product}.` : "The rule is not restricted to a single product filter.",
    input.rule.search.minSeverity !== "ANY" ? `Only ${input.rule.search.minSeverity.toLowerCase()} or higher issues qualify for this rule.` : "Severity is not the only reason a match appears, because the rule allows any severity.",
  ].filter(Boolean);

  return {
    ruleName: input.rule.name,
    summary: `${input.rule.name} matched ${input.matches.length} ${input.matches.length === 1 ? "entry" : "entries"}${unreadMatches.length > 0 ? `, including ${unreadMatches.length} unread ${unreadMatches.length === 1 ? "change" : "changes"}` : ""}.`,
    whyMatched,
    topMatches: topMatches.map((match) => ({
      id: match.id,
      summary: match.summary,
      unread: match.unread,
      rationale: buildAlertMatchRationale(match),
    })),
    recommendedAction: unreadMatches.length > 0
      ? `Start with the ${unreadMatches.length} unread ${unreadMatches.length === 1 ? "match" : "matches"} and confirm whether the rule still needs escalation or ownership updates.`
      : "Review the highest-risk matched CVEs, then mark the rule checked if the current set is already covered by triage or remediation work.",
    nextSteps: [
      unreadMatches.length > 0 ? "Inspect unread matches first because they changed since the last time this rule was checked." : "Reconfirm whether the current matches are already reflected in triage or project tracking.",
      topMatches.length > 0 ? `Validate the top matched CVEs: ${topMatches.map((item) => item.id).join(", ")}.` : "No top matches were available from the current sample.",
      input.matches.some((item) => item.kev) ? "Escalate any known-exploited matches into the active analyst queue immediately." : "If no exploit-linked signals exist, keep follow-up proportional to severity and recency.",
    ],
  };
}

function buildAlertMatchRationale(match: AlertInvestigationInput["matches"][number]): string {
  const parts = [`severity ${match.severity.toLowerCase()}`];

  if (match.kev) {
    parts.push("known exploited");
  }

  if (match.unread) {
    parts.push("new since the last rule check");
  }

  return parts.join(" • ");
}

export function buildHeuristicExposureAssessment(input: ExposureAssessmentInput): AIExposureAssessment {
  const severity = getSeverityFromScore(input.detail.cvss3 ?? input.detail.cvss);
  const productSignals = new Set<string>([
    ...(input.detail.vulnerable_product ?? []),
    ...((input.detail.containers?.cna?.affected ?? []).flatMap((item) => [item.vendor, item.product].filter((value): value is string => Boolean(value)))),
  ].map((value) => value.toLowerCase()));
  const matchedAssets = input.inventoryAssets.flatMap((asset) => {
    const signals: string[] = [];
    const vendor = asset.vendor.toLowerCase();
    const product = asset.product.toLowerCase();

    if (vendor && Array.from(productSignals).some((value) => value.includes(vendor))) {
      signals.push(`vendor match: ${asset.vendor}`);
    }

    if (product && Array.from(productSignals).some((value) => value.includes(product))) {
      signals.push(`product match: ${asset.product}`);
    }

    const noteSignal = asset.notes && /internet|public|customer|edge|prod/i.test(asset.notes)
      ? [`asset note suggests exposure: ${truncateSentence(asset.notes, 80)}`]
      : [];
    signals.push(...noteSignal);

    if (signals.length === 0) {
      return [];
    }

    const confidence: "high" | "medium" | "low" = signals.length > 1 ? "high" : asset.vendor || asset.product ? "medium" : "low";

    return [{
      assetId: asset.id,
      assetName: asset.name,
      confidence,
      rationale: `${asset.name} matches the CVE metadata through ${signals.join(", ")}.`,
      matchingSignals: signals,
      criticality: asset.criticality,
      environment: asset.environment,
    }];
  });

  const highestCriticality = matchedAssets.some((asset) => asset.criticality === "critical")
    ? "critical"
    : matchedAssets.some((asset) => asset.criticality === "high")
      ? "high"
      : matchedAssets.some((asset) => asset.criticality === "medium")
        ? "medium"
        : "low";
  const likelyImpact = input.detail.kev || severity === "CRITICAL"
    ? highestCriticality === "low" ? "high" : highestCriticality
    : severity === "HIGH"
      ? highestCriticality === "critical" ? "critical" : highestCriticality === "low" ? "medium" : highestCriticality
      : matchedAssets.length > 0 ? highestCriticality : "low";

  return {
    summary: matchedAssets.length > 0
      ? `${extractCVEId(input.detail)} likely affects ${matchedAssets.length} tracked ${matchedAssets.length === 1 ? "asset" : "assets"}, with ${likelyImpact} estimated internal impact.`
      : `${extractCVEId(input.detail)} does not currently match tracked inventory assets, so likely internal impact remains low until more asset data is mapped.`,
    likelyImpact,
    matchedAssets: matchedAssets.map((asset) => ({
      assetId: asset.assetId,
      assetName: asset.assetName,
      confidence: asset.confidence,
      rationale: asset.rationale,
      matchingSignals: asset.matchingSignals,
    })).slice(0, 6),
    rationale: [
      matchedAssets.length > 0
        ? `Inventory matching found ${matchedAssets.length} asset ${matchedAssets.length === 1 ? "mapping" : "mappings"} using vendor, product, and environment notes.`
        : "No vendor or product overlap was found between the CVE metadata and your tracked inventory assets.",
      input.relatedProjects.length > 0
        ? `The CVE is also linked to ${input.relatedProjects.length} tracked ${input.relatedProjects.length === 1 ? "project" : "projects"}, which increases confidence that the issue matters internally.`
        : "No tracked project is currently linked to this CVE.",
      input.triage?.status === "investigating"
        ? "The current triage state is already investigating, which suggests this issue has active analyst attention."
        : "Triage state does not yet confirm active internal investigation.",
    ],
    recommendedActions: [
      matchedAssets.length > 0
        ? `Confirm deployed versions for ${matchedAssets.slice(0, 3).map((asset) => asset.assetName).join(", ")} and attach evidence to triage notes.`
        : "Add or refine inventory mappings for key vendors and products so exposure decisions do not rely on inference alone.",
      input.detail.kev || severity === "CRITICAL"
        ? "Escalate validation for internet-facing or business-critical systems before the next review cycle."
        : "Validate whether the vulnerable component is present before committing remediation time.",
      input.relatedProjects.length > 0
        ? "Coordinate with the owning project teams to confirm whether the matched assets are part of active remediation plans."
        : "Link the CVE to a project if remediation work becomes active.",
    ],
  };
}

function shouldRedactPromptInput(runtime: AIRuntimeSettings): boolean {
  return runtime.provider !== "heuristic" && !isSensitiveModelDataAllowed();
}

function isSensitiveModelDataAllowed(): boolean {
  return process.env.AI_ALLOW_SENSITIVE_MODEL_DATA === "true";
}

function redactCveInsightInput(input: CveInsightInput): CveInsightInput {
  return {
    ...input,
    triage: input.triage
      ? {
          ...input.triage,
          owner: redactSensitiveString(input.triage.owner, "[redacted owner]"),
          notes: redactSensitiveString(input.triage.notes, "[redacted analyst notes]"),
        }
      : input.triage,
    relatedProjects: input.relatedProjects.map((project, index) => ({
      name: maskProjectName(index),
      updatedAt: project.updatedAt,
      items: project.items.map((item) => ({ cveId: item.cveId, addedAt: item.addedAt })),
    })),
  };
}

function redactDigestInput(input: DigestInput): DigestInput {
  return {
    ...input,
    projects: input.projects.map((project, index) => ({
      name: maskProjectName(index),
      updatedAt: project.updatedAt,
      items: project.items.map((item) => ({ cveId: item.cveId, addedAt: item.addedAt })),
    })),
  };
}

function redactWatchlistReviewInput(input: WatchlistReviewInput): WatchlistReviewInput {
  return {
    ...input,
    items: input.items.map((item) => ({
      ...item,
      projectNames: item.projectNames.map((_, index) => maskProjectName(index)),
    })),
  };
}

function redactProjectSummaryInput(input: ProjectSummaryInput): ProjectSummaryInput {
  return {
    project: {
      ...input.project,
      name: "[redacted project]",
      description: redactSensitiveString(input.project.description, "[redacted project description]"),
      activity: input.project.activity.map((entry, index) => ({
        ...entry,
        summary: `[redacted activity ${index + 1}]`,
      })),
    },
    items: input.items.map((item) => ({
      ...item,
      owner: redactSensitiveString(item.owner, "[redacted owner]"),
    })),
  };
}

function redactExposureAssessmentInput(input: ExposureAssessmentInput): ExposureAssessmentInput {
  return {
    ...input,
    triage: input.triage
      ? {
          ...input.triage,
          owner: redactSensitiveString(input.triage.owner, "[redacted owner]"),
          notes: redactSensitiveString(input.triage.notes, "[redacted analyst notes]"),
        }
      : input.triage,
    relatedProjects: input.relatedProjects.map((project, index) => ({
      name: maskProjectName(index),
      updatedAt: project.updatedAt,
      items: project.items.map((item) => ({ cveId: item.cveId, addedAt: item.addedAt })),
    })),
    inventoryAssets: input.inventoryAssets.map((asset, index) => ({
      ...asset,
      name: `Tracked asset ${index + 1}`,
      notes: redactSensitiveString(asset.notes, "[redacted asset notes]"),
    })),
  };
}

function maskProjectName(index: number): string {
  return `Tracked project ${index + 1}`;
}

function redactSensitiveString(value: string, replacement: string): string {
  return value.trim() ? replacement : value;
}

function normalizeCveInsightInput(input: CVEDetail | CveInsightInput): CveInsightInput {
  if ("detail" in input) {
    return input;
  }

  return {
    detail: input,
    epss: null,
    triage: null,
    relatedProjects: [],
  };
}

function summarizeReferences(detail: CVEDetail): {
  totalCount: number;
  exploitCount: number;
  patchCount: number;
} {
  const urls = [
    ...(detail.references ?? []),
    ...((detail.containers?.cna?.references ?? []).flatMap((reference) => (typeof reference.url === "string" ? [reference.url] : []))),
  ];
  const tags = (detail.containers?.cna?.references ?? []).flatMap((reference) =>
    Array.isArray(reference.tags) ? reference.tags.filter((tag): tag is string => typeof tag === "string") : []
  );
  const combined = [...urls, ...tags].map((value) => value.toLowerCase());

  return {
    totalCount: urls.length,
    exploitCount: combined.filter((value) => /exploit|proof|poc|weapon/i.test(value)).length,
    patchCount: combined.filter((value) => /patch|fix|release|advisory|mitigation/i.test(value)).length,
  };
}

function buildProjectContext(projects: Pick<ProjectRecord, "name" | "items" | "updatedAt">[]): AICveInsight["projectContext"] {
  const projectNames = projects.map((project) => project.name).slice(0, 5);

  return {
    projectCount: projects.length,
    projectNames,
    summary:
      projects.length > 0
        ? `This CVE is already tracked in ${projects.length} project${projects.length === 1 ? "" : "s"}: ${projectNames.join(", ")}.`
        : "This CVE is not currently linked to any tracked project.",
  };
}

function buildRecommendedTags(
  detail: CVEDetail,
  epss: EPSSData | null,
  triage: AITriageContextSnapshot | null,
  projects: Pick<ProjectRecord, "name" | "items" | "updatedAt">[]
): string[] {
  const tags = new Set<string>();

  const severity = getSeverityFromScore(detail.cvss3 ?? detail.cvss);
  if (severity === "CRITICAL" || severity === "HIGH") {
    tags.add(severity.toLowerCase());
  }

  if (detail.kev) {
    tags.add("kev");
  }

  if ((epss?.percentile ?? 0) >= 0.9) {
    tags.add("high-epss");
  }

  if (triage?.tags.some((tag) => /internet-facing/i.test(tag)) || (extractDescription(detail).match(/internet|remote|network/i))) {
    tags.add("internet-facing");
  }

  if (projects.length > 0) {
    tags.add("project-tracked");
  }

  if (summarizeReferences(detail).patchCount > 0) {
    tags.add("patch-available");
  }

  return Array.from(tags).slice(0, 5);
}

function deriveSuggestedOwner(
  triage: AITriageContextSnapshot | null,
  projects: Pick<ProjectRecord, "name" | "items" | "updatedAt">[]
): string {
  if (triage?.owner) {
    return triage.owner;
  }

  if (projects.length > 0) {
    return `${projects[0].name} owner`;
  }

  return "Security triage";
}

function compareWatchlistRisk(left: WatchlistReviewInput["items"][number], right: WatchlistReviewInput["items"][number]): number {
  return scoreWatchlistItem(left) - scoreWatchlistItem(right);
}

function scoreWatchlistItem(item: WatchlistReviewInput["items"][number]): number {
  const severityScore = item.severity === "CRITICAL"
    ? 5
    : item.severity === "HIGH"
      ? 4
      : item.severity === "MEDIUM"
        ? 3
        : item.severity === "LOW"
          ? 2
          : 1;

  return severityScore + (item.kev ? 3 : 0) + (item.projectNames.length > 0 ? 1 : 0) + (item.triageStatus === "new" ? 1 : 0);
}

function buildWatchlistItemSummary(item: WatchlistReviewInput["items"][number]): string {
  const parts = [item.severity.toLowerCase()];

  if (item.kev) {
    parts.push("KEV");
  }

  if (item.projectNames.length > 0) {
    parts.push(`projects: ${item.projectNames.join(", ")}`);
  }

  parts.push(`triage: ${item.triageStatus}`);
  return parts.join(" • ");
}

function buildWatchlistClusters(items: WatchlistReviewInput["items"]): AIWatchlistReview["clusters"] {
  const buckets = new Map<string, WatchlistReviewInput["items"]>();

  for (const item of items) {
    const labels = new Set<string>();
    const primaryProduct = item.affectedProducts[0];
    if (primaryProduct) {
      labels.add(primaryProduct.toLowerCase());
    }

    for (const relatedId of item.relatedIds.slice(0, 2)) {
      labels.add(`cluster:${relatedId.toLowerCase()}`);
    }

    for (const label of labels) {
      const current = buckets.get(label) ?? [];
      current.push(item);
      buckets.set(label, current);
    }
  }

  return Array.from(buckets.entries())
    .filter(([, grouped]) => grouped.length > 1)
    .slice(0, 4)
    .map(([label, grouped]) => ({
      label: label.startsWith("cluster:") ? `Linked to ${label.slice("cluster:".length).toUpperCase()}` : label,
      cveIds: Array.from(new Set(grouped.map((item) => item.id))).slice(0, 6),
      summary: label.startsWith("cluster:")
        ? "These watchlist entries share linked-vulnerability context and may belong in the same analyst thread."
        : `These entries share affected product context around ${label} and may benefit from coordinated review.`,
    }));
}

function buildWatchlistActions(
  items: WatchlistReviewInput["items"],
  newMatches: WatchlistReviewInput["items"],
  changedItems: WatchlistReviewInput["items"],
  clusters: AIWatchlistReview["clusters"]
): string[] {
  const actions: string[] = [];

  if (newMatches.length > 0) {
    actions.push(`Triage the ${newMatches.length} newly added watchlist ${newMatches.length === 1 ? "item" : "items"} before the next review cycle.`);
  }

  const activeCritical = items.filter((item) => item.kev || item.severity === "CRITICAL");
  if (activeCritical.length > 0) {
    actions.push(`Reconfirm ownership and remediation status for ${activeCritical.length} critical or known-exploited watchlist ${activeCritical.length === 1 ? "item" : "items"}.`);
  }

  if (clusters.length > 0) {
    actions.push("Review clustered items together so duplicate investigation work and fragmented notes do not accumulate.");
  }

  if (changedItems.length > 0) {
    actions.push("Check the entries with triage or project updates to verify the recent workflow changes still match current exposure.");
  }

  if (actions.length === 0) {
    actions.push("No major deltas were detected; keep the watchlist stable and revisit when new items or workflow changes arrive.");
  }

  return actions.slice(0, 5);
}

function buildTriageSignals(input: {
  severity: ReturnType<typeof getSeverityFromScore>;
  severityScore?: number;
  epss: EPSSData | null;
  referenceSummary: { totalCount: number; exploitCount: number; patchCount: number };
  triage: AITriageContextSnapshot | null;
  projectContext: AICveInsight["projectContext"];
  affected: Array<{ vendor?: string; product?: string }>;
}): AITriageSignal[] {
  const signals: AITriageSignal[] = [];

  signals.push({
    label: "Severity",
    value: input.severityScore ? `${input.severity} (${input.severityScore.toFixed(1)})` : input.severity,
    level: input.severity === "CRITICAL" || input.severity === "HIGH" ? "high" : input.severity === "MEDIUM" ? "medium" : "low",
    rationale: "Severity is derived from the best available CVSS score.",
  });

  if (input.epss) {
    signals.push({
      label: "EPSS",
      value: `${(input.epss.epss * 100).toFixed(2)}% (${(input.epss.percentile * 100).toFixed(1)} percentile)`,
      level: input.epss.percentile >= 0.9 ? "high" : input.epss.percentile >= 0.5 ? "medium" : "low",
      rationale: "EPSS indicates the relative likelihood of exploitation in the wild.",
    });
  }

  if (input.referenceSummary.totalCount > 0) {
    signals.push({
      label: "References",
      value: `${input.referenceSummary.totalCount} refs / ${input.referenceSummary.patchCount} patch-like / ${input.referenceSummary.exploitCount} exploit-like`,
      level: input.referenceSummary.exploitCount > 0 ? "high" : input.referenceSummary.patchCount > 0 ? "medium" : "low",
      rationale: "Reference quality helps distinguish active exploitation discussion from routine disclosure metadata.",
    });
  }

  if (input.projectContext.projectCount > 0) {
    signals.push({
      label: "Project impact",
      value: `${input.projectContext.projectCount} linked project${input.projectContext.projectCount === 1 ? "" : "s"}`,
      level: input.projectContext.projectCount >= 2 ? "high" : "medium",
      rationale: "Existing project linkage suggests known internal relevance and active tracking.",
    });
  }

  if (input.triage) {
    signals.push({
      label: "Analyst workflow",
      value: `${input.triage.status}${input.triage.owner ? ` • ${input.triage.owner}` : ""}`,
      level: input.triage.status === "investigating" ? "high" : input.triage.status === "new" ? "medium" : "low",
      rationale: "Current analyst workflow state should shape the next recommended action instead of overwriting it blindly.",
    });
  }

  if (input.affected.length > 0) {
    signals.push({
      label: "Affected products",
      value: input.affected
        .map((item) => [item.vendor, item.product].filter(Boolean).join("/"))
        .filter(Boolean)
        .slice(0, 3)
        .join(", "),
      level: "medium",
      rationale: "Affected product metadata indicates where to validate exposure first.",
    });
  }

  return signals.slice(0, 5);
}

function derivePriority(
  severity: ReturnType<typeof getSeverityFromScore>,
  epss: EPSSData | null,
  referenceSummary: { totalCount: number; exploitCount: number; patchCount: number },
  projectCount: number
): AICveInsight["triage"]["priority"] {
  if (severity === "CRITICAL") return "critical";
  if (severity === "HIGH" || (epss?.percentile ?? 0) >= 0.9 || referenceSummary.exploitCount > 0) return "high";
  if (severity === "MEDIUM" || (epss?.percentile ?? 0) >= 0.5 || projectCount > 0 || referenceSummary.patchCount > 0) return "medium";
  return "low";
}

function deriveStatus(
  priority: AICveInsight["triage"]["priority"],
  existingStatus?: AITriageContextSnapshot["status"]
): AICveInsight["triage"]["status"] {
  if (existingStatus && existingStatus !== "new") {
    return existingStatus;
  }

  return priority === "critical" || priority === "high" ? "investigating" : existingStatus ?? "new";
}

function deriveConfidence(
  severityScore: number | undefined,
  epss: EPSSData | null,
  referenceSummary: { totalCount: number; exploitCount: number; patchCount: number }
): AICveInsight["triage"]["confidence"] {
  const evidenceCount = Number(Boolean(severityScore)) + Number(Boolean(epss)) + Number(referenceSummary.totalCount > 0);
  if (evidenceCount >= 3) return "high";
  if (evidenceCount === 2) return "medium";
  return "low";
}

function buildTriageRationale(input: {
  priority: AICveInsight["triage"]["priority"];
  epss: EPSSData | null;
  referenceSummary: { totalCount: number; exploitCount: number; patchCount: number };
  projectContext: AICveInsight["projectContext"];
  triage: AITriageContextSnapshot | null;
}): string {
  const reasons: string[] = [];

  reasons.push(`The recommendation is ${input.priority} priority based on the available severity and exploitation signals.`);

  if (input.epss) {
    reasons.push(`EPSS is ${(input.epss.epss * 100).toFixed(2)}% at the ${(input.epss.percentile * 100).toFixed(1)} percentile.`);
  }

  if (input.referenceSummary.exploitCount > 0) {
    reasons.push("Reference metadata includes exploit-like indicators, which raises urgency.");
  } else if (input.referenceSummary.patchCount > 0) {
    reasons.push("Patch or advisory references are already available, which improves remediation readiness.");
  }

  if (input.projectContext.projectCount > 0) {
    reasons.push(input.projectContext.summary);
  }

  if (input.triage?.owner) {
    reasons.push(`The current workflow already names ${input.triage.owner} as owner, so the recommendation preserves that context.`);
  }

  return reasons.join(" ");
}

export function interpretSearchPromptHeuristically(prompt: string): AISearchInterpretation {
  return buildSearchInterpretationFromPlan(prompt, runSearchPlanning(prompt));
}

export function buildHeuristicDigest(input: DigestInput): AIDigest {
  const highestAlert = [...input.alerts].sort((a, b) => b.unread - a.unread)[0];
  const activeProjects = input.projects.filter((project) => project.items.length > 0);

  return {
    headline:
      highestAlert && highestAlert.unread > 0
        ? `${highestAlert.unread} unread matches in ${highestAlert.name}`
        : `Tracking ${input.watchlist.length} watchlist items across ${activeProjects.length} projects`,
    sections: [
      {
        title: "Watchlist",
        body: `You have ${input.watchlist.length} tracked vulnerabilities in the current profile.`,
        items: input.watchlist.slice(0, 5).map((item) => item.id),
      },
      {
        title: "Alerts",
        body:
          input.alerts.length > 0
            ? `${input.alerts.filter((item) => item.unread > 0).length} alert rules currently have unread matches.`
            : "No alert rules are configured yet.",
        items: input.alerts.slice(0, 5).map((item) => `${item.name}: ${item.unread} unread`),
      },
      {
        title: "Projects",
        body:
          activeProjects.length > 0
            ? `${activeProjects.length} projects currently contain tracked CVEs.`
            : "No projects contain tracked CVEs yet.",
        items: activeProjects.slice(0, 5).map((project) => `${project.name}: ${project.items.length} CVEs`),
      },
    ],
  };
}

async function executeStructuredTask<T>({ feature, prompt, fallback, sanitize, toolCalls = [] }: StructuredTask<T>): Promise<T> {
  const runtime = resolveAIRuntime(feature);
  const startedAt = Date.now();
  if (runtime.mode === "heuristic") {
    const result = fallback();
    await persistAIRun({
      feature,
      runtime,
      status: "fallback",
      prompt,
      output: safeSerialize(result),
      toolCalls,
      durationMs: Date.now() - startedAt,
      error: "",
    });
    return result;
  }

  try {
    const response = await callModel(prompt, runtime, feature);
    const result = sanitize(parseModelJSON(response, feature));
    await persistAIRun({
      feature,
      runtime,
      status: "success",
      prompt,
      output: safeSerialize(result),
      toolCalls,
      durationMs: Date.now() - startedAt,
      error: "",
    });
    return result;
  } catch (error) {
    const result = fallback();
    await persistAIRun({
      feature,
      runtime,
      status: "fallback",
      prompt,
      output: safeSerialize(result),
      toolCalls,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return result;
  }
}

function runSearchPlanning(prompt: string): SearchPlanningResult {
  const context: SearchToolContext = {
    prompt,
    lower: prompt.toLowerCase(),
  };

  const catalog = inspectAvailableFilters();
  const extracted = extractPromptSignals(context);
  const time = resolveRelativeTime(context);
  const clarification = detectClarificationNeed(context, extracted);

  return {
    outputs: {
      catalog,
      extracted,
      time,
      clarification,
    },
    toolCalls: [
      { tool: "inspect_available_filters", summary: `Available fields: ${catalog.fields.join(", ")}` },
      {
        tool: "extract_prompt_signals",
        summary: extracted.query
          ? `Detected query=${extracted.query}, cwe=${extracted.cwe || "none"}, severity=${extracted.minSeverity}`
          : `Detected cwe=${extracted.cwe || "none"}, severity=${extracted.minSeverity}`,
      },
      {
        tool: "resolve_relative_time",
        summary: time.since ? `Resolved ${time.label} to ${time.since}` : "No relative time window detected",
      },
      {
        tool: "detect_clarification_need",
        summary: clarification.needsClarification ? clarification.clarificationQuestion : "No clarification required",
      },
    ],
  };
}

function inspectAvailableFilters(): SearchFilterCatalog {
  return {
    fields: ["query", "vendor", "product", "cwe", "since", "minSeverity", "sort"],
    minSeverity: ["ANY", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
    sort: ["published_desc", "published_asc", "cvss_desc", "cvss_asc", "risk_desc"],
  };
}

function extractPromptSignals(context: SearchToolContext): ExtractedPromptSignals {
  const cveMatch = context.prompt.match(/CVE-\d{4}-\d+/i);
  const cweMatch = context.prompt.match(/CWE-\d+/i);
  const cweFamily = resolveCweFamilyAlias(context.lower);
  const vendorProduct = resolveVendorProductAlias(context.lower);
  const explicitVendor = extractLabeledSearchTarget(context.prompt, "vendor");
  const explicitProduct = extractLabeledSearchTarget(context.prompt, "product");
  const prefersRiskSort = /exploit|exploited|kev|ransomware|epss|patch first|fix first|remediate|remediation|urgent|internet-facing/i.test(context.lower);
  const minSeverity = context.lower.includes("critical")
    ? "CRITICAL"
    : context.lower.includes("high")
      ? "HIGH"
      : context.lower.includes("medium")
        ? "MEDIUM"
        : context.lower.includes("low")
          ? "LOW"
          : "ANY";

  const vendor = (explicitProduct || vendorProduct.product) ? (explicitVendor || vendorProduct.vendor) : "";
  const product = explicitProduct || vendorProduct.product;
  const query = cveMatch
    ? cveMatch[0].toUpperCase()
    : buildSearchQuery(context.prompt, {
        vendor,
        product,
        cwe: cweMatch?.[0].toUpperCase() ?? cweFamily,
      });

  const assumptions: string[] = [];
  if (minSeverity === "ANY") {
    assumptions.push("No severity term was stated, so the search keeps the default severity filter.");
  }
  if (!cweMatch && !cweFamily) {
    assumptions.push("No explicit CWE identifier was found in the prompt.");
  }
  if (cweFamily) {
    assumptions.push(`Mapped the CWE family phrase to ${cweFamily} for a narrower search.`);
  }
  if (vendorProduct.product && !explicitProduct) {
    assumptions.push(`Matched the product alias to ${vendorProduct.vendor} ${vendorProduct.product}.`);
  }
  if (explicitVendor && !explicitProduct) {
    assumptions.push("Vendor-only filtering is not applied because product filtering is required, so the vendor signal stays in the keyword query.");
  }
  if (!query) {
    assumptions.push("No product or keyword was extracted, so the search relies on filters only.");
  }

  return {
    query,
    vendor,
    product,
    cwe: cweMatch?.[0].toUpperCase() ?? cweFamily,
    minSeverity,
    sort: prefersRiskSort ? "risk_desc" : minSeverity === "ANY" ? SEARCH_DEFAULT_SORT : "cvss_desc",
    assumptions,
  };
}

function resolveRelativeTime(context: SearchToolContext): RelativeTimeSignal {
  const explicitSince = context.lower.match(/since\s+(\d{4}-\d{2}-\d{2})/i);
  if (explicitSince) {
    return { since: explicitSince[1], label: `since ${explicitSince[1]}` };
  }

  const relativeWindow = context.lower.match(/(?:last|past)\s+(\d+)\s+(day|days|week|weeks|month|months)/i);
  if (relativeWindow) {
    const count = Number.parseInt(relativeWindow[1] || "0", 10);
    const unit = relativeWindow[2] || "days";
    const multiplier = unit.startsWith("week") ? 7 : unit.startsWith("month") ? 30 : 1;
    if (count > 0) {
      return {
        since: isoDateDaysAgo(count * multiplier),
        label: `${count} ${unit}`,
      };
    }
  }

  const yearMatch = context.lower.match(/(?:in|from)\s+(20\d{2})\b/);
  if (yearMatch) {
    return {
      since: `${yearMatch[1]}-01-01`,
      label: `year ${yearMatch[1]}`,
    };
  }

  if (context.lower.includes("yesterday")) {
    return { since: isoDateDaysAgo(2), label: "yesterday" };
  }

  if (context.lower.includes("today")) {
    return { since: isoDateDaysAgo(1), label: "today" };
  }

  if (context.lower.includes("this week")) {
    return { since: isoDateDaysAgo(7), label: "this week" };
  }

  if (context.lower.includes("this month")) {
    return { since: isoDateDaysAgo(30), label: "this month" };
  }

  return {
    since: "",
    label: "",
  };
}

function detectClarificationNeed(context: SearchToolContext, extracted: ExtractedPromptSignals): ClarificationSignal {
  const trimmed = context.prompt.trim();
  if (trimmed.length < 8) {
    return {
      needsClarification: true,
      clarificationQuestion: "What product, vendor, or CVE family do you want to search for?",
    };
  }

  if (!extracted.query && extracted.minSeverity === "ANY" && !extracted.cwe) {
    return {
      needsClarification: true,
      clarificationQuestion: "Do you want to narrow this by product, vendor, severity, or time window?",
    };
  }

  return {
    needsClarification: false,
    clarificationQuestion: "",
  };
}

function buildSearchInterpretationFromPlan(prompt: string, plan: SearchPlanningResult): AISearchInterpretation {
  const normalized = normalizeSearchState({
    query: plan.outputs.extracted.query,
    vendor: plan.outputs.extracted.vendor,
    product: plan.outputs.extracted.product,
    cwe: plan.outputs.extracted.cwe,
    since: plan.outputs.time.since,
    minSeverity: plan.outputs.extracted.minSeverity,
    sort: plan.outputs.extracted.sort,
  });

  return {
    query: normalized.query,
    vendor: normalized.vendor,
    product: normalized.product,
    cwe: normalized.cwe,
    since: normalized.since,
    minSeverity: normalized.minSeverity,
    sort: normalized.sort,
    explanation: buildSearchExplanation(prompt, normalized),
    assumptions: plan.outputs.extracted.assumptions,
    appliedFilters: buildAppliedFilters(normalized),
    toolCalls: plan.toolCalls,
    needsClarification: plan.outputs.clarification.needsClarification,
    clarificationQuestion: plan.outputs.clarification.clarificationQuestion,
  };
}

function buildSearchExplanation(prompt: string, normalized: SearchState): string {
  const applied: string[] = [];
  if (normalized.query) applied.push(`query=${normalized.query}`);
  if (normalized.cwe) applied.push(`cwe=${normalized.cwe}`);
  if (normalized.since) applied.push(`since=${normalized.since}`);
  if (normalized.minSeverity !== SEARCH_DEFAULT_MIN_SEVERITY) applied.push(`minSeverity=${normalized.minSeverity}`);
  if (normalized.sort !== SEARCH_DEFAULT_SORT) applied.push(`sort=${normalized.sort}`);

  if (applied.length === 0) {
    return `Reviewed \"${prompt.trim()}\" and kept the default search settings because no stronger filter signal was detected.`;
  }

  return `Reviewed \"${prompt.trim()}\" and applied ${applied.join(", ")}.`;
}

function buildAppliedFilters(state: SearchState): AISearchAppliedFilter[] {
  const filters: Array<[AISearchFilterField, string, string]> = [
    ["query", state.query, "Keyword or identifier extracted from the request."],
    ["vendor", state.vendor, "Vendor filter inferred from the request."],
    ["product", state.product, "Product filter inferred from the request."],
    ["cwe", state.cwe, "CWE identifier extracted from the request."],
    ["since", state.since, "Relative time window resolved into an ISO date."],
    ["minSeverity", state.minSeverity !== SEARCH_DEFAULT_MIN_SEVERITY ? state.minSeverity : "", "Severity term detected in the request."],
    ["sort", state.sort !== SEARCH_DEFAULT_SORT ? state.sort : "", "Sort order adjusted to match the risk signal in the request."],
  ];

  return filters.flatMap(([field, value, reason]) =>
    value
      ? [
          {
            field,
            value,
            reason,
          },
        ]
      : []
  );
}

function resolveVendorProductAlias(lowerPrompt: string): { vendor: string; product: string } {
  const match = SEARCH_VENDOR_PRODUCT_ALIASES.find((candidate) =>
    candidate.aliases.some((alias) => lowerPrompt.includes(alias))
  );

  return match ? { vendor: match.vendor, product: match.product } : { vendor: "", product: "" };
}

function resolveCweFamilyAlias(lowerPrompt: string): string {
  return SEARCH_CWE_FAMILY_ALIASES.find((candidate) =>
    candidate.aliases.some((alias) => lowerPrompt.includes(alias))
  )?.cwe ?? "";
}

function extractLabeledSearchTarget(prompt: string, label: "vendor" | "product"): string {
  const match = prompt.match(new RegExp(`${label}\\s+([A-Za-z0-9._-]+(?:\\s+[A-Za-z0-9._-]+){0,2})`, "i"));
  return match?.[1]?.trim() ?? "";
}

function buildSearchQuery(prompt: string, extracted: { vendor: string; product: string; cwe: string }): string {
  const stripped = prompt
    .replace(/show me|find|search for|look for|give me|help me|need|want|vulns?|vulnerabilities|cves?|that are|affecting|for|about|with|from this week|from this month|this week|this month|today|yesterday|recent|latest|newly published|published|critical|high|medium|low|known exploited|kev|proof of concept|poc|patch first|fix first|remediate|remediation|last \d+ days?|past \d+ days?|last \d+ weeks?|past \d+ weeks?|last \d+ months?|past \d+ months?|since \d{4}-\d{2}-\d{2}|in \d{4}|from \d{4}/gi, " ")
    .replace(/vendor\s+[A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+){0,2}/gi, " ")
    .replace(/product\s+[A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+){0,2}/gi, " ")
    .replace(/cross-site scripting|xss|sql injection|sqli|command injection|shell injection|os command injection|path traversal|directory traversal|authentication bypass|auth bypass|server-side request forgery|ssrf|insecure deserialization|deserialization/gi, " ");

  const candidate = stripped.replace(/\s+/g, " ").trim();
  if (candidate) {
    return candidate;
  }

  return extracted.product || extracted.vendor || extracted.cwe;
}

async function callModel(prompt: string, settings: AIRuntimeSettings, feature: AIFeature): Promise<string> {
  if (settings.provider === "anthropic") {
    return callAnthropic(prompt, settings, feature);
  }

  return callOpenAI(prompt, settings, feature);
}

async function persistAIRun(input: {
  feature: AIFeature;
  runtime: AIRuntimeSettings;
  status: AIRunRecord["status"];
  prompt: string;
  output: string;
  toolCalls: AISearchToolTrace[];
  durationMs: number;
  error: string;
}): Promise<void> {
  try {
    await appendAIRun({
      id: crypto.randomUUID(),
      feature: input.feature,
      provider: input.runtime.provider,
      model: input.runtime.model,
      mode: input.runtime.mode,
      status: input.status,
      prompt: truncateValue(input.prompt, 12000),
      output: truncateValue(input.output, 12000),
      toolCalls: input.toolCalls,
      error: truncateValue(input.error, 2000),
      durationMs: Math.max(0, Math.round(input.durationMs)),
      createdAt: new Date().toISOString(),
    });
  } catch {
  }
}

function parseModelJSON(response: string, feature: AIFeature): unknown {
  try {
    return JSON.parse(response);
  } catch (error) {
    throw new Error(`${feature}_invalid_json:${error instanceof Error ? error.message : "parse_failed"}`);
  }
}

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{\"error\":\"serialization_failed\"}";
  }
}

function truncateValue(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}...`;
}

async function callOpenAI(prompt: string, settings: AIRuntimeSettings, feature: AIFeature): Promise<string> {
  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_OPENAI_MODEL,
      temperature: feature === "daily_digest" ? 0.3 : 0.2,
      messages: [
        {
          role: "system",
          content: "Return only JSON. No markdown. No prose outside JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI error: ${res.status}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI response did not include content");
  }

  return content;
}

async function callAnthropic(prompt: string, settings: AIRuntimeSettings, feature: AIFeature): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: feature === "daily_digest" ? 1200 : 800,
      temperature: feature === "daily_digest" ? 0.3 : 0.2,
      messages: [
        {
          role: "user",
          content: `Return only JSON. No markdown. No prose outside JSON.\n\n${prompt}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic error: ${res.status}`);
  }

  const data = await res.json();
  const content = data?.content?.find?.((item: { type?: string }) => item.type === "text")?.text;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Anthropic response did not include content");
  }

  return content;
}

function resolveAIRuntime(feature?: AIFeature): AIRuntimeSettings {
  const requestedProvider = normalizeProvider(readFeatureEnv(feature, "PROVIDER") ?? process.env.AI_PROVIDER);
  const requestedModel = readFeatureEnv(feature, "MODEL") ?? "";
  const openAIKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const openAIModel = (requestedModel || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim();
  const anthropicModel = (requestedModel || process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL).trim();

  if (requestedProvider === "heuristic") {
    return {
      provider: "heuristic",
      model: "",
      apiKey: "",
      mode: "heuristic",
    };
  }

  if (requestedProvider === "openai" && openAIKey) {
    return {
      provider: "openai",
      model: openAIModel,
      apiKey: openAIKey,
      mode: "configured",
    };
  }

  if (requestedProvider === "anthropic" && anthropicKey) {
    return {
      provider: "anthropic",
      model: anthropicModel,
      apiKey: anthropicKey,
      mode: "configured",
    };
  }

  if (openAIKey) {
    return {
      provider: "openai",
      model: openAIModel,
      apiKey: openAIKey,
      mode: "configured",
    };
  }

  if (anthropicKey) {
    return {
      provider: "anthropic",
      model: anthropicModel,
      apiKey: anthropicKey,
      mode: "configured",
    };
  }

  return {
    provider: "heuristic",
    model: "",
    apiKey: "",
    mode: "heuristic",
  };
}

function readFeatureEnv(feature: AIFeature | undefined, suffix: "PROVIDER" | "MODEL"): string | undefined {
  if (!feature) {
    return undefined;
  }

  const envKey = `AI_${AI_FEATURE_ENV_SEGMENTS[feature]}_${suffix}`;
  const value = process.env[envKey]?.trim();
  return value || undefined;
}

function normalizeProvider(value: string | undefined): AIProvider | undefined {
  if (value === "openai" || value === "anthropic" || value === "heuristic") {
    return value;
  }

  return undefined;
}

function sanitizeInsight(value: unknown): AICveInsight {
  const fallback = buildHeuristicCveInsight({ id: "CVE-UNKNOWN" });
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;

  return {
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
    triage: sanitizeTriage(record.triage, fallback.triage),
    remediation: Array.isArray(record.remediation) ? record.remediation.filter((item): item is string => typeof item === "string").slice(0, 6) : fallback.remediation,
    cluster: sanitizeCluster(record.cluster, fallback.cluster),
    projectContext: sanitizeProjectContext(record.projectContext, fallback.projectContext),
  };
}

function sanitizeSearchInterpretation(value: unknown, fallback = interpretSearchPromptHeuristically("")): AISearchInterpretation {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const normalized = normalizeSearchState(record as Partial<SearchState>);
  return {
    query: normalized.query,
    vendor: normalized.vendor,
    product: normalized.product,
    cwe: normalized.cwe,
    since: normalized.since,
    minSeverity: normalized.minSeverity,
    sort: normalized.sort,
    explanation: typeof record.explanation === "string" ? record.explanation : fallback.explanation,
    assumptions: Array.isArray(record.assumptions)
      ? record.assumptions.filter((item): item is string => typeof item === "string").slice(0, 8)
      : fallback.assumptions,
    appliedFilters: Array.isArray(record.appliedFilters)
      ? record.appliedFilters
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .flatMap((item) => {
            const field = item.field;
            const value = item.value;
            const reason = item.reason;
            return isSearchFilterField(field) && typeof value === "string" && typeof reason === "string"
              ? [
                  {
                    field,
                    value,
                    reason,
                  },
                ]
              : [];
          })
      : fallback.appliedFilters,
    toolCalls: fallback.toolCalls,
    needsClarification: typeof record.needsClarification === "boolean" ? record.needsClarification : fallback.needsClarification,
    clarificationQuestion:
      typeof record.clarificationQuestion === "string" ? record.clarificationQuestion : fallback.clarificationQuestion,
  };
}

function sanitizeDigest(value: unknown): AIDigest {
  if (!value || typeof value !== "object") {
    return buildHeuristicDigest({ watchlist: [], alerts: [], projects: [] });
  }

  const record = value as Record<string, unknown>;
  return {
    headline: typeof record.headline === "string" ? record.headline : "AI digest",
    sections: Array.isArray(record.sections)
      ? record.sections
          .filter((section): section is Record<string, unknown> => Boolean(section) && typeof section === "object")
          .map((section) => ({
            title: typeof section.title === "string" ? section.title : "Section",
            body: typeof section.body === "string" ? section.body : "",
            items: Array.isArray(section.items)
              ? section.items.filter((item): item is string => typeof item === "string").slice(0, 8)
              : [],
          }))
      : [],
  };
}

function sanitizeTriageSuggestion(value: unknown): AITriageSuggestion {
  const fallback = buildHeuristicTriageSuggestion({
    detail: { id: "CVE-UNKNOWN" },
    epss: null,
    triage: null,
    relatedProjects: [],
  });

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
    recommendation: sanitizeTriage(record.recommendation, fallback.recommendation),
    recommendedTags: Array.isArray(record.recommendedTags)
      ? record.recommendedTags.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.recommendedTags,
    recommendedOwner: typeof record.recommendedOwner === "string" ? record.recommendedOwner : fallback.recommendedOwner,
    ownershipRationale: typeof record.ownershipRationale === "string" ? record.ownershipRationale : fallback.ownershipRationale,
    projectContext: sanitizeProjectContext(record.projectContext, fallback.projectContext),
    requiresHumanApproval: record.requiresHumanApproval === false ? false : true,
  };
}

function sanitizeRemediationPlan(value: unknown): AIRemediationPlan {
  const fallback = buildHeuristicRemediationPlan({
    detail: { id: "CVE-UNKNOWN" },
    epss: null,
    triage: null,
    relatedProjects: [],
  });

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
    strategy: typeof record.strategy === "string" ? record.strategy : fallback.strategy,
    compensatingControls: Array.isArray(record.compensatingControls)
      ? record.compensatingControls.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.compensatingControls,
    validationSteps: Array.isArray(record.validationSteps)
      ? record.validationSteps.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.validationSteps,
    rolloutNotes: Array.isArray(record.rolloutNotes)
      ? record.rolloutNotes.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.rolloutNotes,
    changeRisk: record.changeRisk === "high" || record.changeRisk === "medium" || record.changeRisk === "low" ? record.changeRisk : fallback.changeRisk,
    recommendedOwner: typeof record.recommendedOwner === "string" ? record.recommendedOwner : fallback.recommendedOwner,
    ownerRationale: typeof record.ownerRationale === "string" ? record.ownerRationale : fallback.ownerRationale,
    projectContext: sanitizeProjectContext(record.projectContext, fallback.projectContext),
    requiresHumanApproval: record.requiresHumanApproval === false ? false : true,
  };
}

function sanitizeWatchlistReview(value: unknown): AIWatchlistReview {
  const fallback = buildHeuristicWatchlistReview({ items: [], previousReviewAt: null });

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return {
    headline: typeof record.headline === "string" ? record.headline : fallback.headline,
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
    newMatches: Array.isArray(record.newMatches)
      ? record.newMatches.filter((item): item is string => typeof item === "string").slice(0, 8)
      : fallback.newMatches,
    changedSinceLastReview: Array.isArray(record.changedSinceLastReview)
      ? record.changedSinceLastReview.filter((item): item is string => typeof item === "string").slice(0, 10)
      : fallback.changedSinceLastReview,
    clusters: Array.isArray(record.clusters)
      ? record.clusters
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .flatMap((item) => {
            const label = item.label;
            const cveIds = item.cveIds;
            const summary = item.summary;
            return typeof label === "string" && Array.isArray(cveIds) && typeof summary === "string"
              ? [{
                  label,
                  cveIds: cveIds.filter((entry): entry is string => typeof entry === "string").slice(0, 8),
                  summary,
                }]
              : [];
          })
      : fallback.clusters,
    recommendedActions: Array.isArray(record.recommendedActions)
      ? record.recommendedActions.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.recommendedActions,
    previousReviewAt: typeof record.previousReviewAt === "string" ? record.previousReviewAt : fallback.previousReviewAt,
    reviewedAt: typeof record.reviewedAt === "string" ? record.reviewedAt : fallback.reviewedAt,
  };
}

function sanitizeProjectSummary(value: unknown): AIProjectSummary {
  const fallback = buildHeuristicProjectSummary({
    project: { id: "project-unknown", name: "Unknown Project", description: "", updatedAt: "", items: [], activity: [] },
    items: [],
  });

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return {
    projectName: typeof record.projectName === "string" ? record.projectName : fallback.projectName,
    overview: typeof record.overview === "string" ? record.overview : fallback.overview,
    executive: sanitizeProjectSummarySection(record.executive, fallback.executive),
    analyst: sanitizeProjectSummarySection(record.analyst, fallback.analyst),
    engineering: sanitizeProjectSummarySection(record.engineering, fallback.engineering),
    metrics: sanitizeProjectSummaryMetrics(record.metrics, fallback.metrics),
  };
}

function sanitizeProjectSummarySection(value: unknown, fallback: AIProjectSummary["executive"]): AIProjectSummary["executive"] {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return {
    headline: typeof record.headline === "string" ? record.headline : fallback.headline,
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
    bullets: Array.isArray(record.bullets)
      ? record.bullets.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.bullets,
  };
}

function sanitizeProjectSummaryMetrics(value: unknown, fallback: AIProjectSummary["metrics"]): AIProjectSummary["metrics"] {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return {
    totalItems: typeof record.totalItems === "number" ? record.totalItems : fallback.totalItems,
    criticalCount: typeof record.criticalCount === "number" ? record.criticalCount : fallback.criticalCount,
    highCount: typeof record.highCount === "number" ? record.highCount : fallback.highCount,
    kevCount: typeof record.kevCount === "number" ? record.kevCount : fallback.kevCount,
    investigatingCount: typeof record.investigatingCount === "number" ? record.investigatingCount : fallback.investigatingCount,
  };
}

function sanitizeAlertInvestigation(value: unknown): AIAlertInvestigation {
  const fallback = buildHeuristicAlertInvestigation({
    rule: {
      id: "alert-unknown",
      name: "Unknown alert",
      lastCheckedAt: null,
      search: normalizeSearchState({}),
    },
    matches: [],
  });

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return {
    ruleName: typeof record.ruleName === "string" ? record.ruleName : fallback.ruleName,
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
    whyMatched: Array.isArray(record.whyMatched)
      ? record.whyMatched.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.whyMatched,
    topMatches: Array.isArray(record.topMatches)
      ? record.topMatches.flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }

          const match = item as Record<string, unknown>;
          return typeof match.id === "string" && typeof match.summary === "string" && typeof match.rationale === "string"
            ? [{
                id: match.id,
                summary: match.summary,
                rationale: match.rationale,
                unread: Boolean(match.unread),
              }]
            : [];
        }).slice(0, 5)
      : fallback.topMatches,
    recommendedAction: typeof record.recommendedAction === "string" ? record.recommendedAction : fallback.recommendedAction,
    nextSteps: Array.isArray(record.nextSteps)
      ? record.nextSteps.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.nextSteps,
  };
}

function sanitizeExposureAssessment(value: unknown): AIExposureAssessment {
  const fallback = buildHeuristicExposureAssessment({
    detail: { id: "CVE-UNKNOWN" },
    triage: null,
    relatedProjects: [],
    inventoryAssets: [],
  });

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
    likelyImpact: record.likelyImpact === "critical" || record.likelyImpact === "high" || record.likelyImpact === "medium" || record.likelyImpact === "low"
      ? record.likelyImpact
      : fallback.likelyImpact,
    matchedAssets: Array.isArray(record.matchedAssets)
      ? record.matchedAssets.flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }

          const match = item as Record<string, unknown>;
          return typeof match.assetId === "string"
            && typeof match.assetName === "string"
            && typeof match.rationale === "string"
            && Array.isArray(match.matchingSignals)
            && (match.confidence === "high" || match.confidence === "medium" || match.confidence === "low")
            ? [{
                assetId: match.assetId,
                assetName: match.assetName,
                confidence: match.confidence as "high" | "medium" | "low",
                rationale: match.rationale,
                matchingSignals: match.matchingSignals.filter((signal): signal is string => typeof signal === "string").slice(0, 6),
              }]
            : [];
        }).slice(0, 8)
      : fallback.matchedAssets,
    rationale: Array.isArray(record.rationale)
      ? record.rationale.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.rationale,
    recommendedActions: Array.isArray(record.recommendedActions)
      ? record.recommendedActions.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.recommendedActions,
  };
}

function sanitizeTriage(value: unknown, fallback: AICveInsight["triage"]): AICveInsight["triage"] {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    priority:
      record.priority === "critical" || record.priority === "high" || record.priority === "medium" || record.priority === "low"
        ? record.priority
        : fallback.priority,
    status:
      record.status === "new" || record.status === "investigating" || record.status === "mitigated" || record.status === "accepted" || record.status === "closed"
        ? record.status
        : fallback.status,
    confidence: record.confidence === "high" || record.confidence === "medium" || record.confidence === "low" ? record.confidence : fallback.confidence,
    ownerRecommendation: typeof record.ownerRecommendation === "string" ? record.ownerRecommendation : fallback.ownerRecommendation,
    rationale: typeof record.rationale === "string" ? record.rationale : fallback.rationale,
    nextSteps: Array.isArray(record.nextSteps)
      ? record.nextSteps.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.nextSteps,
    signals: Array.isArray(record.signals)
      ? record.signals
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .flatMap((item) => {
            const label = item.label;
            const value = item.value;
            const level = item.level;
            const rationale = item.rationale;
            return typeof label === "string" && typeof value === "string" && (level === "high" || level === "medium" || level === "low") && typeof rationale === "string"
              ? [{ label, value, level, rationale }]
              : [];
          })
      : fallback.signals,
  };
}

function sanitizeProjectContext(value: unknown, fallback: AICveInsight["projectContext"]): AICveInsight["projectContext"] {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    projectCount: typeof record.projectCount === "number" && Number.isFinite(record.projectCount) ? record.projectCount : fallback.projectCount,
    projectNames: Array.isArray(record.projectNames)
      ? record.projectNames.filter((item): item is string => typeof item === "string").slice(0, 8)
      : fallback.projectNames,
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
  };
}

function sanitizeCluster(value: unknown, fallback: AICveInsight["cluster"]): AICveInsight["cluster"] {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    canonicalId: typeof record.canonicalId === "string" ? record.canonicalId : fallback.canonicalId,
    sourceIds: Array.isArray(record.sourceIds) ? record.sourceIds.filter((item): item is string => typeof item === "string").slice(0, 10) : fallback.sourceIds,
    relatedIds: Array.isArray(record.relatedIds) ? record.relatedIds.filter((item): item is string => typeof item === "string").slice(0, 10) : fallback.relatedIds,
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
  };
}

function isSearchFilterField(value: unknown): value is AISearchFilterField {
  return value === "query" || value === "vendor" || value === "product" || value === "cwe" || value === "since" || value === "minSeverity" || value === "sort";
}

function extractRelatedIds(detail: CVEDetail): string[] {
  const related = new Set<string>();
  for (const alias of detail.aliases ?? []) {
    related.add(alias);
  }

  const record = detail as unknown as Record<string, unknown>;
  for (const key of ["linked_vulnerabilities", "related_vulnerabilities", "vulnerabilities", "related"]) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === "string") related.add(item);
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        for (const field of ["id", "cve", "vulnerability"]) {
          if (typeof obj[field] === "string") {
            related.add(obj[field] as string);
          }
        }
      }
    }
  }

  related.delete(extractCVEId(detail));
  return Array.from(related).slice(0, 10);
}

function truncateSentence(input: string, max = 220): string {
  const trimmed = input.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}...`;
}

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
