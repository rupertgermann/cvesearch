import "./helpers/path-alias";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/github/scan/route";
import { API_RATE_LIMITS, resetAPIRateLimits } from "../src/lib/api-route-guard";

test("scan history GET uses a read bucket so it cannot exhaust the scan POST bucket", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-scan-limits-"));
  const previous = { DATABASE_FILE: process.env.DATABASE_FILE, GITHUB_TOKEN: process.env.GITHUB_TOKEN };
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");
  delete process.env.GITHUB_TOKEN;
  resetAPIRateLimits();
  const headers = { cookie: "cvesearch_session=limits-test" };
  try {
    for (let i = 0; i < API_RATE_LIMITS.githubScans.maxRequests + 3; i += 1) {
      const response = await GET(new NextRequest("https://example.test/api/github/scan?fullName=a/b", { headers }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-RateLimit-Limit"), String(API_RATE_LIMITS.githubReads.maxRequests));
    }

    // No token configured: 503, but it proves the POST bucket was not used up by the reads.
    const scan = await POST(new NextRequest("https://example.test/api/github/scan", {
      method: "POST",
      headers,
      body: JSON.stringify({ fullName: "a/b" }),
    }));
    assert.equal(scan.status, 503);
    assert.equal(scan.headers.get("X-RateLimit-Limit"), String(API_RATE_LIMITS.githubScans.maxRequests));
  } finally {
    resetAPIRateLimits();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
