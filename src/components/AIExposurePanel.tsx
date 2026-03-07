"use client";

import { useEffect, useState } from "react";
import { AIExposureAssessment, CVEDetail } from "@/lib/types";
import { INVENTORY_UPDATED_EVENT } from "@/lib/inventory";
import { TRIAGE_UPDATED_EVENT } from "@/lib/triage";

export default function AIExposurePanel({ cveId, detail }: { cveId: string; detail?: CVEDetail | null }) {
  const [assessment, setAssessment] = useState<AIExposureAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/ai/exposure/${encodeURIComponent(cveId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ detail }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load AI exposure assessment");
        }

        if (!cancelled) {
          setAssessment(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load AI exposure assessment");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    window.addEventListener(TRIAGE_UPDATED_EVENT, load);
    window.addEventListener(INVENTORY_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(TRIAGE_UPDATED_EVENT, load);
      window.removeEventListener(INVENTORY_UPDATED_EVENT, load);
    };
  }, [cveId, detail]);

  return (
    <div className="rounded-xl border border-indigo-500/15 bg-gradient-to-br from-indigo-500/[0.06] to-transparent p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/15">
            <svg className="h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
            </svg>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-200">AI Exposure Agent</h2>
            <p className="text-[11px] text-white/25">Maps against tracked inventory to estimate internal impact.</p>
          </div>
        </div>
        {assessment ? <span className="badge badge-xs border-indigo-500/20 bg-indigo-500/8 text-indigo-200">Likely impact: {assessment.likelyImpact}</span> : null}
      </div>

      {loading ? <p className="mt-4 text-sm text-white/25">Estimating internal exposure...</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {assessment && !loading ? (
        <div className="mt-4 space-y-4 animate-fade-in">
          <p className="text-sm text-white/70">{assessment.summary}</p>

          <Section title="Rationale" items={assessment.rationale} />

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Matched Assets</h3>
            {assessment.matchedAssets.length > 0 ? (
              <div className="mt-3 space-y-3">
                {assessment.matchedAssets.map((asset) => (
                  <div key={asset.assetId} className="glass rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">{asset.assetName}</span>
                      <span className="badge badge-xs border-indigo-500/20 bg-indigo-500/8 text-indigo-200">{asset.confidence}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/50">{asset.rationale}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {asset.matchingSignals.map((signal) => (
                        <span key={signal} className="badge badge-xs border-white/[0.06] bg-white/[0.04] text-white/40">{signal}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/25">No tracked assets matched. Add inventory mappings in settings.</p>
            )}
          </section>

          <Section title="Recommended Actions" items={assessment.recommendedActions} />
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-white/50">
        {items.map((item) => (
          <li key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">{item}</li>
        ))}
      </ul>
    </section>
  );
}
