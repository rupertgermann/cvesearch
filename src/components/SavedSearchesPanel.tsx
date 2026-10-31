"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ALERT_RULES_UPDATED_EVENT,
  type AlertEvaluationsPayload,
  deleteAlertRule,
  loadAlertEvaluations,
  markAllAlertRulesChecked,
  markAlertRuleChecked,
  saveAlertRule,
} from "@/lib/alerts";
import { buildSearchParams, SearchState } from "@/lib/search";
import CVEList from "@/components/CVEList";
import ConfirmationDialog from "@/components/ConfirmationDialog";
import InlineLoadingSpinner from "@/components/InlineLoadingSpinner";

// A saved search (stored as an alert rule) tracks which of its matches you have not seen yet.
export default function SavedSearchesPanel({ search }: { search: SearchState }) {
  const [snapshot, setSnapshot] = useState<AlertEvaluationsPayload>({ evaluations: [], sampledCount: 0, truncated: false });
  const { evaluations, sampledCount, truncated } = snapshot;
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const defaultName = useMemo(
    () => search.query || search.product || search.cwe || (search.minSeverity !== "ANY" ? `${search.minSeverity} CVEs` : "Latest CVEs"),
    [search]
  );

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
            message: error instanceof Error ? error.message : "Failed to load saved searches.",
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

  const pendingDeleteRule = evaluations.find((item) => item.rule.id === pendingDeleteRuleId)?.rule ?? null;

  return (
    <section id="saved-searches" className="scroll-mt-20">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Saved Searches</h2>
          <p className="mt-1 text-sm text-white/25">New matches from the latest upstream feed, per saved search.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={defaultName}
            aria-label="Saved search name"
            className="input-base min-w-56 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void saveAlertRule(name || defaultName, search)
                .then(() => setName(""))
                .catch((error: unknown) => {
                  setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to save search." });
                })
                .finally(() => setSaving(false));
            }}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? (
              <span className="flex items-center gap-2"><InlineLoadingSpinner className="h-3.5 w-3.5" /> Saving...</span>
            ) : (
              "Save Current Search"
            )}
          </button>
          <button
            type="button"
            disabled={evaluations.length === 0}
            onClick={() => {
              void markAllAlertRulesChecked()
                .then(async () => {
                  const next = await loadAlertEvaluations();
                  setSnapshot(next);
                  setFeedback({ type: "success", message: "Marked all saved searches as checked." });
                })
                .catch((error: unknown) => {
                  setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to mark searches checked." });
                });
            }}
            className="btn-ghost px-4 py-2 text-sm disabled:opacity-50"
          >
            Mark All Checked
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm animate-fade-in ${feedback.type === "error" ? "border-red-500/20 bg-red-500/8 text-red-300" : "border-emerald-500/20 bg-emerald-500/8 text-emerald-300"}`}>
          {feedback.message}
        </div>
      )}

      {truncated && (
        <p className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-300">
          More than {sampledCount} new CVEs since last check — older ones were not evaluated.
        </p>
      )}

      {evaluations.length === 0 ? (
        <div className="glass rounded-xl px-6 py-10 text-center">
          <p className="text-lg font-medium text-white">No saved searches yet</p>
          <p className="mt-2 text-sm text-white/25">Run a search, choose Open Dashboard, and save it here to track new matches.</p>
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
                  <Link href={searchHref(rule.search)} className="btn-ghost inline-flex px-3 py-2 text-sm">
                    Open Search
                  </Link>
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
                          setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to update saved search." });
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
        title="Delete saved search?"
        message={pendingDeleteRule ? `${pendingDeleteRule.name} will stop tracking new matches.` : ""}
        confirmLabel="Delete Saved Search"
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
              setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to delete saved search." });
              setPendingDeleteRuleId(null);
            });
        }}
        onClose={() => setPendingDeleteRuleId(null)}
      />
    </section>
  );
}

function searchHref(search: SearchState): string {
  const params = buildSearchParams(search);
  return params.toString() ? `/?${params.toString()}` : "/";
}

function Chip({ label }: { label: string }) {
  return <span className="badge badge-xs border-white/[0.06] bg-white/[0.04] text-white/40">{label}</span>;
}
