import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import { getDb } from "../src/lib/db";
import { VulnerabilityMatch } from "../src/lib/github-types";
import { addMonitoredRepo } from "../src/lib/monitored-repos-store";
import { scanRepoForUser } from "../src/lib/repo-scan";
import { diffScanFindings } from "../src/lib/repo-scan-diff";
import { listUndigestedRepoNotifications } from "../src/lib/repo-scans-store";
import { readSchedulerConfig, runSchedulerTick } from "../src/lib/scheduler";
import { buildDigestInputFromWorkspaceSnapshot, loadWorkspaceContextSnapshot } from "../src/lib/workspace-context";

function match(vulnId: string, pkg: string): VulnerabilityMatch {
  return {
    vulnerability: { id: vulnId, summary: "", details: "", aliases: [], severity: [], affected: [], references: [], published: "", modified: "" },
    matchedDependency: { name: pkg, version: "1.0.0", ecosystem: "npm", isDev: false },
    cveIds: [],
  };
}

test("diffScanFindings splits two scans into new, fixed and still open", () => {
  const previous = [match("GHSA-a", "lodash"), match("GHSA-b", "lodash"), match("GHSA-b", "lodash")];
  const current = [match("GHSA-b", "lodash"), match("GHSA-c", "axios")];

  assert.deepEqual(diffScanFindings(previous, current), {
    newFindings: ["GHSA-c (axios)"],
    fixedFindings: ["GHSA-a (lodash)"],
    openFindings: ["GHSA-b (lodash)"],
  });
});

// Fake GitHub (one package.json) and OSV (vulns from `osvVulns`) so the real scan path runs.
async function withScanEnv(run: (osvVulns: string[], calls: string[]) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-rescan-"));
  const previous = { DATABASE_FILE: process.env.DATABASE_FILE, GITHUB_TOKEN: process.env.GITHUB_TOKEN };
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");
  process.env.GITHUB_TOKEN = "test-token";
  const originalFetch = globalThis.fetch;
  const osvVulns: string[] = [];
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(`${url.hostname}${url.pathname}`);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.hostname === "api.github.com") {
      if (url.pathname.includes("/branches/")) return json({ commit: { sha: "abc" } });
      if (url.pathname.includes("/git/trees/")) return json({ sha: "abc", truncated: false, tree: [{ path: "package.json", mode: "100644", type: "blob", sha: "f" }] });
      if (url.pathname.endsWith("/contents/package.json")) {
        return json({ encoding: "base64", content: Buffer.from(JSON.stringify({ dependencies: { lodash: "4.17.0" } })).toString("base64") });
      }
      return json({ default_branch: "main" });
    }
    if (url.pathname === "/v1/querybatch") {
      return json({ results: [{ vulns: osvVulns.map((id) => ({ id, summary: "", details: "", aliases: [], severity: [], affected: [], references: [], published: "", modified: "" })) }] });
    }
    return json({}, 404);
  }) as typeof fetch;
  try {
    await run(osvVulns, calls);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function newUser(): string {
  return getOrCreateWorkspaceSession(new Request("https://example.test/")).userId;
}

async function monitor(userId: string, fullName: string) {
  await addMonitoredRepo(userId, { githubId: 1, fullName, htmlUrl: `https://github.com/${fullName}`, isPrivate: false, defaultBranch: "main" });
}

test("a rescan with a new finding creates a notification that feeds the next digest", async () => {
  await withScanEnv(async (osvVulns) => {
    const userId = newUser();
    await monitor(userId, "acme/api");

    osvVulns.push("GHSA-a", "GHSA-b");
    const first = await scanRepoForUser(userId, "acme/api");
    assert.equal(first.diff, null, "the first scan is only a baseline");
    assert.equal(listUndigestedRepoNotifications(userId).length, 0);

    osvVulns.splice(0, osvVulns.length, "GHSA-b", "GHSA-c");
    const second = await scanRepoForUser(userId, "acme/api");
    assert.deepEqual(second.diff, { newFindings: ["GHSA-c (lodash)"], fixedFindings: ["GHSA-a (lodash)"], openFindings: ["GHSA-b (lodash)"] });

    const notifications = listUndigestedRepoNotifications(userId);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.repoFullName, "acme/api");
    assert.deepEqual(notifications[0]?.findings, ["GHSA-c (lodash)"]);

    const digestInput = buildDigestInputFromWorkspaceSnapshot(await loadWorkspaceContextSnapshot(userId));
    assert.deepEqual(digestInput.repoFindings, [{ repo: "acme/api", findings: ["GHSA-c (lodash)"] }]);

    await scanRepoForUser(userId, "acme/api");
    assert.equal(listUndigestedRepoNotifications(userId).length, 1, "an unchanged rescan adds no notification");
  });
});

test("a rescan diffs against the previous scan of the same branch", async () => {
  await withScanEnv(async (osvVulns) => {
    const userId = newUser();
    await monitor(userId, "acme/api");

    osvVulns.push("GHSA-a");
    await scanRepoForUser(userId, "acme/api", "main");
    osvVulns.splice(0, osvVulns.length, "GHSA-b");
    assert.equal((await scanRepoForUser(userId, "acme/api", "dev")).diff, null, "a first scan of another branch is a baseline");

    osvVulns.splice(0, osvVulns.length, "GHSA-a");
    const main = await scanRepoForUser(userId, "acme/api", "main");
    assert.deepEqual(main.diff, { newFindings: [], fixedFindings: [], openFindings: ["GHSA-a (lodash)"] });
    assert.equal(listUndigestedRepoNotifications(userId).length, 0);
  });
});

test("a scheduler tick rescans only repos whose last scan is older than the rescan interval", async () => {
  await withScanEnv(async (_osvVulns, calls) => {
    const userId = newUser();
    await monitor(userId, "acme/stale");
    await monitor(userId, "acme/fresh");
    await scanRepoForUser(userId, "acme/stale");
    await scanRepoForUser(userId, "acme/fresh");
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    getDb().prepare("UPDATE monitored_repos SET last_scanned_at = ? WHERE full_name = ?").run(twoDaysAgo, "acme/stale");
    calls.length = 0;

    const result = await runSchedulerTick();

    assert.equal(result.rescannedRepos, 1);
    assert.ok(calls.some((call) => call.includes("/repos/acme/stale")));
    assert.ok(!calls.some((call) => call.includes("/repos/acme/fresh")));
  });
});

test("a scheduler tick skips rescans when GITHUB_TOKEN is not configured", async () => {
  await withScanEnv(async (_osvVulns, calls) => {
    const userId = newUser();
    await monitor(userId, "acme/api");
    delete process.env.GITHUB_TOKEN;

    const result = await runSchedulerTick();

    assert.equal(result.rescannedRepos, 0);
    assert.ok(!calls.some((call) => call.startsWith("api.github.com")));
  });
});

test("readSchedulerConfig reads the repo rescan interval with a daily default", () => {
  assert.equal(readSchedulerConfig({}).rescanIntervalMs, 24 * 60 * 60 * 1000);
  assert.equal(readSchedulerConfig({ REPO_RESCAN_INTERVAL_MS: "3600000" }).rescanIntervalMs, 3_600_000);
});

test("scheduler rescans skip uploaded sources without a stored dependency list and back off after a failed rescan", async () => {
  await withScanEnv(async (_osvVulns, calls) => {
    const userId = newUser();
    await monitor(userId, "acme/broken");
    await monitor(userId, "uploaded-sbom");
    getDb().prepare("UPDATE monitored_repos SET source_kind = 'upload' WHERE full_name = ?").run("uploaded-sbom");
    const stubbed = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/repos/acme/broken")) {
        calls.push("broken");
        return new Response("{}", { status: 500 });
      }
      return stubbed(input, init);
    }) as typeof fetch;
    const originalError = console.error;
    console.error = () => {};
    try {
      const first = await runSchedulerTick();
      assert.equal(first.rescannedRepos, 1, "only the GitHub repo is rescanned");
      assert.ok(calls.includes("broken"));
      assert.ok(!calls.some((call) => call.includes("uploaded-sbom")));

      calls.length = 0;
      const second = await runSchedulerTick();
      assert.equal(second.rescannedRepos, 0, "a failed rescan waits before retrying");
      assert.equal(calls.length, 0);
    } finally {
      console.error = originalError;
      globalThis.fetch = stubbed;
    }
  });
});
