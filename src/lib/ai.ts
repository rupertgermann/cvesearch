import { AIOverrides, AIProvider, AISettings } from "./types";
import { callAnthropicText } from "./anthropic-client";
import { callOpenAIText } from "./openai-client";

export {
  buildHeuristicRemediationPlan,
  generateRemediationPlan,
  generateSearchInterpretation,
  getServerAIConfigurationSummary,
  interpretSearchPromptHeuristically,
  prepareRemediationPromptInput,
} from "./ai-service";

export type {
  RemediationPlanInput,
  ServerAIConfigurationSummary,
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
export function resolveAISettings(overrides?: AIOverrides): AISettings {
  const keys: Partial<Record<AIProvider, string>> = {
    openai: process.env.OPENAI_API_KEY?.trim() ?? "",
    anthropic: process.env.ANTHROPIC_API_KEY?.trim() ?? "",
  };
  const overrideProvider = normalizeProvider(overrides?.provider);
  const honorOverride = !!(overrideProvider && keys[overrideProvider]);
  const requestedProvider = honorOverride ? overrideProvider : normalizeProvider(process.env.AI_PROVIDER);
  const overrideModel = honorOverride && typeof overrides?.model === "string" ? overrides.model.trim() : "";

  const provider: AIProvider = requestedProvider === "heuristic"
    ? "heuristic"
    : requestedProvider && keys[requestedProvider]
      ? requestedProvider
      : keys.openai ? "openai" : keys.anthropic ? "anthropic" : "heuristic";

  const model = (
    overrideModel ||
    (provider === "anthropic" ? process.env.ANTHROPIC_MODEL : process.env.OPENAI_MODEL) ||
    ""
  ).trim();

  return provider === "heuristic"
    ? { provider, model: "", apiKey: "" }
    : { provider, model, apiKey: keys[provider] ?? "" };
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
