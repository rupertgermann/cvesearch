"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createNotificationPreference,
  deleteNotificationPreference,
  loadNotifications,
  runNotificationDigests,
  updateNotificationPreference,
} from "@/lib/notifications";
import {
  NotificationDeliveryRecord,
  NotificationPreferenceRecord,
} from "@/lib/workspace-types";
import ConfirmationDialog from "./ConfirmationDialog";

export default function WorkspacePageClient() {
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferenceRecord[]>([]);
  const [deliveries, setDeliveries] = useState<NotificationDeliveryRecord[]>([]);
  const [newPreference, setNewPreference] = useState({
    teamName: "Security team",
    channel: "in_app" as NotificationPreferenceRecord["channel"],
    destination: "#vuln-ops",
    cadence: "daily" as NotificationPreferenceRecord["cadence"],
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pendingDeletePreference, setPendingDeletePreference] = useState<NotificationPreferenceRecord | null>(null);

  useEffect(() => {
    loadNotifications()
      .then((notifications) => {
        setNotificationPrefs(notifications.preferences);
        setDeliveries(notifications.deliveries);
      })
      .catch((error) => setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to load notifications." }));
  }, []);

  async function handleCreatePreference() {
    setBusy("create-pref");
    try {
      await createNotificationPreference(newPreference);
      const notifications = await loadNotifications();
      setNotificationPrefs(notifications.preferences);
      setDeliveries(notifications.deliveries);
      setFeedback({ type: "success", message: "Notification schedule created." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to create notification schedule." });
    } finally {
      setBusy(null);
    }
  }

  async function handleTogglePreference(preference: NotificationPreferenceRecord) {
    setBusy(`pref:${preference.id}`);
    try {
      await updateNotificationPreference(preference.id, { enabled: !preference.enabled });
      const notifications = await loadNotifications();
      setNotificationPrefs(notifications.preferences);
      setDeliveries(notifications.deliveries);
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to update schedule." });
    } finally {
      setBusy(null);
    }
  }

  async function handleDeletePreference(id: string) {
    setBusy(`delete-pref:${id}`);
    try {
      await deleteNotificationPreference(id);
      const notifications = await loadNotifications();
      setNotificationPrefs(notifications.preferences);
      setDeliveries(notifications.deliveries);
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to delete schedule." });
    } finally {
      setBusy(null);
    }
  }

  async function handleRunDigest(preferenceId?: string) {
    setBusy(`run:${preferenceId ?? "all"}`);
    try {
      const nextDeliveries = await runNotificationDigests({ preferenceId });
      const notifications = await loadNotifications();
      setNotificationPrefs(notifications.preferences);
      setDeliveries(notifications.deliveries);
      setFeedback({ type: "success", message: nextDeliveries.length > 0 ? "Digest delivered." : "No schedules were due." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to run digests." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app-shell px-4 py-8 sm:px-6">
      <div className="page-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">Notifications</h1>
          <span className="hidden text-sm text-white/25 sm:inline">Scheduled digest delivery</span>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="btn-ghost inline-flex px-4 py-2 text-sm">
            Back to Search
          </Link>
        </div>
      </div>

      {feedback && (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${feedback.type === "error" ? "border-red-500/20 bg-red-500/10 text-red-200" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"}`}>
          {feedback.message}
        </div>
      )}

      <section className="glass rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Team Notifications</h2>
            <p className="mt-1 text-sm text-white/30">Persisted schedule definitions plus delivered digest history.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleRunDigest()}
            disabled={busy !== null}
            className="rounded-lg border border-emerald-500/25 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
          >
            Run Due Digests
          </button>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2">
          <Field label="Team name">
            <input
              value={newPreference.teamName}
              onChange={(event) => setNewPreference((current) => ({ ...current, teamName: event.target.value }))}
              className="input-base w-full px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Destination">
            <input
              value={newPreference.destination}
              onChange={(event) => setNewPreference((current) => ({ ...current, destination: event.target.value }))}
              className="input-base w-full px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Channel">
            <select
              value={newPreference.channel}
              onChange={(event) => setNewPreference((current) => ({ ...current, channel: event.target.value as NotificationPreferenceRecord["channel"] }))}
              className="input-base w-full px-3 py-2 text-sm"
            >
              <option value="in_app">In-app</option>
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="webhook">Webhook</option>
            </select>
          </Field>
          <Field label="Cadence">
            <select
              value={newPreference.cadence}
              onChange={(event) => setNewPreference((current) => ({ ...current, cadence: event.target.value as NotificationPreferenceRecord["cadence"] }))}
              className="input-base w-full px-3 py-2 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>
        </div>

        <div className="mb-6 flex justify-end">
          <button
            type="button"
            onClick={() => void handleCreatePreference()}
            disabled={busy !== null}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            Create Schedule
          </button>
        </div>

        <div className="space-y-3">
          {notificationPrefs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-sm text-white/30">
              No digest schedules yet.
            </div>
          ) : (
            notificationPrefs.map((preference) => (
              <div key={preference.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">{preference.teamName}</span>
                      <span className="badge badge-xs border-white/[0.08] bg-white/[0.04] text-white/45">{preference.channel}</span>
                      <span className={`badge badge-xs ${preference.enabled ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-white/[0.08] bg-white/[0.04] text-white/45"}`}>
                        {preference.enabled ? "Enabled" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/40">{preference.destination}</p>
                    <p className="mt-2 text-xs text-white/25">
                      {preference.cadence} digest
                      {preference.nextRunAt ? ` • next run ${new Date(preference.nextRunAt).toLocaleString("en-US")}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRunDigest(preference.id)}
                      disabled={busy !== null}
                      className="rounded-lg border border-cyan-500/25 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                    >
                      Run now
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleTogglePreference(preference)}
                      disabled={busy !== null}
                      className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-white/55 hover:bg-white/[0.05] disabled:opacity-50"
                    >
                      {preference.enabled ? "Pause" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeletePreference(preference)}
                      disabled={busy !== null}
                      className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Delivery history</h3>
          <div className="mt-3 space-y-2">
            {deliveries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-sm text-white/30">
                No digests delivered yet.
              </div>
            ) : (
              deliveries.slice(0, 6).map((delivery) => (
                <div key={delivery.id} className="rounded-xl border border-white/[0.06] bg-black/10 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{delivery.headline}</p>
                      <p className="mt-1 text-sm text-white/40">{delivery.summary}</p>
                    </div>
                    <div className="text-right text-[11px] text-white/25">
                      <p>{delivery.teamName}</p>
                      <p>{new Date(delivery.createdAt).toLocaleString("en-US")}</p>
                      <p>{delivery.itemCount} items</p>
                      <p className={delivery.status === "failed" ? "text-red-400" : undefined} title={delivery.error}>
                        {delivery.status === "failed" ? `Failed: ${delivery.error ?? "unknown error"}` : delivery.status === "preview" ? "Preview" : `Sent via ${delivery.channel}`}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <ConfirmationDialog
        open={pendingDeletePreference !== null}
        title="Delete notification schedule?"
        message={
          pendingDeletePreference
            ? `${pendingDeletePreference.teamName} (${pendingDeletePreference.channel}) will stop receiving scheduled digests for ${pendingDeletePreference.destination}.`
            : ""
        }
        confirmLabel="Delete Schedule"
        busy={busy !== null}
        onConfirm={() => {
          if (!pendingDeletePreference) {
            return;
          }
          void handleDeletePreference(pendingDeletePreference.id);
          setPendingDeletePreference(null);
        }}
        onClose={() => setPendingDeletePreference(null)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/25">{label}</span>
      {children}
    </label>
  );
}
