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
  const previousLogFile = process.env.API_REQUEST_LOG_FILE;
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.API_REQUEST_LOG_FILE = path.join(tempDir, "api-requests.json");
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");
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
        // Fixed windows start on multiples of windowMs; a long window keeps both requests in one window.
        windowMs: 365 * 24 * 60 * 60 * 1000,
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
    if (previousLogFile === undefined) {
      delete process.env.API_REQUEST_LOG_FILE;
    } else {
      process.env.API_REQUEST_LOG_FILE = previousLogFile;
    }
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

async function withTempDatabase(run: () => Promise<void>): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-api-errors-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "state.db");
  resetAPIRateLimits();
  try {
    await run();
  } finally {
    resetAPIRateLimits();
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const errorTestConfig = {
  route: "/api/error-test",
  errorMessage: "Failed to load things",
  rateLimit: { bucket: "error-test", maxRequests: 10, windowMs: 60_000 },
};

test("withRouteProtection returns only the configured message when a handler throws, and logs the full error server-side", async (t) => {
  await withTempDatabase(async () => {
    const consoleError = t.mock.method(console, "error", () => {});
    const thrown = new Error("connect ECONNREFUSED /var/lib/secret/state.db");
    const handler = withRouteProtection(async function GET(request: Request) {
      void request;
      throw thrown;
    }, errorTestConfig);

    const response = await handler(new Request("https://example.test/api/error-test"));
    const text = await response.text();

    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(text), { error: "Failed to load things" });
    assert.ok(!text.includes("ECONNREFUSED"));
    assert.ok(!text.includes("/var/lib/secret"));
    assert.ok(!text.includes(thrown.stack!.split("\n")[1].trim()));

    assert.ok(consoleError.mock.calls.some((call) => (call.arguments as unknown[]).includes(thrown)), "full error object (with stack) is logged");
    const [log] = await listRecentAPIRequestLogs(1);
    assert.equal(log.status, 500);
    assert.match(log.error, /ECONNREFUSED \/var\/lib\/secret\/state\.db/);
  });
});

test("withRouteProtection passes intentional 4xx client errors through unchanged", async () => {
  await withTempDatabase(async () => {
    const handler = withRouteProtection(async function POST(request: Request) {
      void request;
      return NextResponse.json({ error: "fullName is required" }, { status: 400 });
    }, errorTestConfig);

    const response = await handler(new Request("https://example.test/api/error-test", { method: "POST" }));

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "fullName is required" });
  });
});
