import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import { normalizeSearchState } from "../src/lib/search";
import { loadAlertEvaluationsForUser } from "../src/lib/workspace-context";
import { getDb } from "../src/lib/db";
import {
  createAlertRuleForUser,
  deleteAlertRuleForUser,
  importWorkspaceStateForUser,
  listAlertRulesForUser,
  listAlertRuleMatches,
  markAlertRuleCheckedForUser,
  recordAlertRuleMatches,
} from "../src/lib/workspace-store";

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

    // Paging stops at the first page entirely older than cursor - 3h lookback (1 record/minute → page 3).
    upstream.requestedPages.length = 0;
    const second = await loadAlertEvaluationsForUser(session.userId);
    assert.deepEqual(upstream.requestedPages, [1, 2, 3]);
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

async function withAlertDb(run: (userId: string) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-alert-eval-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "alerts.db");
  try {
    await run(getOrCreateWorkspaceSession(new Request("https://example.test/alerts")).userId);
  } finally {
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("alert evaluation reports truncation when more new CVEs arrived than the page cap covers", async () => {
  await withAlertDb(async (userId) => {
    await createAlertRuleForUser(userId, "OpenSSL", normalizeSearchState({ query: "openssl" }));
    const first = installFakeUpstream(buildFeed(300));
    try {
      assert.equal((await loadAlertEvaluationsForUser(userId)).truncated, false);
    } finally {
      first.restore();
    }

    const later = installFakeUpstream([...buildFeed(4100, 300), ...buildFeed(300)]);
    try {
      assert.equal((await loadAlertEvaluationsForUser(userId)).truncated, true);
    } finally {
      later.restore();
    }
  });
});

test("a truncated evaluation leaves the unread gap for the next run instead of skipping it", async () => {
  await withAlertDb(async (userId) => {
    const rule = await createAlertRuleForUser(userId, "Gap", normalizeSearchState({ query: "gapmarker" }));
    const first = installFakeUpstream(buildFeed(300));
    try {
      await loadAlertEvaluationsForUser(userId);
    } finally {
      first.restore();
    }

    // 4100 newer records: the 40-page cap reads 4000, so record 4050 sits in the unread gap.
    const newer = buildFeed(4100, 300);
    newer[4050] = { ...newer[4050], summary: "gapmarker in the gap" };
    const feed = [...newer, ...buildFeed(300)];
    const upstream = installFakeUpstream(feed);
    try {
      assert.equal((await loadAlertEvaluationsForUser(userId)).truncated, true);
      assert.deepEqual(listAlertRuleMatches(rule.id).matching.map((cve) => cve.id), []);

      upstream.requestedPages.length = 0;
      const next = await loadAlertEvaluationsForUser(userId);
      assert.equal(next.truncated, false);
      assert.deepEqual(upstream.requestedPages, [1, 2, 3, 41, 42, 43, 44], "new records first, then the gap");
      assert.deepEqual(listAlertRuleMatches(rule.id).matching.map((cve) => cve.id), [newer[4050].id]);

      upstream.requestedPages.length = 0;
      await loadAlertEvaluationsForUser(userId);
      assert.deepEqual(upstream.requestedPages, [1, 2, 3], "a closed gap is not paged again");
    } finally {
      upstream.restore();
    }
  });
});

test("stored alert matches are the newest published, survive a corrupt row and dedupe by CVE id", async () => {
  await withAlertDb(async (userId) => {
    const rule = await createAlertRuleForUser(userId, "All", normalizeSearchState({}));
    const oldestFirst = buildFeed(250).reverse();
    const newestId = oldestFirst[249].id;
    recordAlertRuleMatches(rule.id, oldestFirst, null);
    recordAlertRuleMatches(rule.id, [{ id: "GHSA-xxxx-yyyy-zzzz", aliases: [newestId] }], null);
    getDb().prepare("UPDATE alert_rule_matches SET summary_json = '{broken' WHERE cve_id = ?").run(newestId);

    const stored = listAlertRuleMatches(rule.id);
    assert.equal(stored.unread, 250);
    assert.deepEqual(
      stored.matching.map((cve) => cve.id).sort(),
      oldestFirst.slice(50, 249).map((cve) => cve.id).sort()
    );
  });
});

test("deleting an alert rule removes its stored matches", async () => {
  await withAlertDb(async (userId) => {
    const rule = await createAlertRuleForUser(userId, "All", normalizeSearchState({}));
    recordAlertRuleMatches(rule.id, buildFeed(3), null);
    assert.equal(await deleteAlertRuleForUser(userId, rule.id), true);
    const { count } = getDb().prepare("SELECT COUNT(*) as count FROM alert_rule_matches").get() as { count: number };
    assert.equal(count, 0);
  });
});

test("re-importing an alert rule does not keep stale matches", async () => {
  await withAlertDb(async (userId) => {
    const rule = await createAlertRuleForUser(userId, "All", normalizeSearchState({}));
    recordAlertRuleMatches(rule.id, buildFeed(3), null);
    await importWorkspaceStateForUser(
      userId,
      { watchlist: [], alertRules: [rule], inventoryAssets: [], triageRecords: [] },
      "merge"
    );
    assert.equal(listAlertRuleMatches(rule.id).unread, 0);
  });
});

test("alert evaluation keeps paging past a page shortened by duplicate ids", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-alert-dup-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "alerts.db");
  const feed = buildFeed(300);
  feed[1] = { ...feed[1], id: feed[0].id }; // page 1 parses to 99 rows
  const upstream = installFakeUpstream(feed);

  try {
    const session = getOrCreateWorkspaceSession(new Request("https://example.test/alerts"));
    const rule = await createAlertRuleForUser(session.userId, "OpenSSL", normalizeSearchState({ query: "openssl" }));
    recordAlertRuleMatches(rule.id, [], feed[250].published);

    const result = await loadAlertEvaluationsForUser(session.userId);
    assert.deepEqual(result.evaluations[0].matching.map((cve) => cve.id), [feed[150].id]);
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

test("alert evaluation stores a late-listed match published before the cursor", async () => {
  await withAlertDb(async (userId) => {
    const rule = await createAlertRuleForUser(userId, "OpenSSL", normalizeSearchState({ query: "openssl" }));
    const feed = buildFeed(300).map((cve) => ({ ...cve, summary: "Unrelated issue" }));
    const first = installFakeUpstream(feed);
    try {
      await loadAlertEvaluationsForUser(userId);
    } finally {
      first.restore();
    }

    // CIRCL lists a record published an hour before the cursor at the top of page 1.
    const late = { id: "CVE-2026-999999", summary: "OpenSSL flaw ingested late", published: feed[60].published };
    const second = installFakeUpstream([late, ...feed]);
    try {
      const result = await loadAlertEvaluationsForUser(userId);
      assert.deepEqual(result.evaluations[0].matching.map((cve) => cve.id), [late.id]);
      assert.equal(result.evaluations[0].unread, 1);
    } finally {
      second.restore();
    }
    assert.ok(rule.id);
  });
});

test("read alert matches beyond the newest 200 are pruned", async () => {
  await withAlertDb(async (userId) => {
    const rule = await createAlertRuleForUser(userId, "All", normalizeSearchState({}));
    recordAlertRuleMatches(rule.id, buildFeed(250), null);
    await markAlertRuleCheckedForUser(userId, rule.id);
    recordAlertRuleMatches(rule.id, [], null);

    const count = getDb().prepare("SELECT COUNT(*) as count FROM alert_rule_matches WHERE rule_id = ?").get(rule.id) as { count: number };
    assert.equal(count.count, 200);
  });
});

test("stored alert matches from before list normalization read back with description and score", async () => {
  await withAlertDb(async (userId) => {
    const rule = await createAlertRuleForUser(userId, "All", normalizeSearchState({}));
    recordAlertRuleMatches(rule.id, [{
      id: "GHSA-aaaa-bbbb-cccc",
      details: "Prototype pollution in example-lib",
      severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }],
    } as never], null);

    const [stored] = listAlertRuleMatches(rule.id).matching;
    assert.equal(stored.description, "Prototype pollution in example-lib");
    assert.equal(stored.cvss3, 9.8);
  });
});

test("alert rules list their unread match count", async () => {
  await withAlertDb(async (userId) => {
    const rule = await createAlertRuleForUser(userId, "All", normalizeSearchState({}));
    recordAlertRuleMatches(rule.id, buildFeed(3), null);
    assert.equal((await listAlertRulesForUser(userId))[0].unreadCount, 3);

    const afterCheck = await markAlertRuleCheckedForUser(userId, rule.id);
    assert.equal(afterCheck[0].unreadCount, 0);
  });
});
