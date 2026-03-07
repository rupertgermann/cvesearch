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
    createdAt: row.createdAt,
  };
}

function normalizeAIRun(record: AIRunRecord): AIRunRecord {
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

function isAIFeature(value: string): value is AIFeature {
  return ["search_assistant", "cve_insight", "daily_digest", "triage_agent", "remediation_agent", "watchlist_analyst"].includes(value);
}

function isAIProvider(value: string): value is AIProvider {
  return ["heuristic", "openai", "anthropic"].includes(value);
}

function isAIRunStatus(value: string): value is AIRunStatus {
  return ["success", "fallback", "error"].includes(value);
}
