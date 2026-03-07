import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getOrCreateWorkspaceSession } from "../src/lib/auth-session";
import {
  createInventoryAssetForUser,
  createAlertRuleForUser,
  createSavedViewForUser,
  importWorkspaceStateForUser,
  listInventoryAssetsForUser,
  listAlertRulesForUser,
  listSavedViewsForUser,
  listWatchlist,
  readTriageRecordForUser,
  toggleWatchlistEntry,
  writeTriageRecordForUser,
} from "../src/lib/workspace-store";
import { createDefaultTriageRecord } from "../src/lib/triage-shared";
import { importProjects, listProjects } from "../src/lib/projects-store";

test("workspace stores are isolated per session user", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-workspace-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "workspace.db");

  try {
    const sessionA = getOrCreateWorkspaceSession(new Request("https://example.test/api/watchlist"));
    const sessionB = getOrCreateWorkspaceSession(new Request("https://example.test/api/watchlist"));

    await toggleWatchlistEntry(sessionA.userId, "CVE-2026-1111");
    await createSavedViewForUser(sessionA.userId, "Critical OpenSSL", {
      query: "openssl",
      vendor: "",
      product: "openssl",
      cwe: "",
      since: "",
      minSeverity: "CRITICAL",
      sort: "risk_desc",
      page: 1,
      perPage: 20,
    });
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
    assert.equal((await listSavedViewsForUser(sessionA.userId)).length, 1);
    assert.equal((await listAlertRulesForUser(sessionA.userId)).length, 1);
    assert.equal((await listInventoryAssetsForUser(sessionA.userId)).length, 1);
    assert.equal((await readTriageRecordForUser(sessionA.userId, "CVE-2026-1111")).status, "investigating");

    assert.deepEqual(await listWatchlist(sessionB.userId), []);
    assert.equal((await listSavedViewsForUser(sessionB.userId)).length, 0);
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

test("workspace import supports replace mode for user data and projects", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-workspace-import-"));
  const previousDatabaseFile = process.env.DATABASE_FILE;
  process.env.DATABASE_FILE = path.join(tempDir, "workspace.db");

  try {
    const session = getOrCreateWorkspaceSession(new Request("https://example.test/api/workspace/import"));

    await toggleWatchlistEntry(session.userId, "CVE-2026-0001");

    await importWorkspaceStateForUser(session.userId, {
      watchlist: ["CVE-2026-1234"],
      savedViews: [{
        id: "view-1",
        name: "Critical",
        search: { query: "openssl", vendor: "", product: "", cwe: "", since: "", minSeverity: "CRITICAL", sort: "risk_desc", page: 1, perPage: 20 },
        createdAt: new Date().toISOString(),
      }],
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

    await importProjects([{
      id: "project-1",
      name: "Imported Project",
      description: "Imported",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [{ cveId: "CVE-2026-1234", note: "Track fix", addedAt: new Date().toISOString() }],
      activity: [],
    }], "replace");

    assert.deepEqual(await listWatchlist(session.userId), ["CVE-2026-1234"]);
    assert.equal((await listSavedViewsForUser(session.userId))[0]?.name, "Critical");
    assert.equal((await listAlertRulesForUser(session.userId))[0]?.name, "Critical Alert");
    assert.equal((await listInventoryAssetsForUser(session.userId))[0]?.name, "Gateway");
    assert.equal((await readTriageRecordForUser(session.userId, "CVE-2026-1234")).status, "mitigated");
    assert.equal((await listProjects())[0]?.name, "Imported Project");
  } finally {
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
