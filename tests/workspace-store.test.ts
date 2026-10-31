import "./helpers/path-alias";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import { getDb } from "../src/lib/db";
import {
  createInventoryAssetForUser,
  createAlertRuleForUser,
  importWorkspaceStateForUser,
  listInventoryAssetsForUser,
  listAlertRulesForUser,
  listWatchlist,
  readTriageRecordForUser,
  toggleWatchlistEntry,
  writeTriageRecordForUser,
} from "../src/lib/workspace-store";
import { createDefaultTriageRecord } from "../src/lib/triage-shared";

test("workspace stores are isolated per session user", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-workspace-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "workspace.db");

  try {
    const sessionA = getOrCreateWorkspaceSession(new Request("https://example.test/api/watchlist"));
    const sessionB = getOrCreateWorkspaceSession(new Request("https://example.test/api/watchlist"));

    await toggleWatchlistEntry(sessionA.userId, "CVE-2026-1111");
    await createAlertRuleForUser(sessionA.userId, "OpenSSL Alert", {
      query: "openssl",
      vendor: "",
      product: "openssl",
      cwe: "",
      since: "",
      minSeverity: "HIGH",
      sort: "risk_desc",
      page: 1,
      perPage: 20,
    });
    await writeTriageRecordForUser(sessionA.userId, {
      ...createDefaultTriageRecord("CVE-2026-1111"),
      status: "investigating",
      owner: "Rupert",
      notes: "Investigating impact",
      tags: ["internet-facing"],
      updatedAt: new Date().toISOString(),
    });
    await createInventoryAssetForUser(sessionA.userId, {
      name: "Public OpenSSL Gateway",
      vendor: "OpenSSL",
      product: "openssl",
      version: "3.0.x",
      environment: "production",
      criticality: "critical",
      notes: "Public traffic terminates here",
    });

    assert.deepEqual(await listWatchlist(sessionA.userId), ["CVE-2026-1111"]);
    assert.equal((await listAlertRulesForUser(sessionA.userId)).length, 1);
    assert.equal((await listInventoryAssetsForUser(sessionA.userId)).length, 1);
    assert.equal((await readTriageRecordForUser(sessionA.userId, "CVE-2026-1111")).status, "investigating");

    assert.deepEqual(await listWatchlist(sessionB.userId), []);
    assert.equal((await listAlertRulesForUser(sessionB.userId)).length, 0);
    assert.equal((await listInventoryAssetsForUser(sessionB.userId)).length, 0);
    assert.equal((await readTriageRecordForUser(sessionB.userId, "CVE-2026-1111")).status, "new");
  } finally {
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("workspace import supports replace mode for user data", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-workspace-import-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "workspace.db");

  try {
    const session = getOrCreateWorkspaceSession(new Request("https://example.test/api/workspace/import"));

    await toggleWatchlistEntry(session.userId, "CVE-2026-0001");

    await importWorkspaceStateForUser(session.userId, {
      watchlist: ["CVE-2026-1234"],
      alertRules: [{
        id: "alert-1",
        name: "Critical Alert",
        search: { query: "openssl", vendor: "", product: "", cwe: "", since: "", minSeverity: "HIGH", sort: "risk_desc", page: 1, perPage: 20 },
        createdAt: new Date().toISOString(),
        lastCheckedAt: null,
      }],
      inventoryAssets: [{
        id: "asset-1",
        name: "Gateway",
        vendor: "Acme",
        product: "gateway",
        version: "1.2.x",
        environment: "production",
        criticality: "high",
        notes: "Public edge",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      triageRecords: [{
        ...createDefaultTriageRecord("CVE-2026-1234"),
        status: "mitigated",
        updatedAt: new Date().toISOString(),
      }],
    }, "replace");

    assert.deepEqual(await listWatchlist(session.userId), ["CVE-2026-1234"]);
    assert.equal((await listAlertRulesForUser(session.userId))[0]?.name, "Critical Alert");
    assert.equal((await listInventoryAssetsForUser(session.userId))[0]?.name, "Gateway");
    assert.equal((await readTriageRecordForUser(session.userId, "CVE-2026-1234")).status, "mitigated");
  } finally {
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("saved views from older databases and exports become saved searches (alert rules)", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-saved-views-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  const dbFile = path.join(tempDir, "workspace.db");
  process.env.DATABASE_FILE = dbFile;
  const search = { query: "openssl", vendor: "", product: "", cwe: "", since: "", minSeverity: "CRITICAL", sort: "risk_desc", page: 1, perPage: 20 } as const;

  try {
    const session = getOrCreateWorkspaceSession(new Request("https://example.test/api/watchlist"));
    getDb().exec("CREATE TABLE user_saved_views (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, search_json TEXT NOT NULL, created_at TEXT NOT NULL)");
    getDb().prepare("INSERT INTO user_saved_views VALUES (?, ?, ?, ?, ?)").run("view-old", session.userId, "Old view", JSON.stringify(search), "2026-01-01T00:00:00.000Z");

    // Reopening the database runs the migration.
    process.env.DATABASE_FILE = path.join(tempDir, "other.db");
    getDb();
    process.env.DATABASE_FILE = dbFile;

    assert.deepEqual((await listAlertRulesForUser(session.userId)).map((rule) => rule.name), ["Old view"]);
    assert.equal(getDb().prepare("SELECT 1 FROM sqlite_master WHERE name = 'user_saved_views'").get(), undefined);

    const { POST } = await import("../src/app/api/workspace/import/route");
    const { NextRequest } = await import("next/server");
    const response = await POST(new NextRequest("https://example.test/api/workspace/import", {
      method: "POST",
      headers: { cookie: `cvesearch_session=${session.sessionId}`, "Content-Type": "application/json", origin: "https://example.test" },
      body: JSON.stringify({ snapshot: { savedViews: [{ id: "view-exported", name: "Exported view", search, createdAt: "2026-02-01T00:00:00.000Z" }] } }),
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).imported.alertRules, 1);
    assert.deepEqual((await listAlertRulesForUser(session.userId)).map((rule) => rule.name).sort(), ["Exported view", "Old view"]);
  } finally {
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
