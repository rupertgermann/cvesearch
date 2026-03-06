import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextResponse } from "next/server";
import {
  listRecentAPIRequestLogs,
  resetAPIRateLimits,
  withRouteProtection,
} from "../src/lib/api-route-guard";

test("withRouteProtection enforces rate limits and records request logs", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-api-logs-"));
  const previous = process.env.API_REQUEST_LOG_FILE;
  process.env.API_REQUEST_LOG_FILE = path.join(tempDir, "api-requests.json");
  resetAPIRateLimits();

  const handler = withRouteProtection(
    async function GET(request: Request) {
      const url = new URL(request.url);
      return NextResponse.json({ ok: url.searchParams.get("value") ?? "missing" });
    },
    {
      route: "/api/test",
      errorMessage: "Failed",
      rateLimit: {
        bucket: "test",
        maxRequests: 1,
        windowMs: 60_000,
      },
    }
  );

  try {
    const first = await handler(new Request("https://example.test/api/test?value=one", {
      method: "GET",
      headers: { "user-agent": "test-agent" },
    }));
    const second = await handler(new Request("https://example.test/api/test?value=two", {
      method: "GET",
      headers: { "user-agent": "test-agent" },
    }));

    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(first.headers.get("X-RateLimit-Limit"), "1");
    assert.equal(second.headers.get("X-RateLimit-Remaining"), "0");

    const logs = await listRecentAPIRequestLogs(10);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].status, 429);
    assert.equal(logs[0].limited, true);
    assert.equal(logs[1].status, 200);
    assert.equal(logs[1].route, "/api/test");
  } finally {
    resetAPIRateLimits();
    if (previous === undefined) {
      delete process.env.API_REQUEST_LOG_FILE;
    } else {
      process.env.API_REQUEST_LOG_FILE = previous;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
