import { getDb } from "./db";
import { isGitHubTokenConfigured } from "./github";
import { scanRepoForUser } from "./repo-scan";
import { runDueNotificationDigestsForUser } from "./notifications-store";
import { loadAlertEvaluationsForUser } from "./workspace-context";

export interface SchedulerTickResult {
  skipped: boolean;
  alertUsers: number;
  digestUsers: number;
  rescannedRepos: number;
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 30 * 1000;
const DEFAULT_RESCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

const MAX_INTERVAL_MS = 2_147_483_647; // setInterval overflows above this and fires every 1 ms

// shortcut: in-process guard only; several app instances on one database would each tick. Move to a DB lease when scaling out.
// Kept on globalThis so a dev hot-reload that re-evaluates this module still shares one guard and one interval.
// A manual POST /api/notifications/run is forced on purpose and is not guarded against a running tick.
const state = globalThis as typeof globalThis & {
  __cvesearchSchedulerRunning?: boolean;
  __cvesearchSchedulerInterval?: ReturnType<typeof setInterval>;
  __cvesearchRescanFailures?: Map<string, number>;
};

// shortcut: failure backoff lives in memory and resets on restart; persist it if restarts get frequent.
const RESCAN_FAILURE_BACKOFF_MS = 60 * 60 * 1000;

function rescanKey(repo: { userId: string; fullName: string }): string {
  return `${repo.userId}:${repo.fullName}`;
}

function isInRescanBackoff(repo: { userId: string; fullName: string }): boolean {
  const failedAt = state.__cvesearchRescanFailures?.get(rescanKey(repo));
  return failedAt !== undefined && Date.now() - failedAt < RESCAN_FAILURE_BACKOFF_MS;
}

export function startScheduler(intervalMs: number): boolean {
  if (state.__cvesearchSchedulerInterval) return false;
  const tick = () => runSchedulerTick().catch((error) => console.error("[scheduler] tick failed", error));
  state.__cvesearchSchedulerInterval = setInterval(tick, intervalMs);
  state.__cvesearchSchedulerInterval.unref?.();
  return true;
}

export async function runSchedulerTick(): Promise<SchedulerTickResult> {
  if (state.__cvesearchSchedulerRunning) return { skipped: true, alertUsers: 0, digestUsers: 0, rescannedRepos: 0 };
  state.__cvesearchSchedulerRunning = true;
  try {
    const db = getDb();
    const now = new Date().toISOString();
    // Only users with a live session: rules of long-gone anonymous visitors would otherwise cost upstream paging forever.
    const alertUsers = (db.prepare(`
      SELECT DISTINCT r.user_id as userId
      FROM user_alert_rules r
      JOIN sessions s ON s.user_id = r.user_id AND s.expires_at > ?
    `).all(now) as Array<{ userId: string }>).map((row) => row.userId);
    const digestUsers = (db.prepare(`
      SELECT DISTINCT user_id as userId
      FROM user_notification_preferences
      WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
    `).all(now) as Array<{ userId: string }>).map((row) => row.userId);
    const rescanBefore = new Date(Date.now() - readSchedulerConfig().rescanIntervalMs).toISOString();
    const staleRepos = isGitHubTokenConfigured()
      ? (db.prepare(`
        SELECT DISTINCT r.user_id as userId, r.full_name as fullName
        FROM monitored_repos r
        JOIN sessions s ON s.user_id = r.user_id AND s.expires_at > ?
        WHERE r.source_kind = 'github' AND (r.last_scanned_at IS NULL OR r.last_scanned_at <= ?)
      `).all(now, rescanBefore) as Array<{ userId: string; fullName: string }>).filter((repo) => !isInRescanBackoff(repo))
      : [];

    // Rescans run first so their new-finding notifications reach digests due in this same tick.
    for (const repo of staleRepos) {
      await scanRepoForUser(repo.userId, repo.fullName).catch((error) => {
        state.__cvesearchRescanFailures ??= new Map();
        state.__cvesearchRescanFailures.set(rescanKey(repo), Date.now());
        console.error("[scheduler] repo rescan failed", repo.fullName, error);
      });
    }

    // One user's failure must not stop the others; the next tick retries.
    for (const userId of alertUsers) {
      await loadAlertEvaluationsForUser(userId).catch((error) => console.error("[scheduler] alert evaluation failed", userId, error));
    }
    for (const userId of digestUsers) {
      await runDueNotificationDigestsForUser(userId).catch((error) => console.error("[scheduler] digest run failed", userId, error));
    }

    return { skipped: false, alertUsers: alertUsers.length, digestUsers: digestUsers.length, rescannedRepos: staleRepos.length };
  } finally {
    state.__cvesearchSchedulerRunning = false;
  }
}

export function readSchedulerConfig(env: Record<string, string | undefined> = process.env): { enabled: boolean; intervalMs: number; rescanIntervalMs: number } {
  const interval = Number(env.SCHEDULER_INTERVAL_MS);
  const rescanInterval = Number(env.REPO_RESCAN_INTERVAL_MS);
  return {
    enabled: env.SCHEDULER_ENABLED === "true",
    intervalMs: Number.isFinite(interval) && interval > 0 ? Math.min(Math.max(interval, MIN_INTERVAL_MS), MAX_INTERVAL_MS) : DEFAULT_INTERVAL_MS,
    rescanIntervalMs: Number.isFinite(rescanInterval) && rescanInterval > 0 ? rescanInterval : DEFAULT_RESCAN_INTERVAL_MS,
  };
}
