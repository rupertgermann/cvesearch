"use client";

import { useEffect, useState } from "react";
import { AIRemediationPlan, CVEDetail } from "@/lib/types";
import { loadTriageRecord, TRIAGE_UPDATED_EVENT } from "@/lib/triage";

export default function AIRemediationPlanPanel({ cveId, detail }: { cveId: string; detail?: CVEDetail | null }) {
  const [plan, setPlan] = useState<AIRemediationPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const triage = await loadTriageRecord(cveId);
        const res = await fetch(`/api/ai/remediation/${encodeURIComponent(cveId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triage, detail }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load AI remediation plan");
        }

        if (!cancelled) {
          setPlan(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load AI remediation plan");
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
  }, [cveId, detail]);

  return (
    <div className="rounded-xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.06] to-transparent p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15">
            <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">AI Remediation Agent</h2>
            <p className="text-[11px] text-white/25">Rollout strategy, controls, validation, and ownership guidance.</p>
          </div>
        </div>
        {plan?.requiresHumanApproval ? (
          <span className="badge badge-xs border-amber-500/20 bg-amber-500/8 text-amber-200">
            Human approval required
          </span>
        ) : null}
      </div>

      {loading ? <p className="mt-4 text-sm text-white/25">Drafting remediation plan...</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {plan && !loading ? (
        <div className="mt-4 space-y-5 animate-fade-in">
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Summary</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{plan.summary}</p>
          </section>

          <section>
            <div className="flex flex-wrap gap-2">
              <Badge label={`Change risk: ${plan.changeRisk}`} tone="amber" />
              <Badge label={`Owner: ${plan.recommendedOwner}`} tone="emerald" />
            </div>
            <div className="mt-3 glass rounded-lg p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Strategy</p>
              <p className="mt-2 text-sm text-white/50">{plan.strategy}</p>
            </div>
            <div className="mt-3 glass rounded-lg p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Ownership</p>
              <p className="mt-2 text-sm text-white/50">{plan.ownerRationale}</p>
            </div>
          </section>

          <PlanList title="Compensating Controls" items={plan.compensatingControls} />
          <PlanList title="Validation Steps" items={plan.validationSteps} />
          <PlanList title="Rollout Notes" items={plan.rolloutNotes} />

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Project Context</h3>
            <p className="mt-2 text-sm text-white/50">{plan.projectContext.summary}</p>
            {plan.projectContext.projectNames.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {plan.projectContext.projectNames.map((project) => (
                  <Badge key={project} label={`Project: ${project}`} tone="gray" />
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{title}</h3>
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

function Badge({ label, tone }: { label: string; tone: "amber" | "emerald" | "gray" }) {
  const tones = {
    amber: "border-amber-500/20 bg-amber-500/8 text-amber-200",
    emerald: "border-emerald-500/20 bg-emerald-500/8 text-emerald-200",
    gray: "border-white/[0.08] bg-white/[0.04] text-white/50",
  } as const;

  return <span className={`badge badge-xs ${tones[tone]}`}>{label}</span>;
}
