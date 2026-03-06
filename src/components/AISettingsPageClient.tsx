import Link from "next/link";
import { ServerAIConfigurationSummary } from "@/lib/ai-service";
import { AIRunRecord } from "@/lib/types";

export default function AISettingsPageClient({ summary, recentRuns }: { summary: ServerAIConfigurationSummary; recentRuns: AIRunRecord[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">AI Settings</h1>
          <p className="mt-2 text-base text-gray-500">AI features now use server-side configuration so provider credentials never need to live in the browser.</p>
        </div>
        <Link href="/" className="inline-flex rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white">
          Back to Search
        </Link>
      </div>

      <div className="space-y-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-500">Provider</span>
            <p className="text-sm text-white">{summary.provider}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-500">Mode</span>
            <p className="text-sm text-white">{summary.mode === "configured" ? "Configured provider" : "Heuristic fallback"}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 sm:col-span-2">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-500">Model</span>
            <p className="text-sm text-white">{summary.model || "Not required in heuristic mode"}</p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Configure AI providers with environment variables such as `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_MODEL`. No provider API key is persisted in browser storage.
        </div>

        <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">
          {summary.configured
            ? `Server-side AI is active using ${summary.provider}${summary.model ? ` (${summary.model})` : ""}.`
            : "No server-side AI provider key is configured, so the app is using deterministic heuristic fallbacks."}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-500">
            {summary.availableProviders.length > 0
              ? `Available providers: ${summary.availableProviders.join(", ")}`
              : "No model provider credentials detected on the server."}
          </span>
        </div>

        <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Recent AI Runs</h2>
              <p className="mt-1 text-sm text-gray-500">Read-only history of recent prompts, outcomes, tool traces, and failures.</p>
            </div>
          </div>

          {recentRuns.length > 0 ? (
            <div className="space-y-3">
              {recentRuns.map((run) => (
                <div key={run.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300">{run.feature}</span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-gray-300">{run.status}</span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-gray-400">{run.provider}{run.model ? ` • ${run.model}` : ""}</span>
                    <span className="text-xs text-gray-500">{new Date(run.createdAt).toLocaleString("en-US")}</span>
                    <span className="text-xs text-gray-500">{run.durationMs}ms</span>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Prompt</h3>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-gray-300">{run.prompt}</pre>
                    </div>

                    <div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Output</h3>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-gray-300">{run.output}</pre>
                    </div>

                    {run.toolCalls.length > 0 ? (
                      <div>
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Tool Calls</h3>
                        <ul className="mt-2 space-y-2 text-xs text-gray-300">
                          {run.toolCalls.map((call) => (
                            <li key={`${run.id}-${call.tool}`} className="rounded-lg bg-white/[0.03] px-3 py-2">
                              <span className="font-medium text-white">{call.tool}</span>
                              <span className="text-gray-400"> — {call.summary}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {run.error ? (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        {run.error}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No AI runs have been recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
