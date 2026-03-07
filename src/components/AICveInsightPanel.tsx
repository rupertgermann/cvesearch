"use client";

import { useEffect, useState } from "react";
import { AICveInsight, CVEDetail } from "@/lib/types";
import { loadTriageRecord, TRIAGE_UPDATED_EVENT } from "@/lib/triage";

export default function AICveInsightPanel({ cveId, detail }: { cveId: string; detail?: CVEDetail | null }) {
  const [insight, setInsight] = useState<AICveInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const triage = await loadTriageRecord(cveId);
        const res = await fetch(`/api/ai/cve/${encodeURIComponent(cveId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triage, detail }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load AI insight");
        }

        if (!cancelled) {
          setInsight(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load AI insight");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    window.addEventListener(TRIAGE_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(TRIAGE_UPDATED_EVENT, load);
    };
  }, [cveId, detail]);

  return (
    <div className="rounded-xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.06] to-transparent p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/15">
          <svg className="h-3.5 w-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">AI Insight</h2>
          <p className="text-[11px] text-white/25">Summary, triage guidance, remediation notes, and related-vulnerability context.</p>
        </div>
      </div>

      {loading && <p className="text-sm text-white/25">Generating insight...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {insight && !loading && (
        <div className="space-y-5 animate-fade-in">
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Summary</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{insight.summary}</p>
          </section>

          <section>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Triage Recommendation</h3>
              <span className="badge badge-xs border-red-500/20 bg-red-500/8 text-red-300">
                {insight.triage.priority}
              </span>
              <span className="badge badge-xs border-white/[0.08] bg-white/[0.04] text-white/50">
                {insight.triage.status}
              </span>
              <span className="badge badge-xs border-cyan-500/20 bg-cyan-500/8 text-cyan-300">
                confidence: {insight.triage.confidence}
              </span>
            </div>
            <p className="mt-2 text-sm text-white/50">{insight.triage.rationale}</p>
            <div className="mt-3 glass rounded-lg px-3 py-2 text-sm text-white/50">
              <span className="font-medium text-white">Owner recommendation:</span> {insight.triage.ownerRecommendation}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {insight.triage.signals.map((signal) => (
                <div key={`${signal.label}-${signal.value}`} className="glass rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{signal.label}</span>
                    <span className="badge badge-xs border-white/[0.06] bg-white/[0.04] text-white/40">{signal.level}</span>
                  </div>
                  <p className="mt-2 text-sm text-white">{signal.value}</p>
                  <p className="mt-1 text-xs text-white/30">{signal.rationale}</p>
                </div>
              ))}
            </div>
            <ul className="mt-3 space-y-2 text-sm text-white/50">
              {insight.triage.nextSteps.map((step) => (
                <li key={step} className="rounded-lg bg-white/[0.03] px-3 py-2">
                  {step}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Project Context</h3>
            <p className="mt-2 text-sm text-white/50">{insight.projectContext.summary}</p>
            {insight.projectContext.projectNames.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {insight.projectContext.projectNames.map((project) => (
                  <span key={project} className="badge badge-xs border-emerald-500/20 bg-emerald-500/8 text-emerald-300">
                    Project: {project}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Remediation Notes</h3>
            <ul className="mt-3 space-y-2 text-sm text-white/50">
              {insight.remediation.map((item) => (
                <li key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Context Cluster</h3>
            <p className="mt-2 text-sm text-white/50">{insight.cluster.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="badge badge-xs border-cyan-500/20 bg-cyan-500/8 text-cyan-300">
                Canonical: {insight.cluster.canonicalId}
              </span>
              {insight.cluster.sourceIds.map((item) => (
                <span key={item} className="badge badge-xs border-white/[0.08] bg-white/[0.04] text-white/50">
                  Source: {item}
                </span>
              ))}
              {insight.cluster.relatedIds.map((item) => (
                <span key={item} className="badge badge-xs border-amber-500/20 bg-amber-500/8 text-amber-300">
                  Related: {item}
                </span>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
