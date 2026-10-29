import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getOrCreateWorkspaceSession, getWorkspaceSession } from "../src/lib/auth-session";

const DAY_MS = 24 * 60 * 60 * 1000;

test("a session used on day 29 is still valid on day 45", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-session-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "session.db");
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: start });

  try {
    const created = getOrCreateWorkspaceSession(new Request("https://example.test/"));
    const cookie = `cvesearch_session=${created.sessionId}`;
    const request = () => new Request("https://example.test/", { headers: { cookie } });

    t.mock.timers.setTime(start + 1 * DAY_MS);
    assert.equal(getWorkspaceSession(request())?.setCookieHeader, undefined);

    t.mock.timers.setTime(start + 29 * DAY_MS);
    // A read-only lookup (server components cannot set cookies) must not use up the refresh.
    assert.equal(getWorkspaceSession(request(), { refresh: false })?.setCookieHeader, undefined);
    const day29 = getWorkspaceSession(request());
    assert.equal(day29?.userId, created.userId);
    assert.match(day29?.setCookieHeader ?? "", /cvesearch_session=.*Max-Age=2592000/);

    t.mock.timers.setTime(start + 45 * DAY_MS);
    const day45 = getOrCreateWorkspaceSession(request());
    assert.equal(day45.sessionId, created.sessionId);
    assert.equal(day45.userId, created.userId);
  } finally {
    t.mock.timers.reset();
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
