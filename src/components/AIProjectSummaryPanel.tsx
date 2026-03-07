"use client";

import { useState } from "react";
import { AIProjectSummary } from "@/lib/types";

export default function AIProjectSummaryPanel({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState<AIProjectSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"executive" | "analyst" | "engineering">("executive");

  async function handleLoad() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ai/project/${encodeURIComponent(projectId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load AI project summary");
      }

      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI project summary");
    } finally {
      setLoading(false);
    }
  }

  const active = summary ? summary[view] : null;

  return (
    <div className="mb-4 rounded-xl border border-indigo-500/15 bg-gradient-to-br from-indigo-500/[0.06] to-transparent p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/15">
            <svg className="h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-200">AI Project Summary</h3>
            <p className="text-[11px] text-white/25">Executive, analyst, and engineering views.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleLoad()}
          disabled={loading}
          className="rounded-lg bg-gradient-to-r from-indigo-400 to-indigo-500 px-3 py-2 text-sm font-semibold text-black shadow-[0_2px_12px_-2px_rgba(99,102,241,0.3)] transition-all hover:shadow-[0_4px_20px_-2px_rgba(99,102,241,0.4)] hover:-translate-y-px disabled:opacity-50"
        >
          {loading ? "Summarizing..." : summary ? "Refresh Summary" : "Generate Summary"}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {summary ? (
        <div className="mt-4 space-y-4 animate-fade-in">
          <p className="text-sm text-white/50">{summary.overview}</p>

          <div className="flex flex-wrap gap-2">
            <Metric label="Items" value={String(summary.metrics.totalItems)} />
            <Metric label="Critical" value={String(summary.metrics.criticalCount)} />
            <Metric label="High" value={String(summary.metrics.highCount)} />
            <Metric label="KEV" value={String(summary.metrics.kevCount)} />
            <Metric label="Investigating" value={String(summary.metrics.investigatingCount)} />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["executive", "analyst", "engineering"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={`badge badge-xs uppercase ${view === option ? "border-indigo-400/30 bg-indigo-400/15 text-indigo-100" : "border-white/[0.06] bg-white/[0.04] text-white/40 hover:bg-white/[0.06]"}`}
              >
                {option}
              </button>
            ))}
          </div>

          {active ? (
            <div className="glass rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white">{active.headline}</h4>
              <p className="mt-2 text-sm text-white/50">{active.summary}</p>
              <ul className="mt-3 space-y-2 text-sm text-white/50">
                {active.bullets.map((item) => (
                  <li key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="badge badge-xs border-white/[0.06] bg-white/[0.04] text-white/50">
      {label}: {value}
    </span>
  );
}
