"use client";

import { useMemo, useState } from "react";
import { SearchState } from "@/lib/search";
import { AISearchInterpretation } from "@/lib/types";
import LoadingIndicator from "./LoadingIndicator";

interface AISearchAssistantPanelProps {
  onApply: (next: Partial<SearchState>) => void;
}

export default function AISearchAssistantPanel({ onApply }: AISearchAssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AISearchInterpretation | null>(null);
  const resultSummary = useMemo(() => {
    if (!result) return null;
    return {
      filterCount: result.appliedFilters.length,
      assumptionCount: result.assumptions.length,
      traceCount: result.toolCalls.length,
    };
  }, [result]);

  async function handleInterpret(nextPrompt = prompt) {
    if (!nextPrompt.trim()) return;

    setLoading(true);
    setMessage("");
    setResult(null);
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to interpret search");
      }

      onApply(data);
      setPrompt(nextPrompt);
      setMessage(data.explanation || "Applied AI-generated filters.");
      setResult(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to interpret search");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="glass-raised rounded-2xl border border-cyan-500/15 p-5 sm:p-6">
      <div className="flex flex-col gap-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                AI Search Assistant
              </div>
              <h2 className="mt-3 text-lg font-semibold text-white">Describe the search you want in plain language.</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/40">
                Ask for products, CWE families, exploit context, time windows, or remediation intent and the assistant will turn that into structured filters.
              </p>
            </div>
          </div>

          <div className={`rounded-2xl border bg-black/10 p-3 sm:p-4 transition-colors duration-300 ${loading ? "border-cyan-500/25" : "border-white/[0.08]"}`}>
            <label htmlFor="ai-search-prompt" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">
              Prompt
            </label>
            <textarea
              id="ai-search-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              disabled={loading}
              placeholder="What should we patch first for Microsoft Exchange since 2026-01-15?"
              className="input-base min-h-[116px] w-full resize-y px-3 py-3 text-sm leading-relaxed disabled:opacity-50"
            />

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void handleInterpret()}
                disabled={loading || !prompt.trim()}
                className="btn-primary min-w-44 px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Interpreting&hellip;
                  </span>
                ) : (
                  "Apply AI Search"
                )}
              </button>
            </div>

            {loading && (
              <LoadingIndicator
                title="Analyzing your prompt"
                subtitle="The AI is interpreting your query and building structured filters."
              />
            )}

            {message && !loading && (
              <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/45">
                {message}
              </div>
            )}
          </div>
        </div>

      </div>

      {result && resultSummary && (
        <div className="mt-5 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.05] p-4 sm:p-5 animate-fade-in">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200">Last AI Search</div>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{result.explanation}</p>
              {result.needsClarification && result.clarificationQuestion ? (
                <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  {result.clarificationQuestion}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[280px]">
              <ResultStat label="Filters" value={String(resultSummary.filterCount)} />
              <ResultStat label="Assumptions" value={String(resultSummary.assumptionCount)} />
              <ResultStat label="Trace" value={String(resultSummary.traceCount)} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {result.appliedFilters.length > 0 ? (
              result.appliedFilters.map((filter) => (
                <span key={`${filter.field}-${filter.value}`} className="badge badge-xs border-cyan-500/25 bg-cyan-500/10 text-cyan-100">
                  {filter.field}: {filter.value}
                </span>
              ))
            ) : (
              <span className="text-sm text-white/40">No additional filters were applied.</span>
            )}
          </div>

          {(result.assumptions.length > 0 || result.toolCalls.length > 0) && (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {result.assumptions.length > 0 ? (
                <DisclosurePanel title="Assumptions" defaultOpen>
                  <ul className="space-y-2 text-sm text-white/55">
                    {result.assumptions.map((assumption) => (
                      <li key={assumption} className="rounded-lg bg-white/[0.04] px-3 py-2">
                        {assumption}
                      </li>
                    ))}
                  </ul>
                </DisclosurePanel>
              ) : null}

              {result.toolCalls.length > 0 ? (
                <DisclosurePanel title="Agent Trace">
                  <ul className="space-y-2 text-sm text-white/55">
                    {result.toolCalls.map((call) => (
                      <li key={`${call.tool}-${call.summary}`} className="rounded-lg bg-white/[0.04] px-3 py-2">
                        <span className="font-medium text-white">{call.tool}</span>
                        <span className="text-white/40"> - {call.summary}</span>
                      </li>
                    ))}
                  </ul>
                </DisclosurePanel>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-3 text-center">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</div>
    </div>
  );
}

function DisclosurePanel({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 group"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-white">
        <span>{title}</span>
        <svg
          className="h-4 w-4 text-white/35 transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
