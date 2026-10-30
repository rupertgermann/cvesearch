import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import { getDb } from "../src/lib/db";
import { createNotificationPreferenceForUser } from "../src/lib/notifications-store";
import { runSchedulerTick } from "../src/lib/scheduler";
import { normalizeSearchState } from "../src/lib/search";
import { createAlertRuleForUser, listAlertRuleMatches } from "../src/lib/workspace-store";

const feed = [
  { id: "CVE-2026-900002", summary: "Heap overflow in OpenSSL", published: "2026-10-29T10:00:00.000Z" },
  { id: "CVE-2026-900001", summary: "Unrelated issue", published: "2026-10-29T09:00:00.000Z" },
];

async function withSchedulerEnv(run: (hookPosts: string[], release: () => void) => Promise<void>, holdHooks = false) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-scheduler-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");
  const originalFetch = globalThis.fetch;
  const hookPosts: string[] = [];
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "hooks.example.test") {
      hookPosts.push(url.pathname);
      if (holdHooks) await gate;
      return new Response("ok", { status: 200 });
    }
    if (url.pathname.includes("/vulnerability/")) {
      const page = Number(url.searchParams.get("page"));
      return new Response(JSON.stringify(page === 1 ? feed : []), { status: 200 });
    }
    return new Response(JSON.stringify({ vulnerabilities: [] }), { status: 200 });
  }) as typeof fetch;
  try {
    await run(hookPosts, () => release());
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

async function dueWebhook(userId: string, hookPath: string) {
  const pref = await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "webhook", destination: `https://hooks.example.test${hookPath}`, cadence: "daily" });
  getDb().prepare("UPDATE user_notification_preferences SET next_run_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), pref.id);
}

test("a tick delivers due digests for all users, skips not-yet-due ones, and records alert matches", async () => {
  await withSchedulerEnv(async (hookPosts) => {
    const alice = newUser();
    const bob = newUser();
    const carol = newUser();
    await dueWebhook(alice, "/alice");
    await dueWebhook(bob, "/bob");
    await createNotificationPreferenceForUser(carol, { teamName: "Sec", channel: "webhook", destination: "https://hooks.example.test/carol", cadence: "daily" });
    const rule = await createAlertRuleForUser(carol, "OpenSSL", normalizeSearchState({ query: "openssl" }));

    const result = await runSchedulerTick();

    assert.deepEqual([...hookPosts].sort(), ["/alice", "/bob"]);
    assert.equal(result.skipped, false);
    assert.deepEqual(listAlertRuleMatches(rule.id).matching.map((cve) => cve.id), ["CVE-2026-900002"]);

    await runSchedulerTick();
    assert.equal(hookPosts.length, 2, "a second tick does not double-deliver");
  });
});

test("a tick entered while another is running returns without duplicate work", async () => {
  await withSchedulerEnv(async (hookPosts, release) => {
    await dueWebhook(newUser(), "/alice");

    const first = runSchedulerTick();
    while (hookPosts.length === 0) await new Promise((resolve) => setImmediate(resolve));
    const second = await runSchedulerTick();
    release();
    await first;

    assert.equal(second.skipped, true);
    assert.equal(hookPosts.length, 1);
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
