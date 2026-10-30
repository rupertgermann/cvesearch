import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createNotificationPreferenceForUser,
  listNotificationDeliveriesForUser,
  listNotificationPreferencesForUser,
  runDueNotificationDigestsForUser,
  updateNotificationPreferenceForUser,
} from "../src/lib/notifications-store";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import { getDb } from "../src/lib/db";

interface Sent { url: string; body: Record<string, unknown> }

// Swaps fetch: posts to hooks.example.test are captured; everything else (CVE feed, AI) fails fast.
async function withDeliveryEnv(respond: (url: string) => Response | Promise<Response>, run: (userId: string, sent: Sent[]) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-delivery-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");
  const originalFetch = globalThis.fetch;
  const sent: Sent[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://hooks.example.test/")) {
      sent.push({ url, body: JSON.parse(String(init?.body)) });
      return respond(url);
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  try {
    const session = getOrCreateWorkspaceSession(new Request("https://example.test/workspace"));
    await run(session.userId, sent);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousDatabaseFile === undefined) delete process.env.DATABASE_FILE;
    else process.env.DATABASE_FILE = previousDatabaseFile;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const ok = () => new Response("ok", { status: 200 });

test("a due webhook digest is POSTed once as JSON with headline, summary and items, and marked sent", async () => {
  await withDeliveryEnv(ok, async (userId, sent) => {
    await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "webhook", destination: "https://hooks.example.test/a", cadence: "daily" });

    const [delivery] = await runDueNotificationDigestsForUser(userId, { force: true });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, "https://hooks.example.test/a");
    assert.equal(sent[0].body.headline, delivery.headline);
    assert.equal(typeof sent[0].body.summary, "string");
    assert.ok(Array.isArray(sent[0].body.items));
    assert.equal(delivery.status, "sent");
    assert.equal((await listNotificationDeliveriesForUser(userId))[0].status, "sent");
  });
});

test("a due Slack digest posts a Slack-compatible text payload", async () => {
  await withDeliveryEnv(ok, async (userId, sent) => {
    await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "slack", destination: "https://hooks.example.test/slack", cadence: "daily" });

    const [delivery] = await runDueNotificationDigestsForUser(userId, { force: true });

    assert.equal(sent.length, 1);
    assert.equal(typeof sent[0].body.text, "string");
    assert.ok((sent[0].body.text as string).includes(delivery.headline));
    assert.equal(delivery.status, "sent");
  });
});

test("a non-2xx response marks the delivery failed with the reason, keeps it due, and the next run retries", async () => {
  let status = 500;
  await withDeliveryEnv(() => new Response("boom", { status }), async (userId, sent) => {
    const pref = await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "webhook", destination: "https://hooks.example.test/a", cadence: "daily" });
    // Make it due without force so the run behaves like the scheduler.
    getDb().prepare("UPDATE user_notification_preferences SET next_run_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), pref.id);

    const [failed] = await runDueNotificationDigestsForUser(userId);
    assert.equal(failed.status, "failed");
    assert.match(failed.error ?? "", /500/);
    assert.equal((await listNotificationDeliveriesForUser(userId))[0].error, failed.error);

    const [backedOff] = await listNotificationPreferencesForUser(userId);
    assert.ok(Date.parse(backedOff.nextRunAt!) > Date.now() + 30 * 60 * 1000, "failed delivery backs off instead of retrying every tick");
    assert.deepEqual(await runDueNotificationDigestsForUser(userId), []);

    getDb().prepare("UPDATE user_notification_preferences SET next_run_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), pref.id);
    status = 200;
    const [retried] = await runDueNotificationDigestsForUser(userId);
    assert.equal(retried?.status, "sent");
    assert.equal(sent.length, 2);

    assert.deepEqual(await runDueNotificationDigestsForUser(userId), [], "a sent digest is not re-sent");
    assert.equal(sent.length, 2);
  });
});

test("a network error marks the delivery failed", async () => {
  await withDeliveryEnv(() => { throw new TypeError("fetch failed"); }, async (userId) => {
    await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "slack", destination: "https://hooks.example.test/s", cadence: "daily" });
    const [delivery] = await runDueNotificationDigestsForUser(userId, { force: true });
    assert.equal(delivery.status, "failed");
    assert.match(delivery.error ?? "", /fetch failed/);
    const [pref] = await listNotificationPreferencesForUser(userId);
    assert.equal(pref.lastSentAt, null);
  });
});

test("preview runs make no outbound calls and still record an in-app delivery", async () => {
  await withDeliveryEnv(ok, async (userId, sent) => {
    await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "webhook", destination: "https://hooks.example.test/a", cadence: "daily" });
    const [delivery] = await runDueNotificationDigestsForUser(userId, { force: true, preview: true });
    assert.equal(sent.length, 0);
    assert.equal(delivery.status, "preview");
    assert.equal((await listNotificationDeliveriesForUser(userId)).length, 1);
  });
});

test("non-HTTPS webhook and Slack destinations are rejected on save", async () => {
  await withDeliveryEnv(ok, async (userId) => {
    await assert.rejects(
      createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "webhook", destination: "http://hooks.example.test/a", cadence: "daily" }),
      /HTTPS/
    );
    const email = await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "email", destination: "sec@example.test", cadence: "daily" });
    await assert.rejects(
      updateNotificationPreferenceForUser(userId, email.id, { channel: "slack" }),
      /HTTPS/
    );
  });
});

test("a stored non-HTTPS destination is skipped at delivery time and marked failed", async () => {
  await withDeliveryEnv(ok, async (userId, sent) => {
    const pref = await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "webhook", destination: "https://hooks.example.test/a", cadence: "daily" });
    getDb().prepare("UPDATE user_notification_preferences SET destination = ? WHERE id = ?").run("http://hooks.example.test/a", pref.id);

    const [delivery] = await runDueNotificationDigestsForUser(userId, { force: true });
    assert.equal(sent.length, 0);
    assert.equal(delivery.status, "failed");
    assert.match(delivery.error ?? "", /HTTPS/);
  });
});

test("email destinations stay record-only", async () => {
  await withDeliveryEnv(ok, async (userId, sent) => {
    await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "email", destination: "sec@example.test", cadence: "daily" });
    const [delivery] = await runDueNotificationDigestsForUser(userId, { force: true });
    assert.equal(sent.length, 0);
    assert.equal(delivery.status, "sent");
  });
});

test("redirects are not followed and count as a failed delivery", async () => {
  await withDeliveryEnv(() => new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/latest/meta-data/" } }), async (userId, sent) => {
    await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "webhook", destination: "https://hooks.example.test/a", cadence: "daily" });
    const [delivery] = await runDueNotificationDigestsForUser(userId, { force: true });
    assert.equal(sent.length, 1);
    assert.equal(delivery.status, "failed");
    assert.match(delivery.error ?? "", /302/);
  });
});

test("a delivery that times out is marked failed", async () => {
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  await withDeliveryEnv(() => { throw abort; }, async (userId) => {
    await createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "webhook", destination: "https://hooks.example.test/a", cadence: "daily" });
    const [delivery] = await runDueNotificationDigestsForUser(userId, { force: true });
    assert.equal(delivery.status, "failed");
    assert.equal(delivery.error, "Delivery timed out");
  });
});

for (const destination of ["https://127.0.0.1/x", "https://localhost/x", "https://169.254.169.254/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://172.20.0.1/x", "https://[::1]/x"]) {
  test(`private destination ${destination} is rejected on save`, async () => {
    await withDeliveryEnv(ok, async (userId) => {
      await assert.rejects(
        createNotificationPreferenceForUser(userId, { teamName: "Sec", channel: "webhook", destination, cadence: "daily" }),
        /public HTTPS/
      );
    });
  });
}
