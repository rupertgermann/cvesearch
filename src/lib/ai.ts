import { AISettings } from "./types";

export {
  buildHeuristicCveInsight,
  buildHeuristicDigest,
  generateCveInsight,
  generateDigest,
  generateSearchInterpretation,
  getRecentAIRuns,
  getServerAIConfigurationSummary,
  interpretSearchPromptHeuristically,
} from "./ai-service";

export type {
  CveInsightInput,
  DigestInput,
  ServerAIConfigurationSummary,
} from "./ai-service";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";

export async function callModel(prompt: string, settings: AISettings): Promise<string> {
  if (settings.provider === "anthropic") {
    return callAnthropic(prompt, settings);
  }

  return callOpenAI(prompt, settings);
}

export function resolveAISettings(settings?: Partial<AISettings>): AISettings {
  const provider = settings?.provider ?? (process.env.OPENAI_API_KEY ? "openai" : "heuristic");
  const apiKey =
    settings?.apiKey ??
    (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) ??
    "";
  const model =
    settings?.model ??
    (provider === "anthropic" ? process.env.ANTHROPIC_MODEL : process.env.OPENAI_MODEL) ??
    "";

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

async function callOpenAI(prompt: string, settings: AISettings): Promise<string> {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_OPENAI_MODEL,
      temperature: 0.2,
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

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI response did not include content");
  }

  return content;
}

async function callAnthropic(prompt: string, settings: AISettings): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 800,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: `Return only JSON. No markdown. No prose outside JSON.\n\n${prompt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic error: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.content?.find?.((item: { type?: string }) => item.type === "text")?.text;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Anthropic response did not include content");
  }

  return content;
}
