import "./helpers/path-alias";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/ai/alerts/investigate/[id]/route";
import { resetAPIRateLimits } from "../src/lib/api-route-guard";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import { setAICacheEntry } from "../src/lib/ai-cache-store";
import { normalizeSearchState } from "../src/lib/search";
import { createAlertRuleForUser, recordAlertRuleMatches } from "../src/lib/workspace-store";

async function withEnv(env: Record<string, string | undefined>, run: (fetchCalls: string[]) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-alert-investigate-"));
  const overrides: Record<string, string | undefined> = {
    DATABASE_FILE: path.join(tempDir, "state.db"),
    API_REQUEST_LOG_FILE: path.join(tempDir, "api-requests.json"),
    AI_PROVIDER: undefined,
    OPENAI_API_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    ...env,
  };
  const previousEnv = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const originalFetch = globalThis.fetch;
  const fetchCalls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    fetchCalls.push(String(input));
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }) as typeof fetch;
  resetAPIRateLimits();
  try {
    await run(fetchCalls);
  } finally {
    globalThis.fetch = originalFetch;
    resetAPIRateLimits();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function newSession() {
  const session = getOrCreateWorkspaceSession(new Request("https://example.test/alerts"));
  return { userId: session.userId, cookie: `cvesearch_session=${session.sessionId}` };
}

async function getCached(ruleId: string, cookie: string) {
  const response = await GET(
    new NextRequest(`https://example.test/api/ai/alerts/investigate/${ruleId}`, { headers: { cookie } }),
    { params: Promise.resolve({ id: ruleId }) },
  );
  return { status: response.status, body: await response.json() };
}

test("GET on /alerts with an empty cache makes no AI request and returns no investigation", async () => {
  await withEnv({ OPENAI_API_KEY: "server-openai-key" }, async (fetchCalls) => {
    const { userId, cookie } = newSession();
    for (const name of ["A", "B", "C"]) {
      const rule = await createAlertRuleForUser(userId, name, normalizeSearchState({ query: name }));
      const { status, body } = await getCached(rule.id, cookie);
      assert.equal(status, 200);
      assert.deepEqual(body, { configured: true, investigation: null });
    }
    assert.deepEqual(fetchCalls, []);
  });
});

test("GET reports AI as not configured when no provider key is set", async () => {
  await withEnv({}, async () => {
    const { userId, cookie } = newSession();
    const rule = await createAlertRuleForUser(userId, "A", normalizeSearchState({}));
    const { body } = await getCached(rule.id, cookie);
    assert.equal(body.configured, false);
  });
});

test("GET marks a cached investigation outdated once newer matches are stored", async () => {
  await withEnv({ OPENAI_API_KEY: "server-openai-key" }, async (fetchCalls) => {
    const { userId, cookie } = newSession();
    const rule = await createAlertRuleForUser(userId, "A", normalizeSearchState({}));
    recordAlertRuleMatches(rule.id, [{ id: "CVE-2026-0001" }], null);
    await new Promise((resolve) => setTimeout(resolve, 5));
    setAICacheEntry(userId, "alert_investigation", rule.id, JSON.stringify({ summary: "cached" }));

    const fresh = await getCached(rule.id, cookie);
    assert.equal(fresh.body.investigation.summary, "cached");
    assert.equal(fresh.body.investigation._newMatches, 0);

    await new Promise((resolve) => setTimeout(resolve, 5));
    recordAlertRuleMatches(rule.id, [{ id: "CVE-2026-0002" }, { id: "CVE-2026-0003" }], null);
    const outdated = await getCached(rule.id, cookie);
    assert.equal(outdated.body.investigation._newMatches, 2);
    assert.ok(outdated.body.investigation._cachedAt);
    assert.deepEqual(fetchCalls, []);
  });
});
