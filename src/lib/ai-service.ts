import {
  AICveInsight,
  AIDigest,
  AIFeature,
  AIRunRecord,
  AITriageContextSnapshot,
  AITriageSignal,
  AIProvider,
  AISearchAppliedFilter,
  AISearchFilterField,
  AISearchInterpretation,
  AISearchToolTrace,
  CVEDetail,
  EPSSData,
  ProjectRecord,
  SearchSeverityFilter,
  SearchSortOption,
} from "./types";
import { appendAIRun, listRecentAIRuns } from "./ai-runs-store";
import { SearchState, normalizeSearchState } from "./search";
import { extractCVEId, extractDescription, getSeverityFromScore } from "./utils";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
const SEARCH_DEFAULT_SORT: SearchSortOption = "published_desc";
const SEARCH_DEFAULT_MIN_SEVERITY: SearchSeverityFilter = "ANY";

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

export interface ServerAIConfigurationSummary {
  provider: AIProvider;
  model: string;
  mode: "heuristic" | "configured";
  configured: boolean;
  availableProviders: AIProvider[];
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
  };
}

export async function getRecentAIRuns(limit = 25): Promise<AIRunRecord[]> {
  return listRecentAIRuns(limit);
}

export async function generateCveInsight(input: CveInsightInput): Promise<AICveInsight> {
  return executeStructuredTask({
    feature: "cve_insight",
    prompt: [
      "You are a security analyst assistant.",
      "Return only valid JSON matching this TypeScript shape:",
      '{"summary":"string","triage":{"priority":"critical|high|medium|low","status":"new|investigating|mitigated|accepted|closed","confidence":"high|medium|low","ownerRecommendation":"string","rationale":"string","nextSteps":["string"],"signals":[{"label":"string","value":"string","level":"high|medium|low","rationale":"string"}]},"remediation":["string"],"cluster":{"canonicalId":"string","sourceIds":["string"],"relatedIds":["string"],"summary":"string"},"projectContext":{"projectCount":0,"projectNames":["string"],"summary":"string"}}',
      "Base your answer only on this triage input JSON:",
      JSON.stringify(input),
    ].join("\n"),
    fallback: () => buildHeuristicCveInsight(input),
    sanitize: sanitizeInsight,
  });
}

export async function generateSearchInterpretation(prompt: string): Promise<AISearchInterpretation> {
  const plan = runSearchPlanning(prompt);
  const heuristic = buildSearchInterpretationFromPlan(prompt, plan);
  const runtime = resolveAIRuntime();
  const startedAt = Date.now();

  if (runtime.mode === "heuristic") {
    await persistAIRun({
      feature: "search_assistant",
      runtime,
      status: "fallback",
      prompt,
      output: JSON.stringify(heuristic),
      toolCalls: plan.toolCalls,
      durationMs: Date.now() - startedAt,
      error: "",
    });
    return heuristic;
  }

  try {
    const response = await callModel(
      [
        "Convert this vulnerability search request into structured filters.",
        "Return only valid JSON with keys query, vendor, product, cwe, since, minSeverity, sort, explanation, assumptions, appliedFilters, needsClarification, clarificationQuestion.",
        'Allowed minSeverity: "ANY" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL".',
        'Allowed sort: "published_desc" | "published_asc" | "cvss_desc" | "cvss_asc".',
        "Tool outputs:",
        JSON.stringify(plan.outputs),
        `Request: ${prompt}`,
      ].join("\n"),
      runtime,
      "search_assistant"
    );

    const parsed = sanitizeSearchInterpretation(JSON.parse(response), heuristic);
    const result = {
      ...parsed,
      toolCalls: plan.toolCalls,
    };
    await persistAIRun({
      feature: "search_assistant",
      runtime,
      status: "success",
      prompt,
      output: JSON.stringify(result),
      toolCalls: plan.toolCalls,
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
      toolCalls: plan.toolCalls,
      durationMs: Date.now() - startedAt,
      error: "model_generation_failed",
    });
    return heuristic;
  }
}

export async function generateDigest(input: DigestInput): Promise<AIDigest> {
  return executeStructuredTask({
    feature: "daily_digest",
    prompt: [
      "You are producing a concise vulnerability monitoring digest.",
      "Return only valid JSON matching this shape:",
      '{"headline":"string","sections":[{"title":"string","body":"string","items":["string"]}]}',
      "Use this input JSON:",
      JSON.stringify(input),
    ].join("\n"),
    fallback: () => buildHeuristicDigest(input),
    sanitize: sanitizeDigest,
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
  const runtime = resolveAIRuntime();
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
    const result = sanitize(JSON.parse(response));
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
    sort: ["published_desc", "published_asc", "cvss_desc", "cvss_asc"],
  };
}

function extractPromptSignals(context: SearchToolContext): ExtractedPromptSignals {
  const cveMatch = context.prompt.match(/CVE-\d{4}-\d+/i);
  const cweMatch = context.prompt.match(/CWE-\d+/i);
  const minSeverity = context.lower.includes("critical")
    ? "CRITICAL"
    : context.lower.includes("high")
      ? "HIGH"
      : context.lower.includes("medium")
        ? "MEDIUM"
        : context.lower.includes("low")
          ? "LOW"
          : "ANY";

  const query = cveMatch
    ? cveMatch[0].toUpperCase()
    : context.prompt
        .replace(/show me|find|search for|look for|give me|vulns?|vulnerabilities|cves?|that are|affecting|from this week|from this month|this week|this month|today|recent|latest|newly published|published|critical|high|medium|low/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

  const assumptions: string[] = [];
  if (minSeverity === "ANY") {
    assumptions.push("No severity term was stated, so the search keeps the default severity filter.");
  }
  if (!cweMatch) {
    assumptions.push("No explicit CWE identifier was found in the prompt.");
  }
  if (!query) {
    assumptions.push("No product or keyword was extracted, so the search relies on filters only.");
  }

  return {
    query,
    cwe: cweMatch?.[0].toUpperCase() ?? "",
    minSeverity,
    sort: minSeverity === "ANY" ? SEARCH_DEFAULT_SORT : "cvss_desc",
    assumptions,
  };
}

function resolveRelativeTime(context: SearchToolContext): RelativeTimeSignal {
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
    vendor: "",
    product: "",
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

function resolveAIRuntime(): AIRuntimeSettings {
  const requestedProvider = normalizeProvider(process.env.AI_PROVIDER);
  const openAIKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

  if (requestedProvider === "openai" && openAIKey) {
    return {
      provider: "openai",
      model: (process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL).trim(),
      apiKey: openAIKey,
      mode: "configured",
    };
  }

  if (requestedProvider === "anthropic" && anthropicKey) {
    return {
      provider: "anthropic",
      model: (process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL).trim(),
      apiKey: anthropicKey,
      mode: "configured",
    };
  }

  if (openAIKey) {
    return {
      provider: "openai",
      model: (process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL).trim(),
      apiKey: openAIKey,
      mode: "configured",
    };
  }

  if (anthropicKey) {
    return {
      provider: "anthropic",
      model: (process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL).trim(),
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
