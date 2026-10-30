import { AISettings } from "./types";
import { callAnthropicText } from "./anthropic-client";
import { callOpenAIText } from "./openai-client";

export {
  buildHeuristicAlertInvestigation,
  buildHeuristicCveInsight,
  buildHeuristicDigest,
  buildHeuristicExposureAssessment,
  buildHeuristicProjectSummary,
  buildHeuristicRemediationPlan,
  buildHeuristicTriageSuggestion,
  buildHeuristicWatchlistReview,
  generateAlertInvestigation,
  generateCveInsight,
  generateDigest,
  generateExposureAssessment,
  generateProjectSummary,
  generateRemediationPlan,
  generateSearchInterpretation,
  generateTriageSuggestion,
  generateWatchlistReview,
  getRecentAIRuns,
  getServerAIConfigurationSummary,
  interpretSearchPromptHeuristically,
  preparePromptInputForFeature,
} from "./ai-service";

export type {
  AlertInvestigationInput,
  CveInsightInput,
  DigestInput,
  ExposureAssessmentInput,
  ProjectSummaryInput,
  RemediationPlanInput,
  ServerAIConfigurationSummary,
  TriageSuggestionInput,
  WatchlistReviewInput,
} from "./ai-service";

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export async function callModel(prompt: string, settings: AISettings): Promise<string> {
  if (settings.provider === "anthropic") {
    return callAnthropic(prompt, settings);
  }

  return callOpenAI(prompt, settings);
}

// Overrides may come from a client request: they never carry a key, and only select a provider the server has a key for.
export function resolveAISettings(overrides?: { provider?: string; model?: string }): AISettings {
  const openAIKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const overrideProvider = normalizeProvider(overrides?.provider);
  const honorOverride = (overrideProvider === "openai" && !!openAIKey) || (overrideProvider === "anthropic" && !!anthropicKey);
  const requestedProvider = honorOverride ? overrideProvider : normalizeProvider(process.env.AI_PROVIDER);
  const overrideModel = honorOverride && typeof overrides?.model === "string" ? overrides.model.trim() : "";

  const provider = requestedProvider === "heuristic"
    ? "heuristic"
    : requestedProvider === "anthropic" && anthropicKey
      ? "anthropic"
      : requestedProvider === "openai" && openAIKey
        ? "openai"
        : openAIKey
          ? "openai"
          : anthropicKey
            ? "anthropic"
            : "heuristic";

  const apiKey = provider === "anthropic" ? anthropicKey : provider === "openai" ? openAIKey : "";
  const model = (
    overrideModel ||
    (provider === "anthropic" ? process.env.ANTHROPIC_MODEL : process.env.OPENAI_MODEL) ||
    ""
  ).trim();

  if (provider !== "heuristic" && !apiKey) {
    return {
      provider: "heuristic",
      model: "",
      apiKey: "",
    };
  }

  return {
    provider,
    model,
    apiKey,
  };
}

function normalizeProvider(value: string | undefined): AISettings["provider"] | undefined {
  if (value === "heuristic" || value === "openai" || value === "anthropic") {
    return value;
  }

  return undefined;
}

async function callOpenAI(prompt: string, settings: AISettings): Promise<string> {
  return callOpenAIText({
    apiKey: settings.apiKey,
    model: settings.model || DEFAULT_OPENAI_MODEL,
    prompt,
    instructions: "Return only JSON. No markdown. No prose outside JSON.",
  });
}

async function callAnthropic(prompt: string, settings: AISettings): Promise<string> {
  return callAnthropicText({
    apiKey: settings.apiKey,
    model: settings.model || DEFAULT_ANTHROPIC_MODEL,
    prompt,
    maxTokens: 800,
    temperature: 0.2,
  });
}
