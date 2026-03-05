"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SearchState } from "@/lib/search";
import {
  AlertRule,
  ALERT_RULES_UPDATED_EVENT,
  deleteAlertRule,
  readAlertRules,
  saveAlertRule,
} from "@/lib/alerts";

interface AlertRulesPanelProps {
  search: SearchState;
}

export default function AlertRulesPanel({ search }: AlertRulesPanelProps) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    const sync = () => setRules(readAlertRules());
    sync();
    window.addEventListener(ALERT_RULES_UPDATED_EVENT, sync);
    return () => window.removeEventListener(ALERT_RULES_UPDATED_EVENT, sync);
  }, []);

  const defaultName = useMemo(() => {
    if (search.query) return `${search.query} alert`;
    if (search.product) return `${search.product} alert`;
    if (search.cwe) return `${search.cwe} alert`;
    if (search.minSeverity !== "ANY") return `${search.minSeverity} alert`;
    return "Latest critical alert";
  }, [search]);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Alert Rules</h2>
          <p className="mt-1 text-sm text-gray-500">Track the current search as a local alert and review matches in the notification center.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={defaultName}
            className="min-w-56 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
          />
          <button
            type="button"
            onClick={() => {
              saveAlertRule(name || defaultName, search);
              setName("");
            }}
            className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-medium text-black"
          >
            Save Alert
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No alert rules yet.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-white/[0.06] bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{rule.name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Last checked {rule.lastCheckedAt ? new Date(rule.lastCheckedAt).toLocaleString("en-US") : "never"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRules(deleteAlertRule(rule.id))}
                  className="text-xs text-gray-500 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {rule.search.query && <Chip label={`Query: ${rule.search.query}`} />}
                {rule.search.product && <Chip label={`Product: ${rule.search.product}`} />}
                {rule.search.cwe && <Chip label={`CWE: ${rule.search.cwe}`} />}
                {rule.search.minSeverity !== "ANY" && <Chip label={`Min: ${rule.search.minSeverity}`} />}
              </div>
              <Link
                href="/alerts"
                className="mt-4 inline-flex rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Open Alerts
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-gray-400">{label}</span>;
}
