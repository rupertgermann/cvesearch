import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import { normalizeSearchState } from "../src/lib/search";
import { loadAlertEvaluationsForUser } from "../src/lib/workspace-context";
import { createAlertRuleForUser, markAlertRuleCheckedForUser } from "../src/lib/workspace-store";

// 300 records, newest first; only position 150 mentions openssl.
const BASE_TS = Date.parse("2026-10-01T00:00:00.000Z");
function buildFeed(count: number, offsetMinutes = 0) {
  return Array.from({ length: count }, (_, index) => ({
    id: `CVE-2026-${String(100000 + offsetMinutes + count - index)}`,
    summary: index === 150 ? "Buffer overflow in OpenSSL" : "Unrelated issue",
    published: new Date(BASE_TS + (offsetMinutes + count - index) * 60_000).toISOString(),
  }));
}

function installFakeUpstream(feed: Array<Record<string, unknown>>) {
  const originalFetch = globalThis.fetch;
  const requestedPages: number[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (!url.pathname.includes("/vulnerability/")) {
      return new Response(JSON.stringify({ vulnerabilities: [] }), { status: 200 });
    }
    const page = Number(url.searchParams.get("page"));
    const perPage = Number(url.searchParams.get("per_page"));
    requestedPages.push(page);
    return new Response(JSON.stringify(feed.slice((page - 1) * perPage, page * perPage)), { status: 200 });
  }) as typeof fetch;
  return { requestedPages, restore: () => { globalThis.fetch = originalFetch; } };
}

test("alert evaluation stores a match beyond the newest 80 CVEs and tracks unread state", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-alert-eval-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "alerts.db");
  const feed = buildFeed(300);
  const upstream = installFakeUpstream(feed);

  try {
    const session = getOrCreateWorkspaceSession(new Request("https://example.test/alerts"));
    const rule = await createAlertRuleForUser(session.userId, "OpenSSL", normalizeSearchState({ query: "openssl" }));

    const first = await loadAlertEvaluationsForUser(session.userId);
    assert.equal(first.evaluations.length, 1);
    assert.deepEqual(first.evaluations[0].matching.map((cve) => cve.id), [feed[150].id]);
    assert.equal(first.evaluations[0].unread, 1);
    assert.ok(first.sampledCount > 80);

    await markAlertRuleCheckedForUser(session.userId, rule.id);

    // Cursor reached on page 1: only one upstream page is read and the stored match stays, now read.
    upstream.requestedPages.length = 0;
    const second = await loadAlertEvaluationsForUser(session.userId);
    assert.deepEqual(upstream.requestedPages, [1]);
    assert.deepEqual(second.evaluations[0].matching.map((cve) => cve.id), [feed[150].id]);
    assert.equal(second.evaluations[0].unread, 0);
  } finally {
    upstream.restore();
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
