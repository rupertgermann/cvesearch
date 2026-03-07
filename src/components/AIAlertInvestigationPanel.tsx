"use client";

import { useState } from "react";
import { AIAlertInvestigation } from "@/lib/types";

export default function AIAlertInvestigationPanel({ ruleId }: { ruleId: string }) {
  const [investigation, setInvestigation] = useState<AIAlertInvestigation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ai/alerts/investigate/${encodeURIComponent(ruleId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to investigate alert rule");
      }

      setInvestigation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to investigate alert rule");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-rose-500/15 bg-gradient-to-br from-rose-500/[0.06] to-transparent p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/15">
            <svg className="h-3.5 w-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-200">AI Alert Investigation</h3>
            <p className="text-[11px] text-white/25">Explains match rationale and suggests next analyst action.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleLoad()}
          disabled={loading}
          className="rounded-lg bg-gradient-to-r from-rose-400 to-rose-500 px-3 py-2 text-sm font-semibold text-black shadow-[0_2px_12px_-2px_rgba(244,63,94,0.3)] transition-all hover:shadow-[0_4px_20px_-2px_rgba(244,63,94,0.4)] hover:-translate-y-px disabled:opacity-50"
        >
          {loading ? "Investigating..." : investigation ? "Refresh Investigation" : "Investigate Rule"}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {investigation ? (
        <div className="mt-4 space-y-4 animate-fade-in">
          <p className="text-sm text-white/70">{investigation.summary}</p>

          <Section title="Why It Matched" items={investigation.whyMatched} />

          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Top Matches</h4>
            <div className="mt-3 space-y-2">
              {investigation.topMatches.map((match) => (
                <div key={match.id} className="glass rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">{match.id}</span>
                    {match.unread ? <span className="badge badge-xs border-red-500/20 bg-red-500/8 text-red-300">Unread</span> : null}
                  </div>
                  <p className="mt-2 text-sm text-white/50">{match.summary}</p>
                  <p className="mt-1 text-xs text-white/25">{match.rationale}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="glass rounded-lg p-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Recommended Action</h4>
            <p className="mt-2 text-sm text-white/70">{investigation.recommendedAction}</p>
          </div>

          <Section title="Next Steps" items={investigation.nextSteps} />
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm text-white/50">
        {items.map((item) => (
          <li key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
