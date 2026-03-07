"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchState } from "@/lib/search";
import { createPromptTemplate, deletePromptTemplate, loadPromptTemplates, PROMPT_TEMPLATES_UPDATED_EVENT } from "@/lib/prompt-templates";
import { AISearchInterpretation } from "@/lib/types";
import { PromptTemplateRecord } from "@/lib/workspace-types";

interface AISearchAssistantPanelProps {
  onApply: (next: Partial<SearchState>) => void;
}

const BUILT_IN_PROMPTS = [
  {
    id: "builtin-openssl-critical",
    name: "Critical OpenSSL This Week",
    prompt: "show newly published critical CVEs affecting OpenSSL this week",
  },
  {
    id: "builtin-k8s-xss",
    name: "Kubernetes XSS With PoC",
    prompt: "show me xss vulns in k8s with proof of concept exploits from this week",
  },
  {
    id: "builtin-exchange-remediation",
    name: "Exchange Patch First",
    prompt: "what should we patch first for microsoft exchange since 2026-01-15",
  },
];

export default function AISearchAssistantPanel({ onApply }: AISearchAssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AISearchInterpretation | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateRecord[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateBusy, setTemplateBusy] = useState<null | "save" | `delete:${string}`>(null);
  const [templateMessage, setTemplateMessage] = useState("");

  useEffect(() => {
    const sync = async () => setPromptTemplates(await loadPromptTemplates());
    void sync();
    window.addEventListener(PROMPT_TEMPLATES_UPDATED_EVENT, sync);
    return () => window.removeEventListener(PROMPT_TEMPLATES_UPDATED_EVENT, sync);
  }, []);

  const defaultTemplateName = useMemo(() => {
    if (!prompt.trim()) return "Prompt template";
    return prompt.trim().slice(0, 48);
  }, [prompt]);

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

  async function handleSaveTemplate() {
    if (!prompt.trim()) {
      setTemplateMessage("Enter a prompt before saving it as a template.");
      return;
    }

    setTemplateBusy("save");
    setTemplateMessage("");
    try {
      const next = await createPromptTemplate(templateName || defaultTemplateName, prompt);
      setPromptTemplates(next);
      setTemplateName("");
      setTemplateMessage("Saved prompt template.");
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : "Failed to save prompt template");
    } finally {
      setTemplateBusy(null);
    }
  }

  async function handleDeleteTemplate(id: string) {
    setTemplateBusy(`delete:${id}`);
    setTemplateMessage("");
    try {
      const next = await deletePromptTemplate(id);
      setPromptTemplates(next);
      setTemplateMessage("Deleted prompt template.");
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : "Failed to delete prompt template");
    } finally {
      setTemplateBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">AI Search Assistant</h2>
          <p className="mt-1 text-sm text-gray-500">Use natural language for aliases, CWE families, date windows, and remediation intent like &ldquo;show me xss vulns in k8s with proof of concept exploits from this week&rdquo;.</p>
        </div>
        <div className="flex w-full flex-col gap-2 lg:w-2/3">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={2}
            placeholder="What should we patch first for Microsoft Exchange since 2026-01-15?"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
          />
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <span className="text-xs text-gray-500">{message}</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder={defaultTemplateName}
                className="min-w-52 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              />
              <button
                type="button"
                onClick={() => void handleSaveTemplate()}
                disabled={loading || templateBusy !== null}
                className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                {templateBusy === "save" ? "Saving..." : "Save Prompt"}
              </button>
              <button
                type="button"
                onClick={() => void handleInterpret()}
                disabled={loading}
                className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {loading ? "Thinking..." : "Apply AI Search"}
              </button>
            </div>
          </div>
          {templateMessage ? <span className="text-xs text-gray-500">{templateMessage}</span> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <section className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Analyst Templates</h3>
          <div className="mt-3 grid gap-3">
            {BUILT_IN_PROMPTS.map((template) => (
              <PromptCard
                key={template.id}
                name={template.name}
                prompt={template.prompt}
                actionLabel="Run"
                onAction={() => void handleInterpret(template.prompt)}
                disabled={loading}
              />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Saved Prompt Templates</h3>
          {promptTemplates.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {promptTemplates.map((template) => (
                <PromptCard
                  key={template.id}
                  name={template.name}
                  prompt={template.prompt}
                  actionLabel="Apply"
                  onAction={() => {
                    setPrompt(template.prompt);
                    void handleInterpret(template.prompt);
                  }}
                  onDelete={() => void handleDeleteTemplate(template.id)}
                  disabled={loading || templateBusy !== null}
                  deleteBusy={templateBusy === `delete:${template.id}`}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">No saved prompt templates yet. Save frequently used analyst questions here and reuse them across the workspace.</p>
          )}
        </section>
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
                  <span className="text-gray-400"> - {call.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function PromptCard({
  name,
  prompt,
  actionLabel,
  onAction,
  onDelete,
  disabled,
  deleteBusy = false,
}: {
  name: string;
  prompt: string;
  actionLabel: string;
  onAction: () => void;
  onDelete?: () => void;
  disabled: boolean;
  deleteBusy?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">{name}</div>
          <p className="mt-1 text-sm text-gray-400">{prompt}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAction}
            disabled={disabled}
            className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {actionLabel}
          </button>
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={disabled}
              className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            >
              {deleteBusy ? "Deleting..." : "Delete"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
