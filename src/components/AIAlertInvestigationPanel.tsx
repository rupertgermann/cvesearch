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
    <div className="mb-4 rounded-xl border border-rose-500/15 bg-rose-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-rose-200">AI Alert Investigation</h3>
          <p className="mt-1 text-sm text-gray-400">Explains why this rule matched and suggests the next analyst action.</p>
        </div>
        <button
          type="button"
          onClick={() => void handleLoad()}
          disabled={loading}
          className="rounded-lg bg-rose-400 px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {loading ? "Investigating..." : investigation ? "Refresh Investigation" : "Investigate Rule"}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {investigation ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-200">{investigation.summary}</p>

          <Section title="Why It Matched" items={investigation.whyMatched} />

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Top Matches</h4>
            <div className="mt-3 space-y-2">
              {investigation.topMatches.map((match) => (
                <div key={match.id} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">{match.id}</span>
                    {match.unread ? <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">Unread</span> : null}
                  </div>
                  <p className="mt-2 text-sm text-gray-300">{match.summary}</p>
                  <p className="mt-1 text-xs text-gray-500">{match.rationale}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Recommended Action</h4>
            <p className="mt-2 text-sm text-gray-200">{investigation.recommendedAction}</p>
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
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm text-gray-300">
        {items.map((item) => (
          <li key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
