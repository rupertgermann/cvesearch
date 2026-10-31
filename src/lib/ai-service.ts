import {
  AIFeature,
  AIRemediationPlan,
  AIRunRecord,
  AITriageContextSnapshot,
  AIProvider,
  AISearchAppliedFilter,
  AISearchFilterField,
  AISearchInterpretation,
  AISearchToolTrace,
  CVEDetail,
  EPSSData,
  SearchSeverityFilter,
  SearchSortOption,
} from "./types";
import { appendAIRun } from "./ai-runs-store";
import { callAnthropicText } from "./anthropic-client";
import { callOpenAIText } from "./openai-client";
import { SearchState, normalizeSearchState } from "./search";
import { extractCVEId, extractDescription, getSeverityFromScore } from "./utils";
import { getRemediationAgentPromptTemplate, getSearchAssistantPromptTemplate } from "./ai-prompts";

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const SEARCH_DEFAULT_SORT: SearchSortOption = "published_desc";
const SEARCH_DEFAULT_MIN_SEVERITY: SearchSeverityFilter = "ANY";
const AI_FEATURES: AIFeature[] = ["search_assistant", "remediation_agent"];
const AI_FEATURE_ENV_SEGMENTS: Record<AIFeature, string> = {
  search_assistant: "SEARCH_ASSISTANT",
  remediation_agent: "REMEDIATION_AGENT",
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

export interface RemediationPlanInput {
  detail: CVEDetail;
  epss: EPSSData | null;
  triage: AITriageContextSnapshot | null;
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
  userId?: string;
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

interface AIExecutionOptions {
  userId?: string;
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

export function prepareRemediationPromptInput(input: RemediationPlanInput): RemediationPlanInput {
  return shouldRedactPromptInput(resolveAIRuntime("remediation_agent")) ? redactRemediationPlanInput(input) : input;
}

export async function generateRemediationPlan(input: RemediationPlanInput, options: AIExecutionOptions = {}): Promise<AIRemediationPlan> {
  const promptTemplate = getRemediationAgentPromptTemplate();
  return executeStructuredTask({
    feature: "remediation_agent",
    prompt: promptTemplate.build(prepareRemediationPromptInput(input)),
    fallback: () => buildHeuristicRemediationPlan(input),
    sanitize: sanitizeRemediationPlan,
    toolCalls: [{ tool: "prompt_template", summary: `${promptTemplate.feature}@${promptTemplate.version}` }],
    userId: options.userId,
  });
}

export async function generateSearchInterpretation(prompt: string, options: AIExecutionOptions = {}): Promise<AISearchInterpretation> {
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
      userId: options.userId,
    });
    return heuristic;
  }

  try {
    const response = await callModel(
      promptTemplate.build({ request: prompt, toolOutputs: plan.outputs }),
      runtime
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
      userId: options.userId,
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
      userId: options.userId,
    });
    return heuristic;
  }
}

export function buildHeuristicRemediationPlan(input: RemediationPlanInput | CVEDetail): AIRemediationPlan {
  const normalized = normalizeRemediationPlanInput(input as CVEDetail | RemediationPlanInput);
  const referenceSummary = summarizeReferences(normalized.detail);
  const severity = getSeverityFromScore(normalized.detail.cvss3 ?? normalized.detail.cvss);
  const priority = derivePriority(severity, normalized.epss, referenceSummary);
  const affectedProducts = (normalized.detail.containers?.cna?.affected ?? [])
    .map((item) => item.product || item.vendor)
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
  const internetFacing =
    normalized.triage?.tags.some((tag) => /internet-facing/i.test(tag)) ||
    /internet|remote|network|gateway|edge/i.test(extractDescription(normalized.detail));
  const recommendedOwner = normalized.triage?.owner || "Security triage";

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
      "Capture rollout ownership before making production changes.",
      priority === "critical" || normalized.detail.kev
        ? "Use the fastest approved change path and communicate urgency because severity or exploitation signals are elevated."
        : "Prefer staged deployment with checkpoints for validation and rollback readiness.",
      normalized.triage?.notes
        ? `Preserve existing analyst notes during rollout: ${truncateSentence(normalized.triage.notes, 140)}`
        : "Record validation evidence and any residual risk decisions in triage notes after rollout.",
    ],
    changeRisk: priority === "critical" ? "high" : priority === "high" ? "medium" : "low",
    recommendedOwner,
    ownerRationale: normalized.triage?.owner
      ? `Keep ${normalized.triage.owner} as remediation owner so the rollout stays aligned with the current analyst workflow.`
      : "Assign the security or service owner who can validate exposure and coordinate the change window.",
    requiresHumanApproval: true,
  };
}

function shouldRedactPromptInput(runtime: AIRuntimeSettings): boolean {
  return runtime.provider !== "heuristic" && !isSensitiveModelDataAllowed();
}

function isSensitiveModelDataAllowed(): boolean {
  return process.env.AI_ALLOW_SENSITIVE_MODEL_DATA === "true";
}

function redactRemediationPlanInput(input: RemediationPlanInput): RemediationPlanInput {
  return {
    ...input,
    triage: input.triage
      ? {
          ...input.triage,
          owner: redactSensitiveString(input.triage.owner, "[redacted owner]"),
          notes: redactSensitiveString(input.triage.notes, "[redacted analyst notes]"),
        }
      : input.triage,
  };
}

function redactSensitiveString(value: string, replacement: string): string {
  return value.trim() ? replacement : value;
}

function normalizeRemediationPlanInput(input: CVEDetail | RemediationPlanInput): RemediationPlanInput {
  if ("detail" in input) {
    return input;
  }

  return {
    detail: input,
    epss: null,
    triage: null,
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

function derivePriority(
  severity: ReturnType<typeof getSeverityFromScore>,
  epss: EPSSData | null,
  referenceSummary: { totalCount: number; exploitCount: number; patchCount: number }
): "critical" | "high" | "medium" | "low" {
  if (severity === "CRITICAL") return "critical";
  if (severity === "HIGH" || (epss?.percentile ?? 0) >= 0.9 || referenceSummary.exploitCount > 0) return "high";
  if (severity === "MEDIUM" || (epss?.percentile ?? 0) >= 0.5 || referenceSummary.patchCount > 0) return "medium";
  return "low";
}

export function interpretSearchPromptHeuristically(prompt: string): AISearchInterpretation {
  return buildSearchInterpretationFromPlan(prompt, runSearchPlanning(prompt));
}

async function executeStructuredTask<T>({ feature, prompt, fallback, sanitize, toolCalls = [], userId }: StructuredTask<T>): Promise<T> {
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
      userId,
    });
    return result;
  }

  try {
    const response = await callModel(prompt, runtime);
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
      userId,
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
      userId,
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
    .replace(/\b(?:show me|show|list|display|get|find|search for|look for|give me|help me|tell me|what are|what is|what should|we should|we need|i need|need|want|we|vulnerabilities|vulns?|cves?|exploits?|that are|affecting|related to|security issues?|issues?|all|for|about|with|in|from this week|from this month|this week|this month|today|yesterday|recent|latest|newly published|published|critical|high|medium|low|known exploited|kev|proof of concept|poc|patch first|fix first|remediate|remediation|last \d+ days?|past \d+ days?|last \d+ weeks?|past \d+ weeks?|last \d+ months?|past \d+ months?|since \d{4}-\d{2}-\d{2}|in \d{4}|from \d{4})\b/gi, " ")
    .replace(/vendor\s+[A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+){0,2}/gi, " ")
    .replace(/product\s+[A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+){0,2}/gi, " ")
    .replace(/cross-site scripting|xss|sql injection|sqli|command injection|shell injection|os command injection|path traversal|directory traversal|authentication bypass|auth bypass|server-side request forgery|ssrf|insecure deserialization|deserialization/gi, " ");

  const candidate = stripped.replace(/\s+/g, " ").trim();
  if (candidate) {
    return candidate;
  }

  return extracted.product || extracted.vendor || extracted.cwe;
}

async function callModel(prompt: string, settings: AIRuntimeSettings): Promise<string> {
  if (settings.provider === "anthropic") {
    return callAnthropic(prompt, settings);
  }

  return callOpenAI(prompt, settings);
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
  userId?: string;
}): Promise<void> {
  if (!input.userId) {
    return;
  }

  try {
    await appendAIRun(input.userId, {
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

async function callOpenAI(prompt: string, settings: AIRuntimeSettings): Promise<string> {
  return callOpenAIText({
    apiKey: settings.apiKey,
    model: settings.model || DEFAULT_OPENAI_MODEL,
    prompt,
    instructions: "Return only JSON. No markdown. No prose outside JSON.",
  });
}

async function callAnthropic(prompt: string, settings: AIRuntimeSettings): Promise<string> {
  return callAnthropicText({
    apiKey: settings.apiKey,
    model: settings.model || DEFAULT_ANTHROPIC_MODEL,
    prompt,
    maxTokens: 800,
    temperature: 0.2,
  });
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

function sanitizeRemediationPlan(value: unknown): AIRemediationPlan {
  const fallback = buildHeuristicRemediationPlan({
    detail: { id: "CVE-UNKNOWN" },
    epss: null,
    triage: null,
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
    requiresHumanApproval: record.requiresHumanApproval === false ? false : true,
  };
}

function isSearchFilterField(value: unknown): value is AISearchFilterField {
  return value === "query" || value === "vendor" || value === "product" || value === "cwe" || value === "since" || value === "minSeverity" || value === "sort";
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
