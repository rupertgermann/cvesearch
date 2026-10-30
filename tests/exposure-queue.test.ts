import "./helpers/path-alias";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/exposure/route";
import { resetAPIRateLimits } from "../src/lib/api-route-guard";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import type { ExposureQueue } from "../src/lib/exposure";
import { loadExposureQueueForUser } from "../src/lib/exposure-queue";
import { addMonitoredRepo } from "../src/lib/monitored-repos-store";
import { persistRepoScanResult } from "../src/lib/repo-scans-store";
import { createInventoryAssetForUser, updateInventoryAssetForUser } from "../src/lib/workspace-store";

const BASE_TS = Date.parse("2026-10-01T00:00:00.000Z");
const OPENSSL_CVE = "CVE-2026-200150";

// 300 records, newest first, one per minute; position 150 is an OpenSSL 3.0.0–3.0.7 CVE 5 record.
function buildFeed(count = 300) {
  return Array.from({ length: count }, (_, index) => {
    const id = `CVE-2026-${200000 + count - index}`;
    const published = new Date(BASE_TS + (count - index) * 60_000).toISOString();
    if (id !== OPENSSL_CVE) return { id, summary: "Unrelated issue", published };
    return {
      id,
      published,
      containers: {
        cna: {
          descriptions: [{ lang: "en", value: "X.400 address type confusion in OpenSSL" }],
          affected: [{ vendor: "OpenSSL", product: "OpenSSL", versions: [{ version: "3.0.0", lessThan: "3.0.8", status: "affected", versionType: "semver" }] }],
          metrics: [{ cvssV3_1: { baseScore: 7.4, baseSeverity: "HIGH", vectorString: "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:H" } }],
        },
      },
    };
  });
}

function installFakeUpstream(feed: Array<Record<string, unknown>>) {
  const originalFetch = globalThis.fetch;
  const requestedPages: number[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === "api.first.org") {
      const ids = (url.searchParams.get("cve") ?? "").split(",");
      return Response.json({ data: ids.map((cve) => ({ cve, epss: "0.42" })) });
    }
    if (url.hostname === "raw.githubusercontent.com") {
      return Response.json({ vulnerabilities: [{
        cveID: OPENSSL_CVE, vendorProject: "OpenSSL", product: "OpenSSL", vulnerabilityName: "OpenSSL type confusion",
        dateAdded: "2026-10-02", shortDescription: "", requiredAction: "Patch", dueDate: "2026-10-23",
      }] });
    }
    if (!url.pathname.includes("/vulnerability/")) return Response.json({});
    const page = Number(url.searchParams.get("page"));
    const perPage = Number(url.searchParams.get("per_page"));
    requestedPages.push(page);
    return Response.json(feed.slice((page - 1) * perPage, page * perPage));
  }) as typeof fetch;
  return { requestedPages, restore: () => { globalThis.fetch = originalFetch; } };
}

async function withTempDb(run: (session: { userId: string; sessionId: string }) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-exposure-"));
  const overrides = { DATABASE_FILE: path.join(tempDir, "state.db"), API_REQUEST_LOG_FILE: path.join(tempDir, "api.json") };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  resetAPIRateLimits();
  try {
    await run(getOrCreateWorkspaceSession(new Request("https://example.test/")));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function getQueue(sessionId: string): Promise<{ status: number; body: ExposureQueue }> {
  const response = await GET(new NextRequest("https://example.test/api/exposure", {
    headers: { cookie: `cvesearch_session=${sessionId}` },
  }));
  return { status: response.status, body: await response.json() };
}

const opensslAsset = {
  name: "Edge proxy",
  vendor: "openssl",
  product: "openssl",
  version: "3.0.7",
  environment: "production",
  criticality: "critical" as const,
  notes: "",
};

test("adding inventory asset openssl 3.0.7 puts the matching new CVE in the queue without a search", async () => {
  await withTempDb(async (session) => {
    const upstream = installFakeUpstream(buildFeed());
    try {
      const empty = await getQueue(session.sessionId);
      assert.equal(empty.status, 200);
      assert.deepEqual(empty.body, { rows: [], hasSources: false, truncated: false });
      assert.deepEqual(upstream.requestedPages, [], "no sources means no feed paging");

      const asset = await createInventoryAssetForUser(session.userId, opensslAsset);
      const first = await getQueue(session.sessionId);
      assert.equal(first.body.hasSources, true);
      assert.equal(first.body.rows.length, 1);
      const [row] = first.body.rows;
      assert.equal(row.key, `${OPENSSL_CVE}::${asset.id}`);
      assert.equal(row.source, "inventory");
      assert.equal(row.criticality, "critical");
      assert.equal(row.assetLabel, "Edge proxy (openssl 3.0.7)");
      assert.equal(row.cve.kev?.cveID, OPENSSL_CVE);
      assert.equal(row.cve.epss, 0.42);
      assert.equal(row.cve.cvss3, 7.4);
      assert.deepEqual([row.priority, row.priorityReason], ["P1", "KEV + prod"]);

      // Second load only pages back to the stored cursor (minus the 3h lookback) and keeps first-seen.
      upstream.requestedPages.length = 0;
      const second = await getQueue(session.sessionId);
      assert.deepEqual(upstream.requestedPages, [1, 2, 3]);
      assert.deepEqual(second.body.rows.map((item) => [item.key, item.firstSeenAt]), [[row.key, row.firstSeenAt]]);
    } finally {
      upstream.restore();
    }
  });
});

test("changing an asset's version re-matches it from a fresh baseline", async () => {
  await withTempDb(async (session) => {
    const upstream = installFakeUpstream(buildFeed());
    try {
      const asset = await createInventoryAssetForUser(session.userId, opensslAsset);
      assert.equal((await loadExposureQueueForUser(session.userId)).rows.length, 1);

      await updateInventoryAssetForUser(session.userId, asset.id, { version: "3.0.8" });
      assert.equal((await loadExposureQueueForUser(session.userId)).rows.length, 0);

      await updateInventoryAssetForUser(session.userId, asset.id, { version: "3.0.7", notes: "renamed" });
      assert.equal((await loadExposureQueueForUser(session.userId)).rows.length, 1);
    } finally {
      upstream.restore();
    }
  });
});

test("findings from the latest scan of each monitored repo are queue rows", async () => {
  await withTempDb(async (session) => {
    const upstream = installFakeUpstream([]);
    try {
      const repo = await addMonitoredRepo(session.userId, {
        githubId: 1, fullName: "acme/web", htmlUrl: "https://github.com/acme/web", isPrivate: false, defaultBranch: "main",
      });
      const finding = {
        vulnerability: {
          id: "GHSA-aaaa-bbbb-cccc", aliases: [OPENSSL_CVE], summary: "", details: "Prototype pollution",
          severity: [], affected: [], references: [], published: "2026-01-01T00:00:00Z", modified: "2026-01-01T00:00:00Z",
        },
        matchedDependency: { name: "lodash", version: "4.17.0", ecosystem: "npm" as const, isDev: false },
        cveIds: [OPENSSL_CVE],
      };
      const scan = (scannedAt: string, vulnerabilities: typeof finding[]) =>
        persistRepoScanResult(session.userId, repo.fullName, "main", { repoFullName: repo.fullName, scannedAt, dependencyCount: 1, locationCount: 1, vulnerabilities });
      await scan("2026-09-01T00:00:00.000Z", [finding]);
      await scan("2026-10-01T00:00:00.000Z", [finding]);

      const queue = await loadExposureQueueForUser(session.userId);
      assert.equal(queue.hasSources, true);
      assert.deepEqual(queue.rows.map((row) => [row.key, row.repoFullName, row.firstSeenAt, row.cve.epss]), [
        [`${OPENSSL_CVE}::${repo.id}:npm:lodash`, "acme/web", "2026-09-01T00:00:00.000Z", 0.42],
      ]);

      await scan("2026-10-02T00:00:00.000Z", []);
      assert.deepEqual((await loadExposureQueueForUser(session.userId)).rows, [], "fixed findings leave the queue");
    } finally {
      upstream.restore();
    }
  });
});
