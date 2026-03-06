import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendAIRun, listRecentAIRuns } from "../src/lib/ai-runs-store";
import { AIRunRecord } from "../src/lib/types";

test("appendAIRun stores newest runs first and listRecentAIRuns enforces the limit", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-ai-runs-"));
  const previous = process.env.AI_RUNS_FILE;
  process.env.AI_RUNS_FILE = path.join(tempDir, "ai-runs.json");

  const first: AIRunRecord = {
    id: "run-1",
    feature: "search_assistant",
    provider: "heuristic",
    model: "",
    mode: "heuristic",
    status: "fallback",
    prompt: "first prompt",
    output: "first output",
    toolCalls: [{ tool: "inspect_available_filters", summary: "fields loaded" }],
    error: "",
    durationMs: 10,
    createdAt: "2026-03-06T11:00:00.000Z",
  };

  const second: AIRunRecord = {
    ...first,
    id: "run-2",
    prompt: "second prompt",
    output: "second output",
    createdAt: "2026-03-06T11:01:00.000Z",
  };

  try {
    await appendAIRun(first);
    await appendAIRun(second);

    const allRuns = await listRecentAIRuns(10);
    const limitedRuns = await listRecentAIRuns(1);

    assert.equal(allRuns.length, 2);
    assert.equal(allRuns[0].id, "run-2");
    assert.equal(allRuns[1].id, "run-1");
    assert.equal(allRuns[0].toolCalls[0]?.tool, "inspect_available_filters");
    assert.equal(limitedRuns.length, 1);
    assert.equal(limitedRuns[0].id, "run-2");
  } finally {
    if (previous === undefined) {
      delete process.env.AI_RUNS_FILE;
    } else {
      process.env.AI_RUNS_FILE = previous;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
