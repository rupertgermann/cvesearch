import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import { getDb } from "../src/lib/db";
import { runSchedulerTick } from "../src/lib/scheduler";
import { normalizeSearchState } from "../src/lib/search";
import { createAlertRuleForUser, listAlertRuleMatches } from "../src/lib/workspace-store";

const feed = [
  { id: "CVE-2026-900002", summary: "Heap overflow in OpenSSL", published: "2026-10-29T10:00:00.000Z" },
  { id: "CVE-2026-900001", summary: "Unrelated issue", published: "2026-10-29T09:00:00.000Z" },
];

async function withSchedulerEnv(run: (feedRequests: string[], release: () => void) => Promise<void>, holdFeed = false) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-scheduler-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");
  const originalFetch = globalThis.fetch;
  const feedRequests: string[] = [];
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/vulnerability/")) {
      feedRequests.push(url.toString());
      if (holdFeed) await gate;
      const page = Number(url.searchParams.get("page"));
      return new Response(JSON.stringify(page === 1 ? feed : []), { status: 200 });
    }
    return new Response(JSON.stringify({ vulnerabilities: [] }), { status: 200 });
  }) as typeof fetch;
  try {
    await run(feedRequests, () => release());
  } finally {
    release();
    globalThis.fetch = originalFetch;
    if (previousDatabaseFile === undefined) delete process.env.DATABASE_FILE;
    else process.env.DATABASE_FILE = previousDatabaseFile;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function newUser(): string {
  return getOrCreateWorkspaceSession(new Request("https://example.test/")).userId;
}

test("a tick records alert matches for every user with a live session", async () => {
  await withSchedulerEnv(async () => {
    const aliceRule = await createAlertRuleForUser(newUser(), "OpenSSL", normalizeSearchState({ query: "openssl" }));
    const bobRule = await createAlertRuleForUser(newUser(), "Everything", normalizeSearchState({}));

    const result = await runSchedulerTick();

    assert.equal(result.skipped, false);
    assert.equal(result.alertUsers, 2);
    assert.deepEqual(listAlertRuleMatches(aliceRule.id).matching.map((cve) => cve.id), ["CVE-2026-900002"]);
    assert.equal(listAlertRuleMatches(bobRule.id).matching.length, 2);
  });
});

test("a tick entered while another is running returns without duplicate work", async () => {
  await withSchedulerEnv(async (feedRequests, release) => {
    await createAlertRuleForUser(newUser(), "OpenSSL", normalizeSearchState({ query: "openssl" }));

    const first = runSchedulerTick();
    while (feedRequests.length === 0) await new Promise((resolve) => setImmediate(resolve));
    const second = await runSchedulerTick();
    assert.equal(feedRequests.length, 1, "the skipped tick fetched nothing");
    release();
    await first;

    assert.equal(second.skipped, true);
  }, true);
});

test("scheduler config is off unless enabled and clamps the interval", async () => {
  const { readSchedulerConfig } = await import("../src/lib/scheduler");
  assert.equal(readSchedulerConfig({}).enabled, false);
  assert.deepEqual(readSchedulerConfig({ SCHEDULER_ENABLED: "true", SCHEDULER_INTERVAL_MS: "120000" }), { enabled: true, intervalMs: 120000, rescanIntervalMs: 86_400_000 });
  assert.equal(readSchedulerConfig({ SCHEDULER_ENABLED: "true", SCHEDULER_INTERVAL_MS: "5" }).intervalMs, 30000);
  assert.equal(readSchedulerConfig({ SCHEDULER_INTERVAL_MS: "junk" }).intervalMs, 300000);
  assert.equal(readSchedulerConfig({ SCHEDULER_INTERVAL_MS: "3000000000" }).intervalMs, 2_147_483_647);
});

test("alert rules of users without a live session are not evaluated", async () => {
  await withSchedulerEnv(async () => {
    const gone = newUser();
    await createAlertRuleForUser(gone, "OpenSSL", normalizeSearchState({ query: "openssl" }));
    getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(gone);

    const result = await runSchedulerTick();
    assert.equal(result.alertUsers, 0);
  });
});
