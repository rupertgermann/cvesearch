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

// shortcut: in-process guard only; several app instances on one database would each tick. Move to a DB lease when scaling out.
let running = false;

export async function runSchedulerTick(): Promise<SchedulerTickResult> {
  if (running) return { skipped: true, alertUsers: 0, digestUsers: 0 };
  running = true;
  try {
    const db = getDb();
    const alertUsers = (db.prepare("SELECT DISTINCT user_id as userId FROM user_alert_rules").all() as Array<{ userId: string }>)
      .map((row) => row.userId);
    const digestUsers = (db.prepare(`
      SELECT DISTINCT user_id as userId
      FROM user_notification_preferences
      WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
    `).all(new Date().toISOString()) as Array<{ userId: string }>).map((row) => row.userId);

    // One user's failure must not stop the others; the next tick retries.
    for (const userId of alertUsers) {
      await loadAlertEvaluationsForUser(userId).catch((error) => console.error("[scheduler] alert evaluation failed", userId, error));
    }
    for (const userId of digestUsers) {
      await runDueNotificationDigestsForUser(userId).catch((error) => console.error("[scheduler] digest run failed", userId, error));
    }

    return { skipped: false, alertUsers: alertUsers.length, digestUsers: digestUsers.length };
  } finally {
    running = false;
  }
}

export function readSchedulerConfig(env: Record<string, string | undefined> = process.env): { enabled: boolean; intervalMs: number } {
  const interval = Number(env.SCHEDULER_INTERVAL_MS);
  return {
    enabled: env.SCHEDULER_ENABLED === "true",
    intervalMs: Number.isFinite(interval) && interval > 0 ? Math.max(interval, MIN_INTERVAL_MS) : DEFAULT_INTERVAL_MS,
  };
}
