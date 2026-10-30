import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.join(process.cwd(), "data");

let currentPath = "";
let currentDb: DatabaseSync | null = null;

export function getDatabaseFile(): string {
  const explicit = process.env.DATABASE_FILE?.trim();
  if (explicit) {
    return assertSafeDbPath(explicit);
  }

  const scopedFile = [
    process.env.PROJECTS_FILE,
    process.env.MONITORED_REPOS_FILE,
    process.env.AI_RUNS_FILE,
    process.env.API_REQUEST_LOG_FILE,
  ].find((value) => typeof value === "string" && value.trim());

  if (scopedFile) {
    return assertSafeDbPath(path.join(path.dirname(scopedFile), "state.db"));
  }

  return path.join(DATA_DIR, "app.db");
}

function assertSafeDbPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const allowed = [DATA_DIR, os.tmpdir()].map((dir) => path.resolve(dir));
  if (!allowed.some((dir) => resolved.startsWith(dir + path.sep) || resolved === dir)) {
    throw new Error(`Database path must be inside the data or temp directory, got: ${resolved}`);
  }
  return resolved;
}

export function getDb(): DatabaseSync {
  const nextPath = getDatabaseFile();

  if (!currentDb || currentPath !== nextPath) {
    currentDb?.close();
    currentDb = null;
    currentDb = new DatabaseSync(nextPath);
    currentPath = nextPath;
    initializeDatabase(currentDb);
  }

  return currentDb;
}

export function withTransaction<T>(callback: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");

  try {
    const result = callback(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function initializeDatabase(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT '',
      due_at TEXT,
      labels_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_items (
      project_id TEXT NOT NULL,
      cve_id TEXT NOT NULL,
      note TEXT NOT NULL,
      added_at TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT '',
      remediation_state TEXT NOT NULL DEFAULT 'not_started',
      sla_due_at TEXT,
      exception_json TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (project_id, cve_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_activity (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_project_activity_project_id ON project_activity(project_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS monitored_repos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      github_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      html_url TEXT NOT NULL,
      is_private INTEGER NOT NULL,
      default_branch TEXT NOT NULL,
      added_at TEXT NOT NULL,
      last_scanned_at TEXT,
      last_scan_vulnerability_count INTEGER,
      UNIQUE(user_id, full_name)
    );

    CREATE TABLE IF NOT EXISTS monitored_repo_scans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      repo_id TEXT,
      repo_full_name TEXT NOT NULL,
      branch TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      dependency_count INTEGER NOT NULL,
      location_count INTEGER NOT NULL,
      vulnerability_count INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      error TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (repo_id) REFERENCES monitored_repos(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_monitored_repo_scans_repo_full_name ON monitored_repo_scans(repo_full_name, scanned_at DESC);

    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      feature TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      output TEXT NOT NULL,
      tool_calls_json TEXT NOT NULL,
      error TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_runs_created_at ON ai_runs(created_at DESC);

    CREATE TABLE IF NOT EXISTS api_request_logs (
      id TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      method TEXT NOT NULL,
      status INTEGER NOT NULL,
      duration_ms REAL NOT NULL,
      limited INTEGER NOT NULL,
      client_id TEXT NOT NULL,
      error TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON api_request_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS api_rate_limits (
      bucket TEXT NOT NULL,
      client_id TEXT NOT NULL,
      window_started_at INTEGER NOT NULL,
      count INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (bucket, client_id)
    );

    CREATE TABLE IF NOT EXISTS cached_cves (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL DEFAULT '',
      summary_json TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL DEFAULT '',
      published_at TEXT,
      modified_at TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cached_cves_modified_at ON cached_cves(modified_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cached_cves_published_at ON cached_cves(published_at DESC);

    CREATE TABLE IF NOT EXISTS user_watchlist (
      user_id TEXT NOT NULL,
      cve_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (user_id, cve_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_id ON user_watchlist(user_id, added_at DESC);

    CREATE TABLE IF NOT EXISTS user_saved_views (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      search_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_saved_views_user_id ON user_saved_views(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_prompt_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_prompt_templates_user_id ON user_prompt_templates(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS user_alert_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      search_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_checked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_alert_rules_user_id ON user_alert_rules(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS alert_rule_matches (
      rule_id TEXT NOT NULL,
      cve_id TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      published_at TEXT,
      matched_at TEXT NOT NULL,
      read_at TEXT,
      PRIMARY KEY (rule_id, cve_id),
      FOREIGN KEY (rule_id) REFERENCES user_alert_rules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL,
      cadence TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_sent_at TEXT,
      next_run_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id ON user_notification_preferences(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS user_notification_deliveries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      preference_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL,
      cadence TEXT NOT NULL,
      headline TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (preference_id) REFERENCES user_notification_preferences(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_notification_deliveries_user_id ON user_notification_deliveries(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_inventory_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      vendor TEXT NOT NULL,
      product TEXT NOT NULL,
      version TEXT NOT NULL,
      environment TEXT NOT NULL,
      criticality TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_inventory_assets_user_id ON user_inventory_assets(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS inventory_asset_matches (
      asset_id TEXT NOT NULL,
      cve_id TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      published_at TEXT,
      first_seen_at TEXT NOT NULL,
      PRIMARY KEY (asset_id, cve_id),
      FOREIGN KEY (asset_id) REFERENCES user_inventory_assets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_triage_records (
      user_id TEXT NOT NULL,
      cve_id TEXT NOT NULL,
      status TEXT NOT NULL,
      owner TEXT NOT NULL,
      notes TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      activity_json TEXT NOT NULL,
      PRIMARY KEY (user_id, cve_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_triage_records_user_id ON user_triage_records(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS user_finding_triage (
      user_id TEXT NOT NULL,
      finding_key TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      accepted_until TEXT,
      kev_at_acceptance INTEGER,
      severity_at_acceptance TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, finding_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_workspace_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_workspace_conversations_user_id ON user_workspace_conversations(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS user_workspace_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      references_json TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES user_workspace_conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_workspace_messages_conversation_id ON user_workspace_messages(conversation_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS ai_cache (
      user_id TEXT NOT NULL,
      feature TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      output_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, feature, entity_id)
    );
  `);

  ensureColumn(db, "projects", "owner", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "user_notification_deliveries", "error", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "projects", "due_at", "TEXT");
  ensureColumn(db, "projects", "labels_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "projects", "status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(db, "projects", "user_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "project_items", "owner", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "project_items", "remediation_state", "TEXT NOT NULL DEFAULT 'not_started'");
  ensureColumn(db, "project_items", "sla_due_at", "TEXT");
  ensureColumn(db, "project_items", "exception_json", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "project_items", "updated_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "ai_runs", "user_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "user_alert_rules", "cursor_published_at", "TEXT");
  ensureColumn(db, "alert_rule_matches", "published_at", "TEXT");
  ensureColumn(db, "user_inventory_assets", "match_cursor_published_at", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_alert_rule_matches_rule_id ON alert_rule_matches(rule_id, published_at DESC, matched_at DESC)");

  migrateMonitoredRepoScope(db);
  ensureColumn(db, "monitored_repos", "user_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "monitored_repo_scans", "user_id", "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_monitored_repos_user_id ON monitored_repos(user_id, added_at DESC);
    CREATE INDEX IF NOT EXISTS idx_monitored_repo_scans_user_id ON monitored_repo_scans(user_id, repo_full_name, scanned_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_runs_user_id ON ai_runs(user_id, created_at DESC);
  `);

  migrateJsonBackfills(db);
}

function migrateJsonBackfills(db: DatabaseSync): void {
  migrateProjects(db);
  migrateMonitoredRepos(db);
  migrateAIRuns(db);
  migrateAPIRequestLogs(db);
}

function migrateProjects(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) as count FROM projects").get() as { count: number };
  if (count.count > 0) {
    return;
  }

  const file = process.env.PROJECTS_FILE?.trim() || path.join(DATA_DIR, "projects.json");
  const parsed = readJsonArray(file);
  if (!parsed) {
    return;
  }

  const insertProject = db.prepare(`
    INSERT INTO projects (id, name, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO project_items (project_id, cve_id, note, added_at)
    VALUES (?, ?, ?, ?)
  `);
  const insertActivity = db.prepare(`
    INSERT INTO project_activity (id, project_id, action, summary, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  withTransaction(() => {
    for (const project of parsed) {
      if (!isRecord(project) || typeof project.id !== "string") {
        continue;
      }

      insertProject.run(
        project.id,
        typeof project.name === "string" ? project.name : "Untitled project",
        typeof project.description === "string" ? project.description : "",
        typeof project.createdAt === "string" ? project.createdAt : new Date().toISOString(),
        typeof project.updatedAt === "string" ? project.updatedAt : new Date().toISOString()
      );

      if (Array.isArray(project.items)) {
        for (const item of project.items) {
          if (!isRecord(item) || typeof item.cveId !== "string") {
            continue;
          }

          insertItem.run(
            project.id,
            item.cveId,
            typeof item.note === "string" ? item.note : "",
            typeof item.addedAt === "string" ? item.addedAt : new Date().toISOString()
          );
        }
      }

      if (Array.isArray(project.activity)) {
        for (const activity of project.activity) {
          if (!isRecord(activity) || typeof activity.id !== "string") {
            continue;
          }

          insertActivity.run(
            activity.id,
            project.id,
            typeof activity.action === "string" ? activity.action : "project_updated",
            typeof activity.summary === "string" ? activity.summary : "Updated project",
            typeof activity.createdAt === "string" ? activity.createdAt : new Date().toISOString()
          );
        }
      }
    }
  });
}

function migrateMonitoredRepos(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) as count FROM monitored_repos").get() as { count: number };
  if (count.count > 0) {
    return;
  }

  const file = process.env.MONITORED_REPOS_FILE?.trim() || path.join(DATA_DIR, "monitored-repos.json");
  const parsed = readJsonArray(file);
  if (!parsed) {
    return;
  }

  const insertRepo = db.prepare(`
    INSERT INTO monitored_repos (
      id,
      user_id,
      github_id,
      full_name,
      html_url,
      is_private,
      default_branch,
      added_at,
      last_scanned_at,
      last_scan_vulnerability_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  withTransaction(() => {
    for (const repo of parsed) {
      if (!isRecord(repo) || typeof repo.id !== "string") {
        continue;
      }

      insertRepo.run(
        repo.id,
        "",
        typeof repo.githubId === "number" ? repo.githubId : 0,
        typeof repo.fullName === "string" ? repo.fullName : "",
        typeof repo.htmlUrl === "string" ? repo.htmlUrl : "",
        repo.isPrivate === true ? 1 : 0,
        typeof repo.defaultBranch === "string" ? repo.defaultBranch : "main",
        typeof repo.addedAt === "string" ? repo.addedAt : new Date().toISOString(),
        typeof repo.lastScannedAt === "string" ? repo.lastScannedAt : null,
        typeof repo.lastScanVulnerabilityCount === "number" ? repo.lastScanVulnerabilityCount : null
      );
    }
  });
}

function migrateAIRuns(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) as count FROM ai_runs").get() as { count: number };
  if (count.count > 0) {
    return;
  }

  const file = process.env.AI_RUNS_FILE?.trim() || path.join(DATA_DIR, "ai-runs.json");
  const parsed = readJsonArray(file);
  if (!parsed) {
    return;
  }

  const insertRun = db.prepare(`
    INSERT INTO ai_runs (
      id, user_id, feature, provider, model, mode, status, prompt, output, tool_calls_json, error, duration_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  withTransaction(() => {
    for (const run of parsed) {
      if (!isRecord(run) || typeof run.id !== "string") {
        continue;
      }

      insertRun.run(
        run.id,
        "",
        typeof run.feature === "string" ? run.feature : "unknown",
        typeof run.provider === "string" ? run.provider : "unknown",
        typeof run.model === "string" ? run.model : "",
        typeof run.mode === "string" ? run.mode : "heuristic",
        typeof run.status === "string" ? run.status : "error",
        typeof run.prompt === "string" ? run.prompt : "",
        typeof run.output === "string" ? run.output : "",
        JSON.stringify(Array.isArray(run.toolCalls) ? run.toolCalls : []),
        typeof run.error === "string" ? run.error : "",
        typeof run.durationMs === "number" ? run.durationMs : 0,
        typeof run.createdAt === "string" ? run.createdAt : new Date().toISOString()
      );
    }
  });
}

function migrateMonitoredRepoScope(db: DatabaseSync): void {
  const repoColumns = db.prepare("PRAGMA table_info(monitored_repos)").all() as Array<{ name: string }>;
  const scanColumns = db.prepare("PRAGMA table_info(monitored_repo_scans)").all() as Array<{ name: string }>;
  const hasScopedRepos = repoColumns.some((column) => column.name === "user_id");
  const hasScopedScans = scanColumns.some((column) => column.name === "user_id");

  if (hasScopedRepos && hasScopedScans) {
    return;
  }

  const repoUserSelect = hasScopedRepos ? "COALESCE(user_id, '')" : "''";
  const scanUserSelect = hasScopedScans
    ? "COALESCE(scans.user_id, repos.user_id, '')"
    : hasScopedRepos
      ? "COALESCE(repos.user_id, '')"
      : "''";

  withTransaction((tx) => {
    tx.exec(`
      DROP INDEX IF EXISTS idx_monitored_repo_scans_repo_full_name;
      DROP INDEX IF EXISTS idx_monitored_repos_user_id;
      DROP INDEX IF EXISTS idx_monitored_repo_scans_user_id;

      ALTER TABLE monitored_repo_scans RENAME TO monitored_repo_scans_legacy;
      ALTER TABLE monitored_repos RENAME TO monitored_repos_legacy;

      CREATE TABLE monitored_repos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        github_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        html_url TEXT NOT NULL,
        is_private INTEGER NOT NULL,
        default_branch TEXT NOT NULL,
        added_at TEXT NOT NULL,
        last_scanned_at TEXT,
        last_scan_vulnerability_count INTEGER,
        UNIQUE(user_id, full_name)
      );

      CREATE TABLE monitored_repo_scans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        repo_id TEXT,
        repo_full_name TEXT NOT NULL,
        branch TEXT NOT NULL,
        scanned_at TEXT NOT NULL,
        dependency_count INTEGER NOT NULL,
        location_count INTEGER NOT NULL,
        vulnerability_count INTEGER NOT NULL,
        result_json TEXT NOT NULL,
        error TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (repo_id) REFERENCES monitored_repos(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_monitored_repos_user_id ON monitored_repos(user_id, added_at DESC);
      CREATE INDEX idx_monitored_repo_scans_repo_full_name ON monitored_repo_scans(repo_full_name, scanned_at DESC);
      CREATE INDEX idx_monitored_repo_scans_user_id ON monitored_repo_scans(user_id, repo_full_name, scanned_at DESC);
    `);

    tx.exec(`
      INSERT INTO monitored_repos (
        id,
        user_id,
        github_id,
        full_name,
        html_url,
        is_private,
        default_branch,
        added_at,
        last_scanned_at,
        last_scan_vulnerability_count
      )
      SELECT
        id,
        ${repoUserSelect},
        github_id,
        full_name,
        html_url,
        is_private,
        default_branch,
        added_at,
        last_scanned_at,
        last_scan_vulnerability_count
      FROM monitored_repos_legacy;

      INSERT INTO monitored_repo_scans (
        id,
        user_id,
        repo_id,
        repo_full_name,
        branch,
        scanned_at,
        dependency_count,
        location_count,
        vulnerability_count,
        result_json,
        error
      )
      SELECT
        scans.id,
        ${scanUserSelect},
        scans.repo_id,
        scans.repo_full_name,
        scans.branch,
        scans.scanned_at,
        scans.dependency_count,
        scans.location_count,
        scans.vulnerability_count,
        scans.result_json,
        scans.error
      FROM monitored_repo_scans_legacy scans
      LEFT JOIN monitored_repos repos ON repos.id = scans.repo_id;

      DROP TABLE monitored_repo_scans_legacy;
      DROP TABLE monitored_repos_legacy;
    `);
  });
}

function migrateAPIRequestLogs(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) as count FROM api_request_logs").get() as { count: number };
  if (count.count > 0) {
    return;
  }

  const file = process.env.API_REQUEST_LOG_FILE?.trim() || path.join(DATA_DIR, "api-requests.json");
  const parsed = readJsonArray(file);
  if (!parsed) {
    return;
  }

  const insertLog = db.prepare(`
    INSERT INTO api_request_logs (
      id, route, method, status, duration_ms, limited, client_id, error, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  withTransaction(() => {
    for (const record of parsed) {
      if (!isRecord(record) || typeof record.id !== "string") {
        continue;
      }

      insertLog.run(
        record.id,
        typeof record.route === "string" ? record.route : "",
        typeof record.method === "string" ? record.method : "GET",
        typeof record.status === "number" ? record.status : 200,
        typeof record.durationMs === "number" ? record.durationMs : 0,
        record.limited === true ? 1 : 0,
        typeof record.clientId === "string" ? record.clientId : "",
        typeof record.error === "string" ? record.error : "",
        typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString()
      );
    }
  });
}

function readJsonArray(filePath: string): unknown[] | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const SAFE_SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_COLUMN_DEFINITION = /^[A-Z ]+(?:DEFAULT (?:'[^']*'|[0-9]+|NULL))?$/;

function assertSafeSQLIdentifier(value: string, label: string): void {
  if (!SAFE_SQL_IDENTIFIER.test(value)) {
    throw new Error(`Unsafe ${label} identifier rejected: ${value}`);
  }
}

export function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  assertSafeSQLIdentifier(table, "table");
  assertSafeSQLIdentifier(column, "column");
  if (!SAFE_COLUMN_DEFINITION.test(definition)) {
    throw new Error(`Unsafe column definition rejected: ${definition}`);
  }

  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((entry) => entry.name === column)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
