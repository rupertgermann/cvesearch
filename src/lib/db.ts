import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.join(process.cwd(), "data");

let currentPath = "";
let currentDb: DatabaseSync | null = null;

export function getDatabaseFile(): string {
  const explicit = process.env.DATABASE_FILE?.trim();
  if (explicit) {
    return explicit;
  }

  const scopedFile = [
    process.env.PROJECTS_FILE,
    process.env.MONITORED_REPOS_FILE,
    process.env.AI_RUNS_FILE,
    process.env.API_REQUEST_LOG_FILE,
  ].find((value) => typeof value === "string" && value.trim());

  if (scopedFile) {
    return path.join(path.dirname(scopedFile), "state.db");
  }

  return path.join(DATA_DIR, "app.db");
}

export function getDb(): DatabaseSync {
  const nextPath = getDatabaseFile();

  if (!currentDb || currentPath !== nextPath) {
    currentDb?.close();
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
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_items (
      project_id TEXT NOT NULL,
      cve_id TEXT NOT NULL,
      note TEXT NOT NULL,
      added_at TEXT NOT NULL,
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
      github_id INTEGER NOT NULL,
      full_name TEXT NOT NULL UNIQUE,
      html_url TEXT NOT NULL,
      is_private INTEGER NOT NULL,
      default_branch TEXT NOT NULL,
      added_at TEXT NOT NULL,
      last_scanned_at TEXT,
      last_scan_vulnerability_count INTEGER
    );

    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
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
      github_id,
      full_name,
      html_url,
      is_private,
      default_branch,
      added_at,
      last_scanned_at,
      last_scan_vulnerability_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  withTransaction(() => {
    for (const repo of parsed) {
      if (!isRecord(repo) || typeof repo.id !== "string") {
        continue;
      }

      insertRepo.run(
        repo.id,
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
      id, feature, provider, model, mode, status, prompt, output, tool_calls_json, error, duration_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  withTransaction(() => {
    for (const run of parsed) {
      if (!isRecord(run) || typeof run.id !== "string") {
        continue;
      }

      insertRun.run(
        run.id,
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
