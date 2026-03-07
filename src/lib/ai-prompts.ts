import { AIFeature } from "./types";

interface PromptTemplate<TInput> {
  feature: AIFeature;
  version: string;
  description: string;
  build: (input: TInput) => string;
}

interface SearchPromptInput {
  request: string;
  toolOutputs: unknown;
}

export const AI_PROMPT_TEMPLATES = {
  search_assistant: {
    feature: "search_assistant",
    version: "2026-03-07.search.v1",
    description: "Translate a natural-language vulnerability search into deterministic filters.",
    build: ({ request, toolOutputs }: SearchPromptInput) => [
      "Convert this vulnerability search request into structured filters.",
      "Return only valid JSON with keys query, vendor, product, cwe, since, minSeverity, sort, explanation, assumptions, appliedFilters, needsClarification, clarificationQuestion.",
      'Allowed minSeverity: "ANY" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL".',
      'Allowed sort: "published_desc" | "published_asc" | "cvss_desc" | "cvss_asc" | "risk_desc".',
      "Use the tool outputs below as the source of truth for extracted filters and clarifications.",
      "Tool outputs:",
      JSON.stringify(toolOutputs),
      `Request: ${request}`,
    ].join("\n"),
  } satisfies PromptTemplate<SearchPromptInput>,
  cve_insight: {
    feature: "cve_insight",
    version: "2026-03-07.insight.v1",
    description: "Generate a triage-oriented CVE insight payload with remediation and project context.",
    build: (input: unknown) => [
      "You are a security analyst assistant.",
      "Return only valid JSON matching this TypeScript shape:",
      '{"summary":"string","triage":{"priority":"critical|high|medium|low","status":"new|investigating|mitigated|accepted|closed","confidence":"high|medium|low","ownerRecommendation":"string","rationale":"string","nextSteps":["string"],"signals":[{"label":"string","value":"string","level":"high|medium|low","rationale":"string"}]},"remediation":["string"],"cluster":{"canonicalId":"string","sourceIds":["string"],"relatedIds":["string"],"summary":"string"},"projectContext":{"projectCount":0,"projectNames":["string"],"summary":"string"}}',
      "Base your answer only on this triage input JSON:",
      JSON.stringify(input),
    ].join("\n"),
  } satisfies PromptTemplate<unknown>,
  remediation_agent: {
    feature: "remediation_agent",
    version: "2026-03-07.remediation.v1",
    description: "Draft remediation strategy, compensating controls, validation, and rollout notes for a CVE.",
    build: (input: unknown) => [
      "You are a vulnerability remediation planning assistant.",
      "Return only valid JSON matching this shape:",
      '{"summary":"string","strategy":"string","compensatingControls":["string"],"validationSteps":["string"],"rolloutNotes":["string"],"changeRisk":"high|medium|low","recommendedOwner":"string","ownerRationale":"string","projectContext":{"projectCount":0,"projectNames":["string"],"summary":"string"},"requiresHumanApproval":true}',
      "Base your answer only on this input JSON:",
      JSON.stringify(input),
    ].join("\n"),
  } satisfies PromptTemplate<unknown>,
  watchlist_analyst: {
    feature: "watchlist_analyst",
    version: "2026-03-07.watchlist.v1",
    description: "Review watchlist changes since the last analyst pass and cluster related issues.",
    build: (input: unknown) => [
      "You are a watchlist analyst assistant.",
      "Return only valid JSON matching this shape:",
      '{"headline":"string","summary":"string","newMatches":["string"],"changedSinceLastReview":["string"],"clusters":[{"label":"string","cveIds":["string"],"summary":"string"}],"recommendedActions":["string"],"previousReviewAt":"string|null","reviewedAt":"string"}',
      "Base your answer only on this input JSON:",
      JSON.stringify(input),
    ].join("\n"),
  } satisfies PromptTemplate<unknown>,
  triage_agent: {
    feature: "triage_agent",
    version: "2026-03-07.triage.v1",
    description: "Recommend triage priority, ownership, tags, and next actions for a single CVE.",
    build: (input: unknown) => [
      "You are a vulnerability triage assistant.",
      "Return only valid JSON matching this shape:",
      '{"summary":"string","recommendation":{"priority":"critical|high|medium|low","status":"new|investigating|mitigated|accepted|closed","confidence":"high|medium|low","ownerRecommendation":"string","rationale":"string","nextSteps":["string"],"signals":[{"label":"string","value":"string","level":"high|medium|low","rationale":"string"}]},"recommendedTags":["string"],"recommendedOwner":"string","ownershipRationale":"string","projectContext":{"projectCount":0,"projectNames":["string"],"summary":"string"},"requiresHumanApproval":true}',
      "Base your answer only on this input JSON:",
      JSON.stringify(input),
    ].join("\n"),
  } satisfies PromptTemplate<unknown>,
  daily_digest: {
    feature: "daily_digest",
    version: "2026-03-07.digest.v1",
    description: "Summarize watchlist, alerts, and projects into a concise monitoring digest.",
    build: (input: unknown) => [
      "You are producing a concise vulnerability monitoring digest.",
      "Return only valid JSON matching this shape:",
      '{"headline":"string","sections":[{"title":"string","body":"string","items":["string"]}]}',
      "Use this input JSON:",
      JSON.stringify(input),
    ].join("\n"),
  } satisfies PromptTemplate<unknown>,
} as const;

export function getPromptTemplate(feature: AIFeature) {
  return AI_PROMPT_TEMPLATES[feature];
}

export function getSearchAssistantPromptTemplate() {
  return AI_PROMPT_TEMPLATES.search_assistant;
}

export function getCveInsightPromptTemplate() {
  return AI_PROMPT_TEMPLATES.cve_insight;
}

export function getDailyDigestPromptTemplate() {
  return AI_PROMPT_TEMPLATES.daily_digest;
}

export function getRemediationAgentPromptTemplate() {
  return AI_PROMPT_TEMPLATES.remediation_agent;
}

export function getWatchlistAnalystPromptTemplate() {
  return AI_PROMPT_TEMPLATES.watchlist_analyst;
}

export function getTriageAgentPromptTemplate() {
  return AI_PROMPT_TEMPLATES.triage_agent;
}

export function listPromptTemplates() {
  return Object.values(AI_PROMPT_TEMPLATES).map((template) => ({
    feature: template.feature,
    version: template.version,
    description: template.description,
  }));
}
