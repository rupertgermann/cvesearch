import { getDb } from "./db";
import { runDueNotificationDigestsForUser } from "./notifications-store";
import { loadAlertEvaluationsForUser } from "./workspace-context";

export interface SchedulerTickResult {
  skipped: boolean;
  alertUsers: number;
  digestUsers: number;
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 30 * 1000;

const MAX_INTERVAL_MS = 2_147_483_647; // setInterval overflows above this and fires every 1 ms

// shortcut: in-process guard only; several app instances on one database would each tick. Move to a DB lease when scaling out.
// Kept on globalThis so a dev hot-reload that re-evaluates this module still shares one guard and one interval.
// A manual POST /api/notifications/run is forced on purpose and is not guarded against a running tick.
const state = globalThis as typeof globalThis & { __cvesearchSchedulerRunning?: boolean; __cvesearchSchedulerInterval?: ReturnType<typeof setInterval> };

export function startScheduler(intervalMs: number): boolean {
  if (state.__cvesearchSchedulerInterval) return false;
  const tick = () => runSchedulerTick().catch((error) => console.error("[scheduler] tick failed", error));
  state.__cvesearchSchedulerInterval = setInterval(tick, intervalMs);
  state.__cvesearchSchedulerInterval.unref?.();
  return true;
}

export async function runSchedulerTick(): Promise<SchedulerTickResult> {
  if (state.__cvesearchSchedulerRunning) return { skipped: true, alertUsers: 0, digestUsers: 0 };
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

    // One user's failure must not stop the others; the next tick retries.
    for (const userId of alertUsers) {
      await loadAlertEvaluationsForUser(userId).catch((error) => console.error("[scheduler] alert evaluation failed", userId, error));
    }
    for (const userId of digestUsers) {
      await runDueNotificationDigestsForUser(userId).catch((error) => console.error("[scheduler] digest run failed", userId, error));
    }

    return { skipped: false, alertUsers: alertUsers.length, digestUsers: digestUsers.length };
  } finally {
    state.__cvesearchSchedulerRunning = false;
  }
}

export function readSchedulerConfig(env: Record<string, string | undefined> = process.env): { enabled: boolean; intervalMs: number } {
  const interval = Number(env.SCHEDULER_INTERVAL_MS);
  return {
    enabled: env.SCHEDULER_ENABLED === "true",
    intervalMs: Number.isFinite(interval) && interval > 0 ? Math.min(Math.max(interval, MIN_INTERVAL_MS), MAX_INTERVAL_MS) : DEFAULT_INTERVAL_MS,
  };
}
