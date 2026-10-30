import assert from "node:assert/strict";
import test from "node:test";
import { parseDependencyFiles } from "../src/lib/dependency-parser";
import { fetchRepoDependencyFiles } from "../src/lib/github";
import { queryOSVBatch } from "../src/lib/osv";

const COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

// Runs discovery -> parse -> OSV against a fake GitHub repo and a fake OSV that flags one package.
const scanFakeRepo = async (
  files: Record<string, string>,
  vulnerable: { ecosystem: string; name: string; version: string }
) => {
  const previousToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  const vuln = { id: "GHSA-test-0001", aliases: ["CVE-2024-0001"], summary: "test", affected: [] };

  process.env.GITHUB_TOKEN = "test-token";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === "https://api.github.com/repos/acme/repo") return jsonResponse({ default_branch: "main" });
    if (url === "https://api.github.com/repos/acme/repo/branches/main") return jsonResponse({ commit: { sha: COMMIT_SHA } });
    if (url === `https://api.github.com/repos/acme/repo/git/trees/${COMMIT_SHA}?recursive=1`) {
      return jsonResponse({
        sha: COMMIT_SHA,
        truncated: false,
        tree: Object.keys(files).map((path) => ({ path, mode: "100644", type: "blob", sha: "blob" })),
      });
    }
    for (const [path, content] of Object.entries(files)) {
      if (url === `https://api.github.com/repos/acme/repo/contents/${path}?ref=${COMMIT_SHA}`) {
        return jsonResponse({ content: Buffer.from(content).toString("base64"), encoding: "base64" });
      }
    }
    if (url === "https://api.osv.dev/v1/querybatch") {
      const { queries } = JSON.parse(String(init?.body)) as {
        queries: { package: { name: string; ecosystem: string }; version: string }[];
      };
      return jsonResponse({
        results: queries.map((q) =>
          q.package.ecosystem === vulnerable.ecosystem && q.package.name === vulnerable.name && q.version === vulnerable.version
            ? { vulns: [vuln] }
            : {}
        ),
      });
    }
    if (url === `https://api.osv.dev/v1/vulns/${vuln.id}`) return jsonResponse(vuln);
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const { dependencies } = parseDependencyFiles(await fetchRepoDependencyFiles("acme/repo"));
    return await queryOSVBatch(dependencies);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  }
};

test("scan surfaces OSV findings for a vulnerable yarn.lock dependency in a subdirectory", async () => {
  const matches = await scanFakeRepo(
    {
      "packages/web/package.json": JSON.stringify({ dependencies: { lodash: "^4.17.0" } }),
      "packages/web/yarn.lock": 'lodash@^4.17.0:\n  version "4.17.20"\n',
    },
    { ecosystem: "npm", name: "lodash", version: "4.17.20" }
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchedDependency.lockfilePath, "packages/web/yarn.lock");
  assert.deepEqual(matches[0].cveIds, ["CVE-2024-0001"]);
});

test("scan surfaces OSV findings for a vulnerable pinned Python dependency in a subdirectory", async () => {
  const matches = await scanFakeRepo(
    { "services/api/requirements.txt": "Django==4.2.1\n" },
    { ecosystem: "PyPI", name: "Django", version: "4.2.1" }
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchedDependency.manifestPath, "services/api/requirements.txt");
});

test("scan surfaces OSV findings for a vulnerable Go module in a subdirectory", async () => {
  const matches = await scanFakeRepo(
    { "tools/cli/go.mod": "module example.com/cli\n\nrequire golang.org/x/net v0.17.0 // indirect\n" },
    { ecosystem: "Go", name: "golang.org/x/net", version: "0.17.0" }
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchedDependency.manifestPath, "tools/cli/go.mod");
});
