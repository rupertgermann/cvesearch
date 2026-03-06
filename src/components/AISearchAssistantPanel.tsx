"use client";

import { useState } from "react";
import { SearchState } from "@/lib/search";
import { AISearchInterpretation } from "@/lib/types";

interface AISearchAssistantPanelProps {
  onApply: (next: Partial<SearchState>) => void;
}

export default function AISearchAssistantPanel({ onApply }: AISearchAssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AISearchInterpretation | null>(null);

  async function handleInterpret() {
    if (!prompt.trim()) return;

    setLoading(true);
    setMessage("");
    setResult(null);
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to interpret search");
      }

      onApply(data);
      setMessage(data.explanation || "Applied AI-generated filters.");
      setResult(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to interpret search");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">AI Search Assistant</h2>
          <p className="mt-1 text-sm text-gray-500">Use natural language like “show me critical OpenSSL vulns from this month”.</p>
        </div>
        <div className="flex w-full flex-col gap-2 lg:w-2/3">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={2}
            placeholder="Show me recent critical vulnerabilities affecting OpenSSL"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500">{message}</span>
            <button
              type="button"
              onClick={handleInterpret}
              disabled={loading}
              className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Apply AI Search"}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="mt-4 space-y-4 rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-4">
          {result.needsClarification && result.clarificationQuestion ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {result.clarificationQuestion}
            </div>
          ) : null}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Applied Filters</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.appliedFilters.length > 0 ? (
                result.appliedFilters.map((filter) => (
                  <span key={`${filter.field}-${filter.value}`} className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-gray-300">
                    {filter.field}: {filter.value}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-500">No additional filters were applied.</span>
              )}
            </div>
          </div>

          {result.assumptions.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Assumptions</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                {result.assumptions.map((assumption) => (
                  <li key={assumption} className="rounded-lg bg-white/[0.03] px-3 py-2">
                    {assumption}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Agent Trace</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-300">
              {result.toolCalls.map((call) => (
                <li key={call.tool} className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="font-medium text-white">{call.tool}</span>
                  <span className="text-gray-400"> — {call.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
