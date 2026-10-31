"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ALERT_RULES_UPDATED_EVENT,
  type AlertEvaluationsPayload,
  deleteAlertRule,
  loadAlertEvaluations,
  markAllAlertRulesChecked,
  markAlertRuleChecked,
} from "@/lib/alerts";
import CVEList from "@/components/CVEList";
import ConfirmationDialog from "@/components/ConfirmationDialog";

export default function AlertsPageClient() {
  const [snapshot, setSnapshot] = useState<AlertEvaluationsPayload>({ evaluations: [], sampledCount: 0, truncated: false });
  const { evaluations, sampledCount, truncated } = snapshot;
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncEvaluations() {
      setLoading(true);
      try {
        const next = await loadAlertEvaluations();
        if (!cancelled) {
          setSnapshot(next);
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            type: "error",
            message: error instanceof Error ? error.message : "Failed to load alert evaluations.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void syncEvaluations();
    window.addEventListener(ALERT_RULES_UPDATED_EVENT, syncEvaluations);

    return () => {
      cancelled = true;
      window.removeEventListener(ALERT_RULES_UPDATED_EVENT, syncEvaluations);
    };
  }, []);

  const totalUnread = evaluations.reduce((sum, item) => sum + item.unread, 0);
  const pendingDeleteRule = evaluations.find((item) => item.rule.id === pendingDeleteRuleId)?.rule ?? null;

  return (
    <div className="app-shell px-4 py-8 sm:px-6">
      <div className="page-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">Alerts</h1>
          <span className="hidden text-sm text-white/25 sm:inline">Rules evaluated against the latest upstream sample</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void markAllAlertRulesChecked()
                .then(async () => {
                  const next = await loadAlertEvaluations();
                  setSnapshot(next);
                  setFeedback({ type: "success", message: "Marked all alert rules as checked." });
                })
                .catch((error: unknown) => {
                  setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to mark alerts checked." });
                });
            }}
            className="btn-ghost px-4 py-2 text-sm"
          >
            Mark All Checked
          </button>
          <Link href="/" className="btn-ghost inline-flex px-4 py-2 text-sm">
            Back to Search
          </Link>
        </div>
      </div>

      {feedback && (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm animate-fade-in ${feedback.type === "error" ? "border-red-500/20 bg-red-500/8 text-red-300" : "border-emerald-500/20 bg-emerald-500/8 text-emerald-300"}`}>
          {feedback.message}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Metric label="Alert rules" value={evaluations.length} />
        <Metric label="Unread matches" value={totalUnread} />
        <Metric label="Sampled CVEs" value={sampledCount} />
      </div>

      {truncated && (
        <p className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-300">
          More than {sampledCount} new CVEs since last check — older ones were not evaluated.
        </p>
      )}

      {evaluations.length === 0 ? (
        <div className="glass rounded-xl px-6 py-10 text-center">
          <p className="text-lg font-medium text-white">No alert rules yet</p>
          <p className="mt-2 text-sm text-white/25">Save an alert from the homepage to start tracking new matches in this workspace.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {evaluations.map(({ rule, matching, unread }) => (
            <section key={rule.id} className="glass rounded-2xl p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">{rule.name}</h2>
                    <span className="badge badge-xs border-amber-500/20 bg-amber-500/8 text-amber-300">
                      {matching.length} matches
                    </span>
                    {unread > 0 && (
                      <span className="badge badge-xs border-red-500/20 bg-red-500/8 text-red-300">
                        {unread} unread
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {rule.search.query && <Chip label={`Query: ${rule.search.query}`} />}
                    {rule.search.vendor && <Chip label={`Vendor: ${rule.search.vendor}`} />}
                    {rule.search.product && <Chip label={`Product: ${rule.search.product}`} />}
                    {rule.search.cwe && <Chip label={`CWE: ${rule.search.cwe}`} />}
                    {rule.search.minSeverity !== "ANY" && <Chip label={`Min: ${rule.search.minSeverity}`} />}
                  </div>
                  <p className="mt-2 text-xs text-white/25">
                    Last checked {rule.lastCheckedAt ? new Date(rule.lastCheckedAt).toLocaleString("en-US") : "never"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void markAlertRuleChecked(rule.id)
                        .then(async () => {
                          const next = await loadAlertEvaluations();
                          setSnapshot(next);
                          setFeedback({ type: "success", message: `Marked ${rule.name} as checked.` });
                        })
                        .catch((error: unknown) => {
                          setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to update alert rule." });
                        });
                    }}
                    className="btn-ghost px-3 py-2 text-sm"
                  >
                    Mark Checked
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteRuleId(rule.id)}
                    className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/15"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <CVEList cves={matching.slice(0, 8)} loading={loading} />
            </section>
          ))}
        </div>
      )}

      <ConfirmationDialog
        open={pendingDeleteRuleId !== null}
        title="Delete alert rule?"
        message={pendingDeleteRule ? `${pendingDeleteRule.name} will stop tracking new matches in the alerts workspace.` : ""}
        confirmLabel="Delete Alert Rule"
        onConfirm={() => {
          if (!pendingDeleteRule) {
            return;
          }

          void deleteAlertRule(pendingDeleteRule.id)
            .then(async () => {
              const next = await loadAlertEvaluations();
              setSnapshot(next);
              setFeedback({ type: "success", message: `Deleted ${pendingDeleteRule.name}.` });
              setPendingDeleteRuleId(null);
            })
            .catch((error: unknown) => {
              setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to delete alert rule." });
              setPendingDeleteRuleId(null);
            });
        }}
        onClose={() => setPendingDeleteRuleId(null)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-xl px-4 py-4">
      <div className="font-mono text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-white/35">{label}</div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return <span className="badge badge-xs border-white/[0.06] bg-white/[0.04] text-white/40">{label}</span>;
}
