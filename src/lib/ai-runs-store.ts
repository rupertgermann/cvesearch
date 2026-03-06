import { promises as fs } from "node:fs";
import path from "node:path";
import { AIRunRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const MAX_STORED_AI_RUNS = 200;

export async function listRecentAIRuns(limit = 25): Promise<AIRunRecord[]> {
  const runs = await readAIRuns();
  return runs.slice(0, normalizeLimit(limit));
}

export async function appendAIRun(record: AIRunRecord): Promise<void> {
  const runs = await readAIRuns();
  const next = [normalizeAIRun(record), ...runs].slice(0, MAX_STORED_AI_RUNS);
  await writeAIRuns(next);
}

async function readAIRuns(): Promise<AIRunRecord[]> {
  try {
    const raw = await fs.readFile(getAIRunsFile(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAIRunRecord).map(normalizeAIRun) : [];
  } catch {
    return [];
  }
}

async function writeAIRuns(runs: AIRunRecord[]): Promise<void> {
  const file = getAIRunsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(runs, null, 2));
}

function getAIRunsFile(): string {
  return process.env.AI_RUNS_FILE?.trim() || path.join(DATA_DIR, "ai-runs.json");
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

function isAIRunRecord(value: unknown): value is AIRunRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.feature === "string" &&
    typeof record.provider === "string" &&
    typeof record.model === "string" &&
    typeof record.mode === "string" &&
    typeof record.status === "string" &&
    typeof record.prompt === "string" &&
    typeof record.output === "string" &&
    Array.isArray(record.toolCalls) &&
    typeof record.error === "string" &&
    typeof record.durationMs === "number" &&
    typeof record.createdAt === "string"
  );
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 25;
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}
