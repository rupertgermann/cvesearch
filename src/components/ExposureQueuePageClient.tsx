"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ExposureQueue } from "@/lib/exposure";
import {
  createDefaultTriageRecord,
  getTriageStatusLabel,
  loadTriageMap,
  TRIAGE_UPDATED_EVENT,
  TriageRecord,
  TriageStatus,
  writeTriageRecord,
} from "@/lib/triage";
import { formatDate, getSeverityFromScore } from "@/lib/utils";
import SeverityBadge from "@/components/SeverityBadge";
import ProjectPickerButton from "@/components/ProjectPickerButton";
import { INVENTORY_UPDATED_EVENT } from "@/lib/inventory";

const TRIAGE_STATUSES: TriageStatus[] = ["new", "investigating", "mitigated", "accepted", "closed"];

export default function ExposureQueuePageClient() {
  const [queue, setQueue] = useState<ExposureQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [triage, setTriage] = useState<Record<string, TriageRecord>>({});

  useEffect(() => {
    let cancelled = false;
    async function sync() {
      try {
        const res = await fetch("/api/exposure", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to load exposure queue");
        if (!cancelled) setQueue(body as ExposureQueue);
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
  }, []);

  useEffect(() => {
    const sync = async () => setTriage(await loadTriageMap());
    void sync();
    window.addEventListener(TRIAGE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(TRIAGE_UPDATED_EVENT, sync);
  }, []);

  async function setStatus(cveId: string, status: TriageStatus) {
    try {
      await writeTriageRecord({ ...(triage[cveId] ?? createDefaultTriageRecord(cveId)), status, updatedAt: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save triage status");
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
                const status = triage[row.vulnerabilityId]?.status ?? "new";
                return (
                  <tr key={row.key} className="border-t border-white/[0.06] text-white/70">
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
                          aria-label={`Triage status for ${row.vulnerabilityId}`}
                          value={status}
                          onChange={(event) => void setStatus(row.vulnerabilityId, event.target.value as TriageStatus)}
                          className="h-7 rounded-lg border border-white/[0.08] bg-transparent px-2 text-xs"
                        >
                          {TRIAGE_STATUSES.map((value) => (
                            <option key={value} value={value}>{getTriageStatusLabel(value)}</option>
                          ))}
                        </select>
                        <ProjectPickerButton cveId={row.vulnerabilityId} />
                        {row.source === "repo" && (
                          <Link href="/repos" className="btn-ghost inline-flex h-7 items-center px-2.5 text-[11px]">Fix PR</Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
