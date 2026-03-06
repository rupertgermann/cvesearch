import Link from "next/link";
import { ServerAIConfigurationSummary } from "@/lib/ai-service";

export default function AISettingsPageClient({ summary }: { summary: ServerAIConfigurationSummary }) {
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
      </div>
    </div>
  );
}
