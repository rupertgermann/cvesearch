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
} as const;

export function getSearchAssistantPromptTemplate() {
  return AI_PROMPT_TEMPLATES.search_assistant;
}

export function getRemediationAgentPromptTemplate() {
  return AI_PROMPT_TEMPLATES.remediation_agent;
}
