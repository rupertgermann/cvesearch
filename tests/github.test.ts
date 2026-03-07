import assert from "node:assert/strict";
import test from "node:test";
import { fetchRepoDependencyFiles } from "../src/lib/github";

const jsonResponse = (body: unknown): Response => {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

test("fetchRepoDependencyFiles fetches dependency file content from the resolved commit sha", async () => {
  const previousToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  const commitSha = "0123456789abcdef0123456789abcdef01234567";
  const requestedUrls: string[] = [];

  process.env.GITHUB_TOKEN = "test-token";
  globalThis.fetch = (async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url === "https://api.github.com/repos/acme/repo") {
      return jsonResponse({ default_branch: "main" });
    }

    if (url === "https://api.github.com/repos/acme/repo/branches/main") {
      return jsonResponse({ commit: { sha: commitSha } });
    }

    if (url === `https://api.github.com/repos/acme/repo/git/trees/${commitSha}?recursive=1`) {
      return jsonResponse({
        sha: commitSha,
        truncated: false,
        tree: [
          { path: "packages/web/package.json", mode: "100644", type: "blob", sha: "blob-sha" },
        ],
      });
    }

    if (url === `https://api.github.com/repos/acme/repo/contents/packages/web/package.json?ref=${commitSha}`) {
      return jsonResponse({
        content: Buffer.from('{"dependencies":{"react":"19.2.3"}}').toString("base64"),
        encoding: "base64",
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const files = await fetchRepoDependencyFiles("acme/repo");
    assert.equal(files.length, 1);
    assert.equal(files[0].path, "packages/web/package.json");
    assert.equal(
      requestedUrls.includes(`https://api.github.com/repos/acme/repo/contents/packages/web/package.json?ref=${commitSha}`),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousToken;
    }
  }
});

test("fetchRepoDependencyFiles fails when the recursive tree is truncated", async () => {
  const previousToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  const commitSha = "fedcba9876543210fedcba9876543210fedcba98";

  process.env.GITHUB_TOKEN = "test-token";
  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url === "https://api.github.com/repos/acme/repo") {
      return jsonResponse({ default_branch: "main" });
    }

    if (url === "https://api.github.com/repos/acme/repo/branches/main") {
      return jsonResponse({ commit: { sha: commitSha } });
    }

    if (url === `https://api.github.com/repos/acme/repo/git/trees/${commitSha}?recursive=1`) {
      return jsonResponse({
        sha: commitSha,
        truncated: true,
        tree: [],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    await assert.rejects(
      fetchRepoDependencyFiles("acme/repo"),
      /truncated/
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousToken;
    }
  }
});
