import { AISettings, AIProvider } from "./types";

export const AI_SETTINGS_UPDATED_EVENT = "cvesearch:ai-settings-updated";

export function getDefaultAISettings(): AISettings {
  return {
    provider: "heuristic",
    model: "",
    apiKey: "",
  };
}

export function readAISettings(): AISettings {
  return getDefaultAISettings();
}

export function writeAISettings(settings: AISettings): AISettings {
  const normalized = normalizeAISettings(settings);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AI_SETTINGS_UPDATED_EVENT));
  }

  return normalized;
}

export function normalizeAISettings(value: unknown): AISettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const provider = isProvider(record.provider) ? record.provider : "heuristic";
  const model = typeof record.model === "string" ? record.model.trim() : "";

  return {
    provider,
    model,
    apiKey: "",
  };
}

function isProvider(value: unknown): value is AIProvider {
  return value === "heuristic" || value === "openai" || value === "anthropic";
}
