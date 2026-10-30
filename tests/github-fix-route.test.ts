import "./helpers/path-alias";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/github/fix/route";
import { resetAPIRateLimits } from "../src/lib/api-route-guard";

const MANIFEST = JSON.stringify({ dependencies: { lodash: "4.17.0" } });

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

interface AICall {
  url: string;
  headers: Record<string, string>;
  body: { model?: string };
}

async function postFix(
  aiSettings: Record<string, unknown>,
  env: Record<string, string | undefined>,
): Promise<{ status: number; aiCalls: AICall[] }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-fix-route-"));
  const envOverrides: Record<string, string | undefined> = {
    GITHUB_TOKEN: "test-github-token",
    DATABASE_FILE: path.join(tempDir, "state.db"),
    API_REQUEST_LOG_FILE: path.join(tempDir, "api-requests.json"),
    AI_PROVIDER: undefined,
    OPENAI_API_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    ...env,
  };
  const previousEnv = Object.fromEntries(Object.keys(envOverrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const originalFetch = globalThis.fetch;
  const aiCalls: AICall[] = [];
  const fixJSON = JSON.stringify({
    analysis: "Upgrade lodash",
    fileChanges: [{ path: "package.json", content: JSON.stringify({ dependencies: { lodash: "4.17.21" } }), description: "bump" }],
    prTitle: "Fix",
    prBody: "Fix",
  });

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.openai.com") || url.startsWith("https://api.anthropic.com")) {
      aiCalls.push({
        url,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: JSON.parse(String(init?.body)),
      });
      return url.startsWith("https://api.openai.com")
        ? jsonResponse({ output_text: fixJSON })
        : jsonResponse({ content: [{ type: "text", text: fixJSON }] });
    }
    if (url.endsWith("/repos/acme/app")) return jsonResponse({ default_branch: "main" });
    if (url.includes("/branches/main")) return jsonResponse({ commit: { sha: "a".repeat(40) } });
    if (url.includes("/git/trees/")) return jsonResponse({ truncated: false, tree: [{ path: "package.json", type: "blob" }] });
    if (url.includes("/contents/package.json")) {
      return jsonResponse({ content: Buffer.from(MANIFEST).toString("base64"), encoding: "base64" });
    }
    if (url.includes("/search/code")) return jsonResponse({ items: [] });
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  resetAPIRateLimits();
  try {
    const response = await POST(new NextRequest("https://example.test/api/github/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoFullName: "acme/app",
        createBranch: false,
        vulnerability: {
          id: "GHSA-test",
          summary: "Prototype pollution",
          details: "",
          aliases: [],
          severity: [],
          references: [],
          published: "2026-01-01T00:00:00Z",
          modified: "2026-01-01T00:00:00Z",
          affected: [{
            package: { name: "lodash", ecosystem: "npm" },
            ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "0" }, { fixed: "4.17.21" }] }],
          }],
        },
        matchedDependency: { name: "lodash", version: "4.17.0", isDev: false, ecosystem: "npm", manifestPath: "package.json" },
        aiSettings,
      }),
    }));
    return { status: response.status, aiCalls };
  } finally {
    globalThis.fetch = originalFetch;
    resetAPIRateLimits();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("fix route never forwards a client-supplied API key; the server key is used", async () => {
  const { status, aiCalls } = await postFix(
    { provider: "openai", apiKey: "client-supplied-key" },
    { OPENAI_API_KEY: "server-openai-key" },
  );

  assert.equal(status, 200);
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].headers.authorization, "Bearer server-openai-key");
  assert.ok(!JSON.stringify(aiCalls).includes("client-supplied-key"));
});

test("fix route ignores a client provider that is not configured server-side", async () => {
  const { status, aiCalls } = await postFix(
    { provider: "anthropic", model: "claude-client-pick", apiKey: "client-supplied-key" },
    { OPENAI_API_KEY: "server-openai-key" },
  );

  assert.equal(status, 200);
  assert.equal(aiCalls.length, 1);
  assert.ok(aiCalls[0].url.startsWith("https://api.openai.com"));
  assert.equal(aiCalls[0].headers.authorization, "Bearer server-openai-key");
  assert.notEqual(aiCalls[0].body.model, "claude-client-pick");
});

test("fix route honors a client model override for a server-configured provider", async () => {
  const { status, aiCalls } = await postFix(
    { provider: "anthropic", model: "claude-client-pick" },
    { OPENAI_API_KEY: "server-openai-key", ANTHROPIC_API_KEY: "server-anthropic-key" },
  );

  assert.equal(status, 200);
  assert.equal(aiCalls.length, 1);
  assert.ok(aiCalls[0].url.startsWith("https://api.anthropic.com"));
  assert.equal(aiCalls[0].headers["x-api-key"], "server-anthropic-key");
  assert.equal(aiCalls[0].body.model, "claude-client-pick");
});
