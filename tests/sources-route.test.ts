import "./helpers/path-alias";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/sources/route";
import { GET as getScanHistory } from "../src/app/api/github/scan/route";
import { GET as listMonitored } from "../src/app/api/github/monitored/route";
import { resetAPIRateLimits } from "../src/lib/api-route-guard";
import { getDb } from "../src/lib/db";
import { listUndigestedRepoNotifications } from "../src/lib/repo-scans-store";
import { runSchedulerTick } from "../src/lib/scheduler";

// Unknown session ids get a fresh user, so reuse the cookie the first response issues.
const headers: Record<string, string> = { "content-type": "application/json" };
const osv = { lodashVulnerable: true };

async function withEnv(run: (osvBodies: unknown[]) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-sources-"));
  const previous = { DATABASE_FILE: process.env.DATABASE_FILE, GITHUB_TOKEN: process.env.GITHUB_TOKEN };
  const originalFetch = globalThis.fetch;
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");
  delete process.env.GITHUB_TOKEN;
  resetAPIRateLimits();
  delete headers.cookie;
  osv.lodashVulnerable = true;
  const osvBodies: unknown[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/querybatch")) {
      const body = JSON.parse(String(init?.body)) as { queries: { package: { name: string } }[] };
      osvBodies.push(body);
      return Response.json({
        results: body.queries.map((query) => query.package.name === "lodash" && osv.lodashVulnerable
          ? { vulns: [{ id: "GHSA-35jh-r3h4-6jhm", modified: "" }] }
          : {}),
      });
    }
    if (url.includes("/vulns/GHSA-35jh-r3h4-6jhm")) {
      return Response.json({
        id: "GHSA-35jh-r3h4-6jhm",
        summary: "Command injection in lodash",
        details: "",
        aliases: ["CVE-2021-23337"],
        severity: [],
        affected: [],
        references: [],
        published: "",
        modified: "",
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  try {
    await run(osvBodies);
  } finally {
    globalThis.fetch = originalFetch;
    resetAPIRateLimits();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const post = async (body: unknown) => {
  const response = await POST(new NextRequest("https://example.test/api/sources", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }));
  headers.cookie ??= (response.headers.get("set-cookie") ?? "").split(";")[0];
  return response;
};

test("uploading a CycloneDX SBOM without a GitHub token stores a source with the vulnerable component", async () => {
  await withEnv(async () => {
    const sbom = JSON.stringify({
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      components: [{ purl: "pkg:npm/lodash@4.17.20" }, { purl: "pkg:pypi/requests@2.31.0" }],
    });

    const response = await post({ name: "vendor appliance", filename: "bom.json", content: sbom });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.dependencyCount, 2);
    assert.equal(result.vulnerabilities.length, 1);
    assert.deepEqual(result.vulnerabilities[0].cveIds, ["CVE-2021-23337"]);

    const monitored = await (await listMonitored(new NextRequest("https://example.test/api/github/monitored", { headers }))).json();
    assert.equal(monitored.length, 1);
    assert.equal(monitored[0].fullName, "vendor appliance");
    assert.equal(monitored[0].sourceKind, "upload");
    assert.equal(monitored[0].lastScanVulnerabilityCount, 1);

    const history = await getScanHistory(new NextRequest(
      "https://example.test/api/github/scan?fullName=vendor%20appliance",
      { headers }
    ));
    assert.equal(history.status, 200);
    const scans = await history.json();
    assert.equal(scans.length, 1);
    assert.equal(scans[0].vulnerabilities[0].matchedDependency.name, "lodash");

    // Re-uploading under the same name adds a snapshot to the same source.
    assert.equal((await post({ name: "vendor appliance", filename: "bom.json", content: sbom })).status, 200);
    const again = await (await listMonitored(new NextRequest("https://example.test/api/github/monitored", { headers }))).json();
    assert.equal(again.length, 1);
  });
});

test("an uploaded lockfile is parsed by the dependency parser using its filename", async () => {
  await withEnv(async (osvBodies) => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "app" }, "node_modules/lodash": { version: "4.17.20" } },
    });
    const response = await post({ name: "legacy-app", filename: "package-lock.json", content: lock });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.dependencyCount, 1);
    assert.equal(result.vulnerabilities.length, 1);
    assert.equal(osvBodies.length, 1);
  });
});

test("the scheduler rescans a stale uploaded source from its stored dependencies without a GitHub token", async () => {
  await withEnv(async (osvBodies) => {
    osv.lodashVulnerable = false;
    const sbom = JSON.stringify({ bomFormat: "CycloneDX", specVersion: "1.5", components: [{ purl: "pkg:npm/lodash@4.17.20" }] });
    const response = await post({ name: "appliance", filename: "bom.json", content: sbom });
    assert.equal((await response.json()).vulnerabilities.length, 0);

    getDb().prepare("UPDATE monitored_repos SET last_scanned_at = ?").run(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString());
    osv.lodashVulnerable = true;
    osvBodies.length = 0;
    const tick = await runSchedulerTick();

    assert.equal(tick.rescannedRepos, 1);
    assert.equal(osvBodies.length, 1, "OSV is queried with the stored dependency list");
    const { userId } = getDb().prepare("SELECT user_id as userId FROM monitored_repos").get() as { userId: string };
    assert.deepEqual(
      listUndigestedRepoNotifications(userId).map((item) => [item.repoFullName, item.findings]),
      [["appliance", ["GHSA-35jh-r3h4-6jhm (lodash)"]]]
    );
  });
});

test("POST /api/sources rejects invalid input", async () => {
  await withEnv(async () => {
    for (const body of [
      {},
      { name: "", filename: "bom.json", content: "{}" },
      { name: "owner/repo", filename: "bom.json", content: "{}" },
      { name: "ok", filename: "../etc/passwd", content: "{}" },
      { name: "ok", filename: "bom.json", content: "" },
      { name: "ok", filename: "readme.txt", content: "hello" },
    ]) {
      const response = await post(body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
  });
});
