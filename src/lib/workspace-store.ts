import { getDb, withTransaction } from "./db";
import { normalizeSearchState, SearchState } from "./search";
import {
  buildTriageActivity,
  createDefaultTriageRecord,
  normalizeTriageRecord,
  TriageRecord,
} from "./triage-shared";
import { AlertRule, SavedView, WorkspaceImportMode } from "./workspace-types";

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
    triageRecords: TriageRecord[];
  },
  mode: WorkspaceImportMode
): Promise<void> {
  withTransaction((db) => {
    if (mode === "replace") {
      db.prepare("DELETE FROM user_watchlist WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_saved_views WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_alert_rules WHERE user_id = ?").run(userId);
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
