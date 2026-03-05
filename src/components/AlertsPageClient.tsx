"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getLatestCVEs } from "@/lib/api";
import {
  AlertRule,
  ALERT_RULES_UPDATED_EVENT,
  deleteAlertRule,
  markAllAlertRulesChecked,
  markAlertRuleChecked,
  readAlertRules,
} from "@/lib/alerts";
import { applySearchResultPreferences, matchesSearchState } from "@/lib/search";
import { CVESummary } from "@/lib/types";
import CVEList from "@/components/CVEList";

const ALERT_SAMPLE_SIZE = 80;

export default function AlertsPageClient() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [sample, setSample] = useState<CVESummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const syncRules = () => setRules(readAlertRules());
    syncRules();
    window.addEventListener(ALERT_RULES_UPDATED_EVENT, syncRules);

    let cancelled = false;

    async function loadSample() {
      setLoading(true);
      try {
        const latest = await getLatestCVEs(1, ALERT_SAMPLE_SIZE);
        if (!cancelled) {
          setSample(latest);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSample();

    return () => {
      cancelled = true;
      window.removeEventListener(ALERT_RULES_UPDATED_EVENT, syncRules);
    };
  }, []);

  const evaluations = useMemo(
    () =>
      rules.map((rule) => {
        const matching = applySearchResultPreferences(
          sample.filter((cve) => matchesSearchState(cve, rule.search)),
          rule.search
        );
        const unread = matching.filter((cve) => isUnreadMatch(cve, rule.lastCheckedAt)).length;
        return {
          rule,
          matching,
          unread,
        };
      }),
    [rules, sample]
  );

  const totalUnread = evaluations.reduce((sum, item) => sum + item.unread, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Alerts</h1>
          <p className="mt-2 text-base text-gray-500">
            Browser-local alert rules evaluated against the latest upstream sample.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRules(markAllAlertRulesChecked())}
            className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white"
          >
            Mark All Checked
          </button>
          <Link
            href="/"
            className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white"
          >
            Back to Search
          </Link>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Metric label="Alert rules" value={rules.length} />
        <Metric label="Unread matches" value={totalUnread} />
        <Metric label="Sampled CVEs" value={sample.length} />
      </div>

      {rules.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-6 py-10 text-center">
          <p className="text-lg font-medium text-white">No alert rules yet</p>
          <p className="mt-2 text-sm text-gray-500">Save an alert from the homepage to start tracking new matches.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {evaluations.map(({ rule, matching, unread }) => (
            <section key={rule.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">{rule.name}</h2>
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300">
                      {matching.length} matches
                    </span>
                    {unread > 0 && (
                      <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs text-red-300">
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
                  <p className="mt-2 text-xs text-gray-500">
                    Last checked {rule.lastCheckedAt ? new Date(rule.lastCheckedAt).toLocaleString("en-US") : "never"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRules(markAlertRuleChecked(rule.id))}
                    className="rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white"
                  >
                    Mark Checked
                  </button>
                  <button
                    type="button"
                    onClick={() => setRules(deleteAlertRule(rule.id))}
                    className="rounded-lg border border-red-500/20 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
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
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-gray-400">{label}</div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-gray-400">{label}</span>;
}

function isUnreadMatch(cve: CVESummary, lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) return true;

  const modified = cve.modified ?? cve.published;
  if (!modified) return false;

  const modifiedTs = Date.parse(modified);
  const checkedTs = Date.parse(lastCheckedAt);

  if (Number.isNaN(modifiedTs) || Number.isNaN(checkedTs)) {
    return true;
  }

  return modifiedTs > checkedTs;
}
