import { getDb, withTransaction } from "./db";
import { normalizeSearchState, SearchState } from "./search";
import {
  buildTriageActivity,
  createDefaultTriageRecord,
  normalizeTriageRecord,
  TriageRecord,
} from "./triage-shared";
import { AlertRule, InventoryAssetRecord, SavedView, WorkspaceImportMode } from "./workspace-types";

export async function listWatchlist(userId: string): Promise<string[]> {
  const rows = getDb().prepare(`
    SELECT cve_id as cveId
    FROM user_watchlist
    WHERE user_id = ?
    ORDER BY added_at DESC
  `).all(userId) as Array<{ cveId: string }>;

  return rows.map((row) => row.cveId);
}

export async function listWatchlistEntriesForUser(userId: string): Promise<Array<{ cveId: string; addedAt: string }>> {
  return getDb().prepare(`
    SELECT cve_id as cveId, added_at as addedAt
    FROM user_watchlist
    WHERE user_id = ?
    ORDER BY added_at DESC
  `).all(userId) as Array<{ cveId: string; addedAt: string }>;
}

export async function toggleWatchlistEntry(userId: string, cveId: string): Promise<string[]> {
  withTransaction((db) => {
    const existing = db.prepare(`
      SELECT cve_id as cveId
      FROM user_watchlist
      WHERE user_id = ? AND cve_id = ?
    `).get(userId, cveId) as { cveId: string } | undefined;

    if (existing) {
      db.prepare("DELETE FROM user_watchlist WHERE user_id = ? AND cve_id = ?").run(userId, cveId);
      return;
    }

    db.prepare(`
      INSERT INTO user_watchlist (user_id, cve_id, added_at)
      VALUES (?, ?, ?)
    `).run(userId, cveId, new Date().toISOString());
  });

  return listWatchlist(userId);
}

export async function removeWatchlistEntries(userId: string, cveIds: string[]): Promise<string[]> {
  if (cveIds.length === 0) {
    return listWatchlist(userId);
  }

  const uniqueIds = Array.from(new Set(cveIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return listWatchlist(userId);
  }

  withTransaction((db) => {
    const deleteStatement = db.prepare("DELETE FROM user_watchlist WHERE user_id = ? AND cve_id = ?");
    for (const cveId of uniqueIds) {
      deleteStatement.run(userId, cveId);
    }
  });

  return listWatchlist(userId);
}

export async function listSavedViewsForUser(userId: string): Promise<SavedView[]> {
  const rows = getDb().prepare(`
    SELECT id, name, search_json as searchJson, created_at as createdAt
    FROM user_saved_views
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as Array<{ id: string; name: string; searchJson: string; createdAt: string }>;

  return rows.flatMap((row) => {
    const search = parseSearchState(row.searchJson);
    return search ? [{ id: row.id, name: row.name, search, createdAt: row.createdAt }] : [];
  });
}

export async function createSavedViewForUser(userId: string, name: string, search: SearchState): Promise<SavedView> {
  const record: SavedView = {
    id: crypto.randomUUID(),
    name: name.trim(),
    search: normalizeSearchState(search),
    createdAt: new Date().toISOString(),
  };

  getDb().prepare(`
    INSERT INTO user_saved_views (id, user_id, name, search_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(record.id, userId, record.name, JSON.stringify(record.search), record.createdAt);

  return record;
}

export async function deleteSavedViewForUser(userId: string, id: string): Promise<boolean> {
  const result = getDb().prepare("DELETE FROM user_saved_views WHERE user_id = ? AND id = ?").run(userId, id);
  return result.changes > 0;
}

export async function listAlertRulesForUser(userId: string): Promise<AlertRule[]> {
  const rows = getDb().prepare(`
    SELECT id, name, search_json as searchJson, created_at as createdAt, last_checked_at as lastCheckedAt
    FROM user_alert_rules
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as Array<{ id: string; name: string; searchJson: string; createdAt: string; lastCheckedAt: string | null }>;

  return rows.flatMap((row) => {
    const search = parseSearchState(row.searchJson);
    return search
      ? [{ id: row.id, name: row.name, search, createdAt: row.createdAt, lastCheckedAt: row.lastCheckedAt }]
      : [];
  });
}

export async function getAlertRuleForUser(userId: string, id: string): Promise<AlertRule | null> {
  const rules = await listAlertRulesForUser(userId);
  return rules.find((rule) => rule.id === id) ?? null;
}

export async function createAlertRuleForUser(userId: string, name: string, search: SearchState): Promise<AlertRule> {
  const record: AlertRule = {
    id: crypto.randomUUID(),
    name: name.trim(),
    search: normalizeSearchState(search),
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
  };

  getDb().prepare(`
    INSERT INTO user_alert_rules (id, user_id, name, search_json, created_at, last_checked_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(record.id, userId, record.name, JSON.stringify(record.search), record.createdAt, null);

  return record;
}

export async function deleteAlertRuleForUser(userId: string, id: string): Promise<boolean> {
  const result = getDb().prepare("DELETE FROM user_alert_rules WHERE user_id = ? AND id = ?").run(userId, id);
  return result.changes > 0;
}

export async function markAlertRuleCheckedForUser(userId: string, id: string): Promise<AlertRule[]> {
  getDb().prepare(`
    UPDATE user_alert_rules
    SET last_checked_at = ?
    WHERE user_id = ? AND id = ?
  `).run(new Date().toISOString(), userId, id);

  return listAlertRulesForUser(userId);
}

export async function markAllAlertRulesCheckedForUser(userId: string): Promise<AlertRule[]> {
  getDb().prepare(`
    UPDATE user_alert_rules
    SET last_checked_at = ?
    WHERE user_id = ?
  `).run(new Date().toISOString(), userId);

  return listAlertRulesForUser(userId);
}

export async function listInventoryAssetsForUser(userId: string): Promise<InventoryAssetRecord[]> {
  const rows = getDb().prepare(`
    SELECT
      id,
      name,
      vendor,
      product,
      version,
      environment,
      criticality,
      notes,
      created_at as createdAt,
      updated_at as updatedAt
    FROM user_inventory_assets
    WHERE user_id = ?
    ORDER BY updated_at DESC, created_at DESC
  `).all(userId) as Array<Record<string, string>>;

  return rows.map(normalizeInventoryAssetRow);
}

export async function createInventoryAssetForUser(
  userId: string,
  input: Omit<InventoryAssetRecord, "id" | "createdAt" | "updatedAt">
): Promise<InventoryAssetRecord> {
  const now = new Date().toISOString();
  const record = normalizeInventoryAsset({
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...input,
  });

  getDb().prepare(`
    INSERT INTO user_inventory_assets (
      id, user_id, name, vendor, product, version, environment, criticality, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    userId,
    record.name,
    record.vendor,
    record.product,
    record.version,
    record.environment,
    record.criticality,
    record.notes,
    record.createdAt,
    record.updatedAt
  );

  return record;
}

export async function updateInventoryAssetForUser(
  userId: string,
  id: string,
  input: Partial<Omit<InventoryAssetRecord, "id" | "createdAt" | "updatedAt">>
): Promise<InventoryAssetRecord | null> {
  const existing = await getInventoryAssetForUser(userId, id);
  if (!existing) {
    return null;
  }

  const next = normalizeInventoryAsset({
    ...existing,
    ...input,
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });

  getDb().prepare(`
    UPDATE user_inventory_assets
    SET name = ?, vendor = ?, product = ?, version = ?, environment = ?, criticality = ?, notes = ?, updated_at = ?
    WHERE user_id = ? AND id = ?
  `).run(
    next.name,
    next.vendor,
    next.product,
    next.version,
    next.environment,
    next.criticality,
    next.notes,
    next.updatedAt,
    userId,
    id
  );

  return next;
}

export async function deleteInventoryAssetForUser(userId: string, id: string): Promise<boolean> {
  const result = getDb().prepare("DELETE FROM user_inventory_assets WHERE user_id = ? AND id = ?").run(userId, id);
  return result.changes > 0;
}

export async function readTriageMapForUser(userId: string): Promise<Record<string, TriageRecord>> {
  const rows = getDb().prepare(`
    SELECT cve_id as cveId, status, owner, notes, tags_json as tagsJson, updated_at as updatedAt, activity_json as activityJson
    FROM user_triage_records
    WHERE user_id = ?
  `).all(userId) as Array<{
    cveId: string;
    status: string;
    owner: string;
    notes: string;
    tagsJson: string;
    updatedAt: string;
    activityJson: string;
  }>;

  return Object.fromEntries(
    rows.map((row) => {
      const record = normalizeTriageRecord({
        cveId: row.cveId,
        status: row.status as TriageRecord["status"],
        owner: row.owner,
        notes: row.notes,
        tags: parseStringArray(row.tagsJson),
        updatedAt: row.updatedAt,
        activity: parseAuditTrail(row.activityJson),
      });

      return [record.cveId, record];
    })
  );
}

export async function readTriageRecordForUser(userId: string, cveId: string): Promise<TriageRecord> {
  const record = (await readTriageMapForUser(userId))[cveId];
  return record ?? createDefaultTriageRecord(cveId);
}

export async function writeTriageRecordForUser(userId: string, record: TriageRecord): Promise<TriageRecord> {
  return withTransaction((db) => {
    const previousRow = db.prepare(`
      SELECT cve_id as cveId, status, owner, notes, tags_json as tagsJson, updated_at as updatedAt, activity_json as activityJson
      FROM user_triage_records
      WHERE user_id = ? AND cve_id = ?
    `).get(userId, record.cveId) as {
      cveId: string;
      status: string;
      owner: string;
      notes: string;
      tagsJson: string;
      updatedAt: string;
      activityJson: string;
    } | undefined;

    const previous = previousRow
      ? normalizeTriageRecord({
          cveId: previousRow.cveId,
          status: previousRow.status as TriageRecord["status"],
          owner: previousRow.owner,
          notes: previousRow.notes,
          tags: parseStringArray(previousRow.tagsJson),
          updatedAt: previousRow.updatedAt,
          activity: parseAuditTrail(previousRow.activityJson),
        })
      : createDefaultTriageRecord(record.cveId);

    const normalized = normalizeTriageRecord(record);
    const next: TriageRecord = {
      ...normalized,
      activity: buildTriageActivity(previous, normalized),
    };

    db.prepare(`
      INSERT INTO user_triage_records (
        user_id, cve_id, status, owner, notes, tags_json, updated_at, activity_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, cve_id) DO UPDATE SET
        status = excluded.status,
        owner = excluded.owner,
        notes = excluded.notes,
        tags_json = excluded.tags_json,
        updated_at = excluded.updated_at,
        activity_json = excluded.activity_json
    `).run(
      userId,
      next.cveId,
      next.status,
      next.owner,
      next.notes,
      JSON.stringify(next.tags),
      next.updatedAt,
      JSON.stringify(next.activity)
    );

    return next;
  });
}

export async function importWorkspaceStateForUser(
  userId: string,
  input: {
    watchlist: string[];
    savedViews: SavedView[];
    alertRules: AlertRule[];
    inventoryAssets: InventoryAssetRecord[];
    triageRecords: TriageRecord[];
  },
  mode: WorkspaceImportMode
): Promise<void> {
  withTransaction((db) => {
    if (mode === "replace") {
      db.prepare("DELETE FROM user_watchlist WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_saved_views WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_alert_rules WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_inventory_assets WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_triage_records WHERE user_id = ?").run(userId);
    }

    const insertWatchlist = db.prepare(`
      INSERT OR REPLACE INTO user_watchlist (user_id, cve_id, added_at)
      VALUES (?, ?, ?)
    `);
    const insertSavedView = db.prepare(`
      INSERT OR REPLACE INTO user_saved_views (id, user_id, name, search_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertAlertRule = db.prepare(`
      INSERT OR REPLACE INTO user_alert_rules (id, user_id, name, search_json, created_at, last_checked_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertInventoryAsset = db.prepare(`
      INSERT OR REPLACE INTO user_inventory_assets (
        id, user_id, name, vendor, product, version, environment, criticality, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTriage = db.prepare(`
      INSERT OR REPLACE INTO user_triage_records (
        user_id, cve_id, status, owner, notes, tags_json, updated_at, activity_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const cveId of Array.from(new Set(input.watchlist.map((id) => id.trim()).filter(Boolean)))) {
      insertWatchlist.run(userId, cveId, new Date().toISOString());
    }

    for (const view of input.savedViews) {
      insertSavedView.run(
        view.id || crypto.randomUUID(),
        userId,
        view.name.trim() || "Imported view",
        JSON.stringify(normalizeSearchState(view.search)),
        view.createdAt || new Date().toISOString()
      );
    }

    for (const rule of input.alertRules) {
      insertAlertRule.run(
        rule.id || crypto.randomUUID(),
        userId,
        rule.name.trim() || "Imported alert",
        JSON.stringify(normalizeSearchState(rule.search)),
        rule.createdAt || new Date().toISOString(),
        rule.lastCheckedAt ?? null
      );
    }

    for (const asset of input.inventoryAssets.map(normalizeInventoryAsset)) {
      insertInventoryAsset.run(
        asset.id || crypto.randomUUID(),
        userId,
        asset.name,
        asset.vendor,
        asset.product,
        asset.version,
        asset.environment,
        asset.criticality,
        asset.notes,
        asset.createdAt,
        asset.updatedAt
      );
    }

    for (const triageRecord of input.triageRecords) {
      const normalized = normalizeTriageRecord(triageRecord);
      insertTriage.run(
        userId,
        normalized.cveId,
        normalized.status,
        normalized.owner,
        normalized.notes,
        JSON.stringify(normalized.tags),
        normalized.updatedAt,
        JSON.stringify(normalized.activity)
      );
    }
  });
}

async function getInventoryAssetForUser(userId: string, id: string): Promise<InventoryAssetRecord | null> {
  const row = getDb().prepare(`
    SELECT
      id,
      name,
      vendor,
      product,
      version,
      environment,
      criticality,
      notes,
      created_at as createdAt,
      updated_at as updatedAt
    FROM user_inventory_assets
    WHERE user_id = ? AND id = ?
  `).get(userId, id) as Record<string, string> | undefined;

  return row ? normalizeInventoryAssetRow(row) : null;
}

function parseSearchState(raw: string): SearchState | null {
  try {
    return normalizeSearchState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeInventoryAssetRow(row: Record<string, string>): InventoryAssetRecord {
  return normalizeInventoryAsset({
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    product: row.product,
    version: row.version,
    environment: row.environment,
    criticality: row.criticality as InventoryAssetRecord["criticality"],
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function normalizeInventoryAsset(asset: InventoryAssetRecord): InventoryAssetRecord {
  return {
    id: asset.id,
    name: asset.name.trim() || "Unnamed asset",
    vendor: asset.vendor.trim(),
    product: asset.product.trim(),
    version: asset.version.trim(),
    environment: asset.environment.trim() || "production",
    criticality: isInventoryCriticality(asset.criticality) ? asset.criticality : "medium",
    notes: asset.notes.trim(),
    createdAt: asset.createdAt || new Date().toISOString(),
    updatedAt: asset.updatedAt || new Date().toISOString(),
  };
}

function isInventoryCriticality(value: string): value is InventoryAssetRecord["criticality"] {
  return value === "critical" || value === "high" || value === "medium" || value === "low";
}

function parseAuditTrail(raw: string): TriageRecord["activity"] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.flatMap((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.id === "string" && typeof entry.action === "string" && typeof entry.summary === "string" && typeof entry.createdAt === "string"
            ? [{ id: entry.id, action: entry.action, summary: entry.summary, createdAt: entry.createdAt }]
            : []
        )
      : [];
  } catch {
    return [];
  }
}
