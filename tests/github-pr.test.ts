import assert from "node:assert/strict";
import test from "node:test";
import { findExistingFixPR } from "../src/lib/github-pr";

const jsonResponse = (body: unknown): Response => {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

test("findExistingFixPR scans multiple pull request pages", async () => {
  const previousToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];

  process.env.GITHUB_TOKEN = "test-token";
  globalThis.fetch = (async (input) => {
    const url = String(input);
    requests.push(url);

    if (url.includes("&page=1")) {
      return jsonResponse(Array.from({ length: 100 }, (_, index) => ({
        html_url: `https://example.test/pr/${index + 1}`,
        number: index + 1,
        title: `PR ${index + 1}`,
        state: "closed",
        head: { ref: `misc/branch-${index + 1}` },
      })));
    }

    if (url.includes("&page=2")) {
      return jsonResponse([
        {
          html_url: "https://example.test/pr/101",
          number: 101,
          title: "Fix CVE-2026-9999",
          state: "open",
          head: { ref: "fix/cve-2026-9999" },
        },
      ]);
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const result = await findExistingFixPR("acme/repo", "CVE-2026-9999");

    assert.ok(result);
    assert.equal(result?.number, 101);
    assert.equal(result?.branchName, "fix/cve-2026-9999");
    assert.equal(requests.some((url) => url.includes("page=2")), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousToken;
    }
  }
});
