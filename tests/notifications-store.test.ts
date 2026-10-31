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
import { toggleWatchlistEntry } from "../src/lib/workspace-store";

test("notification store creates delivery records for due digests", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-notifications-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "notifications.db");

  try {
    const session = getOrCreateWorkspaceSession(new Request("https://example.test/workspace"));
    await toggleWatchlistEntry(session.userId, "CVE-2026-7777");
    await createNotificationPreferenceForUser(session.userId, {
      teamName: "Security",
      channel: "in_app",
      destination: "#vuln-ops",
      cadence: "daily",
    });

    const deliveries = await runDueNotificationDigestsForUser(session.userId, { force: true });
    const stored = await listNotificationDeliveriesForUser(session.userId);

    assert.equal(deliveries.length, 1);
    assert.equal(stored.length, 1);
    assert.match(stored[0]?.headline ?? "", /Tracking|digest/i);
  } finally {
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("re-enabling a paused notification schedule restores the next run time", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-notifications-toggle-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "notifications.db");

  try {
    const session = getOrCreateWorkspaceSession(new Request("https://example.test/workspace"));
    const created = await createNotificationPreferenceForUser(session.userId, {
      teamName: "Security",
      channel: "in_app",
      destination: "#vuln-ops",
      cadence: "daily",
    });

    const paused = await updateNotificationPreferenceForUser(session.userId, created.id, { enabled: false });
    const resumed = await updateNotificationPreferenceForUser(session.userId, created.id, { enabled: true });
    const stored = await listNotificationPreferencesForUser(session.userId);

    assert.equal(paused?.enabled, false);
    assert.equal(paused?.nextRunAt, null);
    assert.equal(resumed?.enabled, true);
    assert.notEqual(resumed?.nextRunAt, null);
    assert.equal(stored[0]?.enabled, true);
    assert.notEqual(stored[0]?.nextRunAt, null);
  } finally {
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
