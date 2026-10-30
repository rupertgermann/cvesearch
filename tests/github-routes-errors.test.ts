import "./helpers/path-alias";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/github/repos/route";
import { resetAPIRateLimits } from "../src/lib/api-route-guard";

async function getReposWithGitHubStatus(status: number, headers: Record<string, string> = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-gh-errors-"));
  const previousEnv = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, DATABASE_FILE: process.env.DATABASE_FILE };
  process.env.GITHUB_TOKEN = "test-token";
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ message: "raw upstream detail SECRET" }),
    { status, headers: { "Content-Type": "application/json", ...headers } },
  )) as typeof fetch;
  console.error = () => {};
  resetAPIRateLimits();
  try {
    const response = await GET(new NextRequest("https://example.test/api/github/repos"));
    return { status: response.status, body: await response.json() as { error: string } };
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    resetAPIRateLimits();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const cases: Array<[string, number, Record<string, string>, string]> = [
  ["401", 401, {}, "GitHub token is missing or lacks the required scope"],
  ["403", 403, {}, "GitHub token is missing or lacks the required scope"],
  ["404", 404, {}, "Repository not found or not accessible"],
  ["429", 429, {}, "GitHub rate limit reached, try again later"],
  ["403 rate limit", 403, { "x-ratelimit-remaining": "0" }, "GitHub rate limit reached, try again later"],
];

for (const [name, githubStatus, headers, expected] of cases) {
  test(`github repos route maps GitHub ${name} to a safe 502 message`, async () => {
    const { status, body } = await getReposWithGitHubStatus(githubStatus, headers);
    assert.equal(status, 502);
    assert.equal(body.error, expected);
  });
}
