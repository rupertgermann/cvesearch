import { generateDigest } from "./ai-service";
import { PublicRouteError } from "./api-route-guard";
import { getDb } from "./db";
import { AIDigest } from "./types";
import { buildDigestInputFromWorkspaceSnapshot, loadWorkspaceContextSnapshot } from "./workspace-context";
import { NotificationCadence, NotificationChannel, NotificationDeliveryRecord, NotificationPreferenceRecord } from "./workspace-types";

const DELIVERY_TIMEOUT_MS = 10_000;

interface NotificationPreferenceRow {
  id: string;
  teamName: string;
  channel: string;
  destination: string;
  cadence: string;
  enabled: number | boolean;
  createdAt: string;
  updatedAt: string;
  lastSentAt: string | null;
  nextRunAt: string | null;
}

interface NotificationDeliveryRow {
  id: string;
  preferenceId: string;
  teamName: string;
  channel: string;
  destination: string;
  cadence: string;
  headline: string;
  summary: string;
  status: string;
  error: string;
  itemCount: number;
  createdAt: string;
  deliveredAt: string | null;
}

export async function listNotificationPreferencesForUser(userId: string): Promise<NotificationPreferenceRecord[]> {
  const rows = getDb().prepare(`
    SELECT
      id,
      team_name as teamName,
      channel,
      destination,
      cadence,
      enabled,
      created_at as createdAt,
      updated_at as updatedAt,
      last_sent_at as lastSentAt,
      next_run_at as nextRunAt
    FROM user_notification_preferences
    WHERE user_id = ?
    ORDER BY updated_at DESC, created_at DESC
  `).all(userId) as NotificationPreferenceRow[];

  return rows.map(normalizePreferenceRow);
}

export async function createNotificationPreferenceForUser(
  userId: string,
  input: Pick<NotificationPreferenceRecord, "teamName" | "channel" | "destination" | "cadence"> & { enabled?: boolean }
): Promise<NotificationPreferenceRecord> {
  const now = new Date().toISOString();
  const record = normalizePreference({
    id: crypto.randomUUID(),
    teamName: input.teamName,
    channel: input.channel,
    destination: input.destination,
    cadence: input.cadence,
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now,
    lastSentAt: null,
    nextRunAt: scheduleNextRun(now, input.cadence),
  });
  assertDeliverableDestination(record);

  getDb().prepare(`
    INSERT INTO user_notification_preferences (
      id, user_id, team_name, channel, destination, cadence, enabled, created_at, updated_at, last_sent_at, next_run_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    userId,
    record.teamName,
    record.channel,
    record.destination,
    record.cadence,
    record.enabled ? 1 : 0,
    record.createdAt,
    record.updatedAt,
    record.lastSentAt,
    record.nextRunAt
  );

  return record;
}

export async function updateNotificationPreferenceForUser(
  userId: string,
  id: string,
  input: Partial<Pick<NotificationPreferenceRecord, "teamName" | "channel" | "destination" | "cadence" | "enabled">>
): Promise<NotificationPreferenceRecord | null> {
  const existing = await getNotificationPreferenceForUser(userId, id);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  const cadence = input.cadence ?? existing.cadence;
  const nextRunAt = input.enabled === false
    ? null
    : shouldScheduleNextRun(existing, input)
      ? scheduleNextRun(now, cadence)
      : existing.nextRunAt;

  const record = normalizePreference({
    ...existing,
    ...input,
    id,
    updatedAt: now,
    nextRunAt,
  });
  // Only on target changes, so a legacy non-HTTPS row can still be paused or renamed.
  if (input.channel !== undefined || input.destination !== undefined) {
    assertDeliverableDestination(record);
  }

  getDb().prepare(`
    UPDATE user_notification_preferences
    SET team_name = ?, channel = ?, destination = ?, cadence = ?, enabled = ?, updated_at = ?, next_run_at = ?
    WHERE user_id = ? AND id = ?
  `).run(
    record.teamName,
    record.channel,
    record.destination,
    record.cadence,
    record.enabled ? 1 : 0,
    record.updatedAt,
    record.nextRunAt,
    userId,
    id
  );

  return record;
}

export async function deleteNotificationPreferenceForUser(userId: string, id: string): Promise<boolean> {
  const result = getDb().prepare("DELETE FROM user_notification_preferences WHERE user_id = ? AND id = ?").run(userId, id);
  return result.changes > 0;
}

export async function getNotificationPreferenceForUser(userId: string, id: string): Promise<NotificationPreferenceRecord | null> {
  const row = getDb().prepare(`
    SELECT
      id,
      team_name as teamName,
      channel,
      destination,
      cadence,
      enabled,
      created_at as createdAt,
      updated_at as updatedAt,
      last_sent_at as lastSentAt,
      next_run_at as nextRunAt
    FROM user_notification_preferences
    WHERE user_id = ? AND id = ?
  `).get(userId, id) as NotificationPreferenceRow | undefined;

  return row ? normalizePreferenceRow(row) : null;
}

export async function listNotificationDeliveriesForUser(userId: string, limit = 12): Promise<NotificationDeliveryRecord[]> {
  const rows = getDb().prepare(`
    SELECT
      id,
      preference_id as preferenceId,
      team_name as teamName,
      channel,
      destination,
      cadence,
      headline,
      summary,
      status,
      error,
      item_count as itemCount,
      created_at as createdAt,
      delivered_at as deliveredAt
    FROM user_notification_deliveries
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit) as NotificationDeliveryRow[];

  return rows.map(normalizeDeliveryRow);
}

export async function runDueNotificationDigestsForUser(
  userId: string,
  input?: { force?: boolean; preview?: boolean; preferenceId?: string }
): Promise<NotificationDeliveryRecord[]> {
  const preferences = await listNotificationPreferencesForUser(userId);
  const now = new Date();
  const due = preferences.filter((preference) => {
    if (!preference.enabled) return false;
    if (input?.preferenceId && preference.id !== input.preferenceId) return false;
    if (input?.force) return true;
    if (!preference.nextRunAt) return false;
    return Date.parse(preference.nextRunAt) <= now.getTime();
  });

  if (due.length === 0) {
    return [];
  }

  const workspace = await loadWorkspaceContextSnapshot(userId);
  const digest = await generateDigest(buildDigestInputFromWorkspaceSnapshot(workspace), { userId });

  const deliveries: NotificationDeliveryRecord[] = [];

  for (const preference of due) {
    const createdAt = now.toISOString();
    const delivery: NotificationDeliveryRecord = {
      id: crypto.randomUUID(),
      preferenceId: preference.id,
      teamName: preference.teamName,
      channel: preference.channel,
      destination: preference.destination,
      cadence: preference.cadence,
      headline: digest.headline,
      summary: digest.sections.map((section) => `${section.title}: ${section.body}`).join("\n"),
      status: "preview",
      itemCount: digest.sections.reduce((sum, section) => sum + section.items.length, 0),
      createdAt,
      deliveredAt: createdAt,
    };

    if (!input?.preview) {
      const error = await deliverDigest(preference, delivery, digest);
      delivery.status = error ? "failed" : "sent";
      delivery.error = error ?? undefined;
      delivery.deliveredAt = error ? null : new Date().toISOString();
    }

    getDb().prepare(`
      INSERT INTO user_notification_deliveries (
        id, user_id, preference_id, team_name, channel, destination, cadence, headline, summary, status, error, item_count, created_at, delivered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      delivery.id,
      userId,
      delivery.preferenceId,
      delivery.teamName,
      delivery.channel,
      delivery.destination,
      delivery.cadence,
      delivery.headline,
      delivery.summary,
      delivery.status,
      delivery.error ?? "",
      delivery.itemCount,
      delivery.createdAt,
      delivery.deliveredAt
    );

    // A failed delivery keeps its next_run_at, so the next due run retries it.
    if (delivery.status === "sent") {
      getDb().prepare(`
        UPDATE user_notification_preferences
        SET last_sent_at = ?, next_run_at = ?, updated_at = ?
        WHERE user_id = ? AND id = ?
      `).run(
        createdAt,
        scheduleNextRun(createdAt, preference.cadence),
        createdAt,
        userId,
        preference.id
      );
    }

    deliveries.push(delivery);
  }

  return deliveries;
}

// Returns the failure reason, or null when delivered. Email and in-app channels are record-only.
async function deliverDigest(
  preference: NotificationPreferenceRecord,
  delivery: NotificationDeliveryRecord,
  digest: AIDigest
): Promise<string | null> {
  if (preference.channel !== "webhook" && preference.channel !== "slack") return null;
  if (!isHttpsUrl(preference.destination)) return "Destination must be an HTTPS URL";

  const items = digest.sections.flatMap((section) => section.items);
  const payload = preference.channel === "slack"
    ? { text: `*${delivery.headline}*\n${digest.sections.map((section) => `*${section.title}*: ${section.body}`).join("\n")}` }
    : {
      headline: delivery.headline,
      summary: delivery.summary,
      items,
      sections: digest.sections,
      teamName: delivery.teamName,
      cadence: delivery.cadence,
      createdAt: delivery.createdAt,
    };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetch(preference.destination, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "CVESearch-WebApp/1.0" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response.ok ? null : `HTTP ${response.status} ${response.statusText}`.trim();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "Delivery timed out";
    return error instanceof Error ? error.message : "Delivery failed";
  } finally {
    clearTimeout(timeout);
  }
}

function assertDeliverableDestination(record: Pick<NotificationPreferenceRecord, "channel" | "destination">): void {
  if (requiresHttpsDestination(record.channel) && !isHttpsUrl(record.destination)) {
    const message = "Webhook and Slack destinations must be HTTPS URLs";
    throw new PublicRouteError(message, message, 400);
  }
}

function requiresHttpsDestination(channel: NotificationChannel): boolean {
  return channel === "webhook" || channel === "slack";
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizePreferenceRow(row: NotificationPreferenceRow): NotificationPreferenceRecord {
  return normalizePreference({
    id: row.id,
    teamName: row.teamName,
    channel: row.channel as NotificationPreferenceRecord["channel"],
    destination: row.destination,
    cadence: row.cadence as NotificationCadence,
    enabled: row.enabled === true || row.enabled === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastSentAt: row.lastSentAt,
    nextRunAt: row.nextRunAt,
  });
}

function shouldScheduleNextRun(
  existing: NotificationPreferenceRecord,
  input: Partial<Pick<NotificationPreferenceRecord, "cadence" | "enabled">>
): boolean {
  if (input.cadence && input.cadence !== existing.cadence) {
    return true;
  }

  if (input.enabled === true && (!existing.enabled || !existing.nextRunAt)) {
    return true;
  }

  return false;
}

function normalizePreference(value: NotificationPreferenceRecord): NotificationPreferenceRecord {
  return {
    id: value.id,
    teamName: typeof value.teamName === "string" ? value.teamName.trim() || "Security team" : "Security team",
    channel: isChannel(value.channel) ? value.channel : "in_app",
    destination: typeof value.destination === "string" ? value.destination.trim() : "",
    cadence: value.cadence === "weekly" ? "weekly" : "daily",
    enabled: value.enabled !== false,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    lastSentAt: value.lastSentAt ?? null,
    nextRunAt: value.nextRunAt ?? null,
  };
}

function normalizeDeliveryRow(row: NotificationDeliveryRow): NotificationDeliveryRecord {
  return {
    id: row.id,
    preferenceId: row.preferenceId,
    teamName: row.teamName,
    channel: isChannel(row.channel) ? row.channel : "in_app",
    destination: row.destination,
    cadence: row.cadence === "weekly" ? "weekly" : "daily",
    headline: row.headline,
    summary: row.summary,
    status: row.status === "preview" || row.status === "failed" ? row.status : "sent",
    ...(row.error ? { error: row.error } : {}),
    itemCount: row.itemCount,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
  };
}

function isChannel(value: string): value is NotificationPreferenceRecord["channel"] {
  return ["in_app", "email", "slack", "webhook"].includes(value);
}

function scheduleNextRun(baseIso: string, cadence: NotificationCadence): string {
  const next = new Date(baseIso);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);

  if (cadence === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.toISOString();
}
