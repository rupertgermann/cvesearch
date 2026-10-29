import assert from "node:assert/strict";
import test from "node:test";
import { getLatestCVEsServer } from "../src/lib/server-api";
import { getRiskScore } from "../src/lib/search";

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
