"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import type { ExposureQueue, ExposureQueueRow, FindingTriageStatus } from "@/lib/exposure";
import { formatDate, getSeverityFromScore } from "@/lib/utils";
import SeverityBadge from "@/components/SeverityBadge";
import VulnerabilityFixModal from "@/components/VulnerabilityFixModal";
import AIRemediationPlanPanel from "@/components/AIRemediationPlanPanel";
import { INVENTORY_UPDATED_EVENT } from "@/lib/inventory";
import type { RepoScanRecord, VulnerabilityMatch } from "@/lib/github-types";
import { canOpenFixPR, findRepoRowMatch } from "@/lib/repo-scan-diff";

const PRIORITY_CLASSES = { P1: "text-red-300", P2: "text-amber-300", P3: "text-white/50" } as const;

const FINDING_STATUS_LABELS: Record<FindingTriageStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  fixed: "Fixed",
  accepted_risk: "Accepted risk",
  false_positive: "False positive",
};

export default function ExposureQueuePageClient() {
  const [queue, setQueue] = useState<(ExposureQueue & { githubConfigured: boolean }) | null>(null);
  const [fixing, setFixing] = useState<{ match: VulnerabilityMatch; repoFullName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [remediationKey, setRemediationKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function sync() {
      try {
        const res = await fetch(`/api/exposure${showHidden ? "?showHidden=1" : ""}`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to load exposure queue");
        if (!cancelled) setQueue(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load exposure queue");
      }
    }
    void sync();
    window.addEventListener(INVENTORY_UPDATED_EVENT, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(INVENTORY_UPDATED_EVENT, sync);
    };
  }, [showHidden, reloadToken]);

  async function setStatus(row: ExposureQueueRow, status: FindingTriageStatus) {
    const body: Record<string, unknown> = { key: row.key, status };
    if (status === "accepted_risk") {
      // shortcut: native prompts instead of an inline form; swap for a dialog if acceptance grows more fields.
      const reason = window.prompt(`Why is ${row.vulnerabilityId} on ${row.assetLabel} an accepted risk?`)?.trim();
      if (!reason) return;
      const acceptedUntil = window.prompt("Accepted until (YYYY-MM-DD)?")?.trim();
      if (!acceptedUntil) return;
      Object.assign(body, { reason, acceptedUntil, kev: Boolean(row.cve.kev), severity: getSeverityFromScore(row.cve.cvss3 ?? row.cve.cvss) });
    }
    try {
      const res = await fetch("/api/exposure/triage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const saved = await res.json().catch(() => null);
      if (!res.ok) throw new Error(saved?.error || "Failed to save triage status");
      setError(null);
      setReloadToken((token) => token + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save triage status");
    }
  }

  async function openFix(row: ExposureQueueRow) {
    const repoFullName = row.repoFullName!;
    try {
      const res = await fetch(`/api/github/scan?fullName=${encodeURIComponent(repoFullName)}`);
      if (!res.ok) throw new Error("Failed to load the repo scan for this finding");
      const [latest] = (await res.json()) as RepoScanRecord[];
      const match = latest && findRepoRowMatch(row, latest.vulnerabilities);
      if (!match) throw new Error("This finding is no longer in the latest repo scan");
      setError(null);
      setFixing({ match, repoFullName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the repo scan for this finding");
    }
  }

  return (
    <div className="app-shell px-4 py-8 sm:px-6">
      <div className="page-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">My exposure</h1>
          <span className="hidden text-sm text-white/25 sm:inline">New CVEs hitting your inventory and monitored repos</span>
        </div>
        <div className="flex gap-2">
          <Link href="/settings" className="btn-ghost inline-flex px-3 py-1.5 text-sm">Inventory</Link>
          <Link href="/search" className="btn-ghost inline-flex px-3 py-1.5 text-sm">Search all CVEs</Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">
          <span className="font-semibold">Error:</span> {error}
        </div>
      )}

      {queue?.truncated && (
        <p className="mb-4 text-sm text-amber-300/80">
          More new CVEs arrived than one load checks; older ones were skipped this time.
        </p>
      )}

      {queue && (queue.hiddenCount > 0 || showHidden) && (
        <label className="mb-4 flex items-center gap-2 text-sm text-white/50">
          <input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />
          Show accepted-risk and false-positive findings ({queue.hiddenCount})
        </label>
      )}

      {!queue && !error && <p className="text-sm text-white/40">Matching new CVEs against your assets…</p>}

      {queue && queue.rows.length === 0 && (
        <p className="text-sm text-white/40">No new vulnerabilities match your inventory or the latest repo scans.</p>
      )}

      {queue && queue.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Vulnerabilities affecting your assets</caption>
            <thead className="text-xs uppercase tracking-wide text-white/35">
              <tr>
                <th scope="col" className="px-3 py-2">Priority</th>
                <th scope="col" className="px-3 py-2">Vulnerability</th>
                <th scope="col" className="px-3 py-2">Asset</th>
                <th scope="col" className="px-3 py-2">Severity</th>
                <th scope="col" className="px-3 py-2">KEV</th>
                <th scope="col" className="px-3 py-2">EPSS</th>
                <th scope="col" className="px-3 py-2">Criticality</th>
                <th scope="col" className="px-3 py-2">First seen</th>
                <th scope="col" className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.rows.map((row) => {
                const score = row.cve.cvss3 ?? row.cve.cvss;
                const status = row.triage?.status ?? "open";
                return (
                  <Fragment key={row.key}>
                    <tr className={`border-t border-white/[0.06] ${row.hidden ? "text-white/35" : "text-white/70"}`}>
                      <td className="px-3 py-2">
                        <div className={`font-semibold ${PRIORITY_CLASSES[row.priority]}`}>{row.priority}</div>
                        <div className="text-xs text-white/35">{row.priorityReason}</div>
                      </td>
                      <td className="px-3 py-2 font-mono">
                        <Link href={`/cve/${encodeURIComponent(row.vulnerabilityId)}`} className="text-cyan-300 hover:underline">
                          {row.vulnerabilityId}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <div>{row.assetLabel}</div>
                        <div className="text-xs text-white/35">{row.repoFullName ?? "Inventory"}</div>
                      </td>
                      <td className="px-3 py-2">
                        {score !== undefined ? <SeverityBadge severity={getSeverityFromScore(score)} score={score} size="sm" /> : <span className="text-white/30">—</span>}
                      </td>
                      <td className="px-3 py-2">{row.cve.kev ? <span className="badge badge-xs border-red-500/30 bg-red-500/10 text-red-300">KEV</span> : <span className="text-white/30">—</span>}</td>
                      <td className="px-3 py-2 font-mono">{row.cve.epss !== undefined ? `${(row.cve.epss * 100).toFixed(1)}%` : "—"}</td>
                      <td className="px-3 py-2 capitalize">{row.criticality ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.firstSeenAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Triage status for ${row.vulnerabilityId} on ${row.assetLabel}`}
                            value={status}
                            onChange={(event) => void setStatus(row, event.target.value as FindingTriageStatus)}
                            className="h-7 rounded-lg border border-white/[0.08] bg-transparent px-2 text-xs"
                          >
                            {Object.entries(FINDING_STATUS_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          {row.triage?.status === "accepted_risk" && (
                            <span className="text-[11px] text-white/35" title={row.triage.reason}>until {row.triage.acceptedUntil}</span>
                          )}
                          <button
                            type="button"
                            aria-expanded={remediationKey === row.key}
                            onClick={() => setRemediationKey((current) => (current === row.key ? null : row.key))}
                            className="btn-ghost inline-flex h-7 items-center px-2.5 text-[11px]"
                          >
                            Remediation
                          </button>
                          {queue.githubConfigured && canOpenFixPR(row) && (
                            <button
                              type="button"
                              onClick={() => void openFix(row)}
                              className="btn-ghost inline-flex h-7 items-center px-2.5 text-[11px]"
                            >
                              Open fix PR
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {remediationKey === row.key && (
                      <tr className="border-t border-white/[0.06]">
                        <td colSpan={9} className="px-3 py-3">
                          <AIRemediationPlanPanel cveId={row.vulnerabilityId} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {fixing && (
        <VulnerabilityFixModal match={fixing.match} repoFullName={fixing.repoFullName} onClose={() => setFixing(null)} />
      )}
    </div>
  );
}
