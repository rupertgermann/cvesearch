"use client";

import { useEffect, useMemo, useState } from "react";
import { AITriageSuggestion, CVEDetail } from "@/lib/types";
import { TRIAGE_UPDATED_EVENT, TriageRecord } from "@/lib/triage";

export default function AITriageAssistantPanel({
  cveId,
  detail,
  record,
  onRequestApproval,
}: {
  cveId: string;
  detail?: CVEDetail | null;
  record: TriageRecord;
  onRequestApproval: (updater: (current: TriageRecord) => TriageRecord, label: string) => void;
}) {
  const [suggestion, setSuggestion] = useState<AITriageSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestBody = useMemo(
    () => JSON.stringify({
      triage: {
        cveId: record.cveId,
        status: record.status,
        owner: record.owner,
        notes: record.notes,
        tags: record.tags,
        updatedAt: record.updatedAt,
      },
      detail,
    }),
    [detail, record.cveId, record.notes, record.owner, record.status, record.tags, record.updatedAt]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/ai/triage/${encodeURIComponent(cveId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load AI triage guidance");
        }

        if (!cancelled) {
          setSuggestion(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load AI triage guidance");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    window.addEventListener(TRIAGE_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(TRIAGE_UPDATED_EVENT, load);
    };
  }, [cveId, requestBody]);

  return (
    <div className="mt-5 rounded-xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.06] to-transparent p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/15">
            <svg className="h-3.5 w-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">AI Triage Agent</h3>
            <p className="text-[11px] text-white/25">Read-only guidance from severity, EPSS, KEV, and project context.</p>
          </div>
        </div>
        {suggestion?.requiresHumanApproval ? (
          <span className="badge badge-xs border-amber-500/20 bg-amber-500/8 text-amber-200">
            <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
            Human approval required
          </span>
        ) : null}
      </div>

      {loading ? <p className="mt-4 text-sm text-white/25">Generating triage guidance...</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {suggestion && !loading ? (
        <div className="mt-4 space-y-4 animate-fade-in">
          <p className="text-sm leading-relaxed text-white/70">{suggestion.summary}</p>

          <div className="flex flex-wrap gap-2">
            <Chip label={`Priority: ${suggestion.recommendation.priority}`} tone="red" />
            <Chip label={`Status: ${suggestion.recommendation.status}`} tone="cyan" />
            <Chip label={`Confidence: ${suggestion.recommendation.confidence}`} tone="gray" />
            <Chip label={`Owner: ${suggestion.recommendedOwner}`} tone="emerald" />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="glass rounded-lg p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Rationale</p>
              <p className="mt-2 text-sm text-white/50">{suggestion.recommendation.rationale}</p>
            </div>
            <div className="glass rounded-lg p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Ownership</p>
              <p className="mt-2 text-sm text-white/50">{suggestion.ownershipRationale}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onRequestApproval((current) => ({ ...current, status: suggestion.recommendation.status }), "AI triage status recommendation")}
              className="btn-primary px-3 py-2 text-sm"
            >
              Review Status
            </button>
            <button
              type="button"
              onClick={() => onRequestApproval((current) => ({ ...current, owner: suggestion.recommendedOwner }), "AI triage owner recommendation")}
              className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/15"
            >
              Review Owner
            </button>
            <button
              type="button"
              onClick={() => onRequestApproval((current) => ({ ...current, tags: Array.from(new Set([...current.tags, ...suggestion.recommendedTags])) }), "AI triage tag recommendation")}
              className="btn-ghost px-3 py-2 text-sm"
            >
              Review Tags
            </button>
            <button
              type="button"
              onClick={() => onRequestApproval((current) => ({
                ...current,
                status: suggestion.recommendation.status,
                owner: suggestion.recommendedOwner,
                tags: Array.from(new Set([...current.tags, ...suggestion.recommendedTags])),
              }), "AI triage full recommendation")}
              className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-sm text-amber-200 transition-colors hover:bg-amber-500/15"
            >
              Review Full Update
            </button>
          </div>

          {suggestion.recommendedTags.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Suggested Tags</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestion.recommendedTags.map((tag) => (
                  <Chip key={tag} label={tag} tone="amber" />
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Next Steps</p>
            <ul className="mt-2 space-y-2 text-sm text-white/50">
              {suggestion.recommendation.nextSteps.map((step) => (
                <li key={step} className="rounded-lg bg-white/[0.03] px-3 py-2">{step}</li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {suggestion.recommendation.signals.map((signal) => (
              <div key={`${signal.label}-${signal.value}`} className="glass rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{signal.label}</span>
                  <span className="badge badge-xs border-white/[0.06] bg-white/[0.04] text-white/40">{signal.level}</span>
                </div>
                <p className="mt-2 text-sm text-white">{signal.value}</p>
                <p className="mt-1 text-xs text-white/35">{signal.rationale}</p>
              </div>
            ))}
          </div>

          <div className="glass rounded-lg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Project Context</p>
            <p className="mt-2 text-sm text-white/50">{suggestion.projectContext.summary}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone: "red" | "cyan" | "gray" | "emerald" | "amber" }) {
  const tones = {
    red: "border-red-500/20 bg-red-500/8 text-red-200",
    cyan: "border-cyan-500/20 bg-cyan-500/8 text-cyan-200",
    gray: "border-white/[0.06] bg-white/[0.04] text-white/40",
    emerald: "border-emerald-500/20 bg-emerald-500/8 text-emerald-200",
    amber: "border-amber-500/20 bg-amber-500/8 text-amber-200",
  } as const;

  return <span className={`badge badge-xs ${tones[tone]}`}>{label}</span>;
}
