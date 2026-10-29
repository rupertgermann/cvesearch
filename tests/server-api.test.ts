import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { upsertCVESummaries } from "../src/lib/cve-store";
import { getRiskScore, normalizeSearchState } from "../src/lib/search";
import { getHomePageResults, getLatestCVEsServer } from "../src/lib/server-api";

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

test("keyword fallback also searches locally cached CVEs older than the newest 200", async () => {
  const recent = Array.from({ length: 200 }, (_, index) => ({
    id: `CVE-2026-${String(3000 + index)}`,
    summary: index === 0 ? "Prototype pollution in widget" : `Issue ${index}`,
    published: new Date(Date.UTC(2026, 5, 1) - index * 3_600_000).toISOString(),
  }));
  await withUpstream(recent, async () => {
    upsertCVESummaries([
      { id: "CVE-2019-0001", summary: "Old prototype pollution bug", published: "2019-01-01T00:00:00Z" },
      { id: "CVE-2019-0002", summary: "Unrelated issue", published: "2019-01-02T00:00:00Z" },
    ]);
    const upstream = globalThis.fetch;
    globalThis.fetch = (async (input) =>
      String(input).includes("product=") ? new Response("[]") : upstream(input)) as typeof fetch;

    const result = await getHomePageResults(normalizeSearchState({ query: "prototype pollution" }));

    assert.deepEqual(result.cves.map((cve) => cve.id), ["CVE-2026-3000", "CVE-2019-0001"]);
    assert.match(result.totalHint, /recent and locally cached/i);
  });
});

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

test("list results are enriched with EPSS from FIRST and EPSS raises the risk score", async () => {
  const originalFetch = globalThis.fetch;
  const epssUrls: string[] = [];

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.startsWith("https://vulnerability.circl.lu/api/")) {
      return jsonResponse([{ id: "CVE-2026-0001" }, { id: "CVE-2026-0002" }]);
    }
    if (url.startsWith("https://api.first.org/data/v1/epss")) {
      epssUrls.push(url);
      return jsonResponse({
        status: "OK",
        data: [
          { cve: "CVE-2026-0001", epss: "0.940000000", percentile: "0.999000000" },
          { cve: "CVE-2026-0002", epss: "0.001000000", percentile: "0.100000000" },
        ],
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const [high, low] = await getLatestCVEsServer(1, 10);

    assert.equal(epssUrls.length, 1);
    assert.match(epssUrls[0], /cve=CVE-2026-0001%2CCVE-2026-0002|cve=CVE-2026-0001,CVE-2026-0002/);
    assert.equal(high.epss, 0.94);
    assert.equal(low.epss, 0.001);
    assert.ok(getRiskScore(high) > getRiskScore(low));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("list results still load when the EPSS API fails", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.startsWith("https://vulnerability.circl.lu/api/")) {
      return jsonResponse([{ id: "CVE-2026-0001" }]);
    }
    return new Response("unavailable", { status: 503 });
  }) as typeof fetch;

  try {
    const [cve] = await getLatestCVEsServer(1, 10);
    assert.equal(cve.id, "CVE-2026-0001");
    assert.equal(cve.epss, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 30 recent upstream rows that all match "widget"; product search returns nothing so the keyword fallback runs.
async function withKeywordFallback(run: () => Promise<void>) {
  const recent = Array.from({ length: 30 }, (_, index) => ({
    id: `CVE-2026-${String(4000 + index)}`,
    summary: `Widget issue ${index}`,
    published: new Date(Date.UTC(2026, 5, 1) - index * 3_600_000).toISOString(),
    cvss3: index === 29 ? 9.9 : 5,
  }));
  await withUpstream(recent, async () => {
    const upstream = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("product=")) return new Response("[]");
      if (url.startsWith("https://api.first.org/data/v1/epss")) {
        const ids = new URL(url).searchParams.get("cve")!.split(",");
        return jsonResponse({ data: ids.map((cve) => ({ cve, epss: "0.5" })) });
      }
      return upstream(input);
    }) as typeof fetch;
    await run();
  });
}

test("keyword fallback paginates by the requested page", async () => {
  await withKeywordFallback(async () => {
    const page2 = await getHomePageResults(normalizeSearchState({ query: "widget", page: 2 }));
    assert.deepEqual(page2.cves.map((cve) => cve.id), Array.from({ length: 10 }, (_, i) => `CVE-2026-${4020 + i}`));
  });
});

test("keyword fallback with a non-default sort mentions both the fallback scope and the sort window", async () => {
  await withKeywordFallback(async () => {
    const result = await getHomePageResults(normalizeSearchState({ query: "widget", sort: "cvss_desc" }));
    assert.equal(result.cves[0].id, "CVE-2026-4029");
    assert.match(result.totalHint, /recent and locally cached/i);
    assert.match(result.totalHint, /sorted\/filtered within/i);
  });
});

test("keyword fallback enriches locally cached CVEs with EPSS", async () => {
  await withKeywordFallback(async () => {
    upsertCVESummaries([{ id: "CVE-2019-0042", summary: "Old widget bug", published: "2019-01-01T00:00:00Z" }]);
    const result = await getHomePageResults(normalizeSearchState({ query: "widget", page: 2 }));
    const cached = result.cves.find((cve) => cve.id === "CVE-2019-0042");
    assert.equal(cached?.epss, 0.5);
  });
});
