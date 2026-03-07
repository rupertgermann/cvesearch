import { AIFeature, AIProvider, AIRunRecord, AIRunStatus } from "./types";
import { getDb, withTransaction } from "./db";

const MAX_STORED_AI_RUNS = 200;

export async function listRecentAIRuns(limit = 25): Promise<AIRunRecord[]> {
  const rows = getDb().prepare(`
    SELECT
      id,
      feature,
      provider,
      model,
      mode,
      status,
      prompt,
      output,
      tool_calls_json as toolCallsJson,
      error,
      duration_ms as durationMs,
      created_at as createdAt
    FROM ai_runs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(normalizeLimit(limit)) as AIRunRow[];

  return rows.map((row) => normalizeAIRunRow(row));
}

export async function appendAIRun(record: AIRunRecord): Promise<void> {
  const normalized = normalizeAIRun(record);

  withTransaction((db) => {
    db.prepare(`
      INSERT OR REPLACE INTO ai_runs (
        id, feature, provider, model, mode, status, prompt, output, tool_calls_json, error, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.id,
      normalized.feature,
      normalized.provider,
      normalized.model,
      normalized.mode,
      normalized.status,
      normalized.prompt,
      normalized.output,
      JSON.stringify(normalized.toolCalls),
      normalized.error,
      normalized.durationMs,
      normalized.createdAt
    );

    const overflow = db.prepare(`
      SELECT id
      FROM ai_runs
      ORDER BY created_at DESC
      LIMIT -1 OFFSET ?
    `).all(MAX_STORED_AI_RUNS) as Array<{ id: string }>;

    for (const row of overflow) {
      db.prepare("DELETE FROM ai_runs WHERE id = ?").run(row.id);
    }
  });
}

interface AIRunRow {
  id: string;
  feature: string;
  provider: string;
  model: string;
  mode: string;
  status: string;
  prompt: string;
  output: string;
  toolCallsJson: string;
  error: string;
  durationMs: number;
  createdAt: string;
}

function normalizeAIRunRow(row: AIRunRow): AIRunRecord {
  const usage = estimateAIRunUsage(row.provider, row.model, row.prompt, row.output);
  return {
    id: row.id,
    feature: isAIFeature(row.feature) ? row.feature : "search_assistant",
    provider: isAIProvider(row.provider) ? row.provider : "heuristic",
    model: row.model,
    mode: row.mode === "configured" ? "configured" : "heuristic",
    status: isAIRunStatus(row.status) ? row.status : "error",
    prompt: row.prompt,
    output: row.output,
    toolCalls: parseToolCalls(row.toolCallsJson),
    error: row.error,
    durationMs: Number.isFinite(row.durationMs) ? row.durationMs : 0,
    promptTokensEstimate: usage.promptTokensEstimate,
    outputTokensEstimate: usage.outputTokensEstimate,
    estimatedCostUsd: usage.estimatedCostUsd,
    createdAt: row.createdAt,
  };
}

function normalizeAIRun(record: AIRunRecord): AIRunRecord {
  const usage = estimateAIRunUsage(record.provider, record.model, record.prompt, record.output);
  return {
    id: record.id,
    feature: record.feature,
    provider: record.provider,
    model: record.model,
    mode: record.mode,
    status: record.status,
    prompt: record.prompt,
    output: record.output,
    toolCalls: Array.isArray(record.toolCalls)
      ? record.toolCalls
          .filter((call): call is AIRunRecord["toolCalls"][number] => Boolean(call) && typeof call === "object")
          .map((call) => ({ tool: call.tool, summary: call.summary }))
      : [],
    error: record.error,
    durationMs: Number.isFinite(record.durationMs) ? record.durationMs : 0,
    promptTokensEstimate: usage.promptTokensEstimate,
    outputTokensEstimate: usage.outputTokensEstimate,
    estimatedCostUsd: usage.estimatedCostUsd,
    createdAt: record.createdAt,
  };
}

function parseToolCalls(raw: string): AIRunRecord["toolCalls"] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.flatMap((call) =>
          call && typeof call === "object" && !Array.isArray(call) && typeof call.tool === "string" && typeof call.summary === "string"
            ? [{ tool: call.tool, summary: call.summary }]
            : []
        )
      : [];
  } catch {
    return [];
  }
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 25;
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}

function estimateAIRunUsage(provider: string, model: string, prompt: string, output: string): {
  promptTokensEstimate: number;
  outputTokensEstimate: number;
  estimatedCostUsd: number;
} {
  const promptTokensEstimate = estimateTokens(prompt);
  const outputTokensEstimate = estimateTokens(output);

  if (provider === "heuristic") {
    return {
      promptTokensEstimate,
      outputTokensEstimate,
      estimatedCostUsd: 0,
    };
  }

  const pricing = getModelPricing(provider, model);
  const estimatedCostUsd =
    (promptTokensEstimate / 1_000_000) * pricing.inputPerMillionUsd +
    (outputTokensEstimate / 1_000_000) * pricing.outputPerMillionUsd;

  return {
    promptTokensEstimate,
    outputTokensEstimate,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
  };
}

function estimateTokens(value: string): number {
  if (!value) {
    return 0;
  }

  return Math.max(1, Math.ceil(value.length / 4));
}

function getModelPricing(provider: string, model: string): { inputPerMillionUsd: number; outputPerMillionUsd: number } {
  const normalized = model.toLowerCase();

  if (provider === "openai") {
    if (normalized.includes("gpt-4.1-mini") || normalized.includes("mini")) {
      return { inputPerMillionUsd: 0.4, outputPerMillionUsd: 1.6 };
    }

    return { inputPerMillionUsd: 2, outputPerMillionUsd: 8 };
  }

  if (provider === "anthropic") {
    if (normalized.includes("haiku")) {
      return { inputPerMillionUsd: 0.8, outputPerMillionUsd: 4 };
    }

    return { inputPerMillionUsd: 3, outputPerMillionUsd: 15 };
  }

  return { inputPerMillionUsd: 0, outputPerMillionUsd: 0 };
}

function isAIFeature(value: string): value is AIFeature {
  return ["search_assistant", "cve_insight", "daily_digest", "triage_agent", "remediation_agent", "watchlist_analyst", "project_summary", "alert_investigation", "exposure_agent"].includes(value);
}

function isAIProvider(value: string): value is AIProvider {
  return ["heuristic", "openai", "anthropic"].includes(value);
}

function isAIRunStatus(value: string): value is AIRunStatus {
  return ["success", "fallback", "error"].includes(value);
}
