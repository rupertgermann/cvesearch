import "./helpers/path-alias";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/github/notifications/route";
import { resetAPIRateLimits } from "../src/lib/api-route-guard";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import {
  createRepoFindingsNotification,
  RepoFindingsNotification,
} from "../src/lib/repo-scans-store";

test("GET /api/github/notifications lists the user's recent new-finding notifications, newest first", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-repo-notifications-"));
  const previous = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");
  resetAPIRateLimits();
  try {
    const me = getOrCreateWorkspaceSession(new Request("https://example.test/"));
    const other = getOrCreateWorkspaceSession(new Request("https://example.test/"));
    createRepoFindingsNotification(me.userId, "acme/app", ["GHSA-a (lodash)"]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    createRepoFindingsNotification(me.userId, "acme/api", ["GHSA-b (axios)"]);
    createRepoFindingsNotification(other.userId, "other/repo", ["GHSA-c (x)"]);

    const response = await GET(new NextRequest("https://example.test/api/github/notifications", {
      headers: { cookie: `cvesearch_session=${me.sessionId}` },
    }));
    const body = (await response.json()) as RepoFindingsNotification[];

    assert.equal(response.status, 200);
    assert.deepEqual(body.map((item) => [item.repoFullName, item.findings]), [
      ["acme/api", ["GHSA-b (axios)"]],
      ["acme/app", ["GHSA-a (lodash)"]],
    ]);
  } finally {
    resetAPIRateLimits();
    if (previous === undefined) delete process.env.DATABASE_FILE;
    else process.env.DATABASE_FILE = previous;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
