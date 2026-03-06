import {
  AICveInsight,
  AIDigest,
  AIFeature,
  AIProvider,
  AISearchAppliedFilter,
  AISearchFilterField,
  AISearchInterpretation,
  AISearchToolTrace,
  CVEDetail,
  ProjectRecord,
  SearchSeverityFilter,
  SearchSortOption,
} from "./types";
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

export async function generateCveInsight(detail: CVEDetail): Promise<AICveInsight> {
  return executeStructuredTask({
    feature: "cve_insight",
    prompt: [
      "You are a security analyst assistant.",
      "Return only valid JSON matching this TypeScript shape:",
      '{"summary":"string","triage":{"priority":"critical|high|medium|low","status":"new|investigating|mitigated|accepted|closed","rationale":"string","nextSteps":["string"]},"remediation":["string"],"cluster":{"canonicalId":"string","sourceIds":["string"],"relatedIds":["string"],"summary":"string"}}',
      "Base your answer only on this CVE detail JSON:",
      JSON.stringify(detail),
    ].join("\n"),
    fallback: () => buildHeuristicCveInsight(detail),
    sanitize: sanitizeInsight,
  });
}

export async function generateSearchInterpretation(prompt: string): Promise<AISearchInterpretation> {
  const plan = runSearchPlanning(prompt);
  const heuristic = buildSearchInterpretationFromPlan(prompt, plan);
  const runtime = resolveAIRuntime();

  if (runtime.mode === "heuristic") {
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
    return {
      ...parsed,
      toolCalls: plan.toolCalls,
    };
  } catch {
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

export function buildHeuristicCveInsight(detail: CVEDetail): AICveInsight {
  const id = extractCVEId(detail);
  const severityScore = detail.cvss3 ?? detail.cvss;
  const severity = getSeverityFromScore(severityScore);
  const description = extractDescription(detail);
  const affected = detail.containers?.cna?.affected?.slice(0, 3) ?? [];
  const aliases = detail.aliases ?? [];
  const relatedIds = extractRelatedIds(detail);
  const priority = severity === "CRITICAL" ? "critical" : severity === "HIGH" ? "high" : severity === "MEDIUM" ? "medium" : "low";
  const status = priority === "critical" || priority === "high" ? "investigating" : "new";

  return {
    summary: `${id} is a ${severity.toLowerCase()} severity vulnerability${affected.length ? ` affecting ${affected.map((item) => item.product || item.vendor).filter(Boolean).join(", ")}` : ""}. ${truncateSentence(description)}`,
    triage: {
      priority,
      status,
      rationale:
        priority === "critical" || priority === "high"
          ? "High severity and affected product exposure suggest immediate analyst review."
          : "The record is lower severity or missing severity context, so review is still useful but less urgent.",
      nextSteps: [
        "Confirm whether the affected product or version exists in your environment.",
        "Review upstream references for patches, advisories, or mitigation guidance.",
        "Track ownership and remediation notes in triage before closing the issue.",
      ],
    },
    remediation: [
      "Identify exposed versions and compare them against vendor-fixed releases.",
      "Apply patches or compensating controls where an immediate upgrade is not possible.",
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
  };
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

async function executeStructuredTask<T>({ feature, prompt, fallback, sanitize }: StructuredTask<T>): Promise<T> {
  const runtime = resolveAIRuntime();
  if (runtime.mode === "heuristic") {
    return fallback();
  }

  try {
    const response = await callModel(prompt, runtime, feature);
    return sanitize(JSON.parse(response));
  } catch {
    return fallback();
  }
}

function runSearchPlanning(prompt: string): SearchPlanningResult {
  const context: SearchToolContext = {
    prompt,
    lower: prompt.toLowerCase(),
  };

  const catalog = inspectAvailableFilters(context);
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

function inspectAvailableFilters(_context: SearchToolContext): SearchFilterCatalog {
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
    rationale: typeof record.rationale === "string" ? record.rationale : fallback.rationale,
    nextSteps: Array.isArray(record.nextSteps)
      ? record.nextSteps.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.nextSteps,
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
