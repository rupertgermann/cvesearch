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
    <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-200">AI Exposure Agent</h2>
          <p className="mt-1 text-sm text-gray-400">Maps this vulnerability against tracked inventory assets, product mappings, and project context to estimate likely internal impact.</p>
        </div>
        {assessment ? <Badge label={`Likely impact: ${assessment.likelyImpact}`} /> : null}
      </div>

      {loading ? <p className="mt-4 text-sm text-gray-500">Estimating internal exposure...</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {assessment && !loading ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-200">{assessment.summary}</p>

          <Section title="Rationale" items={assessment.rationale} />

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Matched Assets</h3>
            {assessment.matchedAssets.length > 0 ? (
              <div className="mt-3 space-y-3">
                {assessment.matchedAssets.map((asset) => (
                  <div key={asset.assetId} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">{asset.assetName}</span>
                      <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-100">{asset.confidence}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-300">{asset.rationale}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {asset.matchingSignals.map((signal) => (
                        <span key={signal} className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-1 text-[11px] text-gray-300">{signal}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No tracked assets matched this CVE yet. Add inventory mappings in settings to improve exposure accuracy.</p>
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
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-gray-300">
        {items.map((item) => (
          <li key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">{item}</li>
        ))}
      </ul>
    </section>
  );
}

function Badge({ label }: { label: string }) {
  return <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[11px] text-indigo-100">{label}</span>;
}
