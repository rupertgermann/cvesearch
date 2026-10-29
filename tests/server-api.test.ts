import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeSearchState } from "../src/lib/search";
import { getHomePageResults } from "../src/lib/server-api";

async function withUpstream(rows: unknown[], run: (requestedUrls: string[]) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-server-api-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  process.env.DATABASE_FILE = path.join(tempDir, "server-api.db");

  globalThis.fetch = (async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("vulnerability.circl.lu")) {
      const params = new URL(url).searchParams;
      const perPage = Number(params.get("per_page"));
      const page = Number(params.get("page"));
      return new Response(JSON.stringify(rows.slice((page - 1) * perPage, page * perPage)));
    }
    return new Response(JSON.stringify({ vulnerabilities: [] }));
  }) as typeof fetch;

  try {
    await run(requestedUrls);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

// 60 newest-first rows; only rows 25 and 45 (beyond upstream page 1) are critical.
const rows = Array.from({ length: 60 }, (_, index) => ({
  id: `CVE-2026-${String(1000 + index)}`,
  summary: `Issue ${index}`,
  published: new Date(Date.UTC(2026, 0, 1) - index * 86_400_000).toISOString(),
  cvss3: index === 25 ? 9.8 : index === 45 ? 9.1 : 5,
}));

test("getHomePageResults sorts by CVSS across more than one upstream page", async () => {
  await withUpstream(rows, async () => {
    const result = await getHomePageResults(normalizeSearchState({ sort: "cvss_desc" }));

    assert.equal(result.error, null);
    assert.equal(result.cves.length, 20);
    assert.deepEqual(result.cves.slice(0, 2).map((cve) => cve.id), ["CVE-2026-1025", "CVE-2026-1045"]);
    assert.match(result.totalHint, /within the 200 newest/);
  });
});

test("getHomePageResults filters minimum severity across upstream pages and paginates locally", async () => {
  await withUpstream(rows, async () => {
    const page1 = await getHomePageResults(normalizeSearchState({ minSeverity: "CRITICAL" }));
    assert.deepEqual(page1.cves.map((cve) => cve.id), ["CVE-2026-1025", "CVE-2026-1045"]);

    const page2 = await getHomePageResults(normalizeSearchState({ minSeverity: "HIGH", page: 2 }));
    assert.deepEqual(page2.cves, []);
  });
});

test("getHomePageResults keeps upstream pagination for the default sort and severity", async () => {
  await withUpstream(rows, async (requestedUrls) => {
    const result = await getHomePageResults(normalizeSearchState({ page: 2 }));

    assert.equal(result.cves[0].id, "CVE-2026-1020");
    assert.equal(result.totalHint, "Page 2");
    assert.ok(requestedUrls.some((url) => url.includes("per_page=20&page=2")));
  });
});
