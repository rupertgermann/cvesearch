"use client";

import { useEffect, useState } from "react";
import { AIDigest } from "@/lib/types";
import { loadWatchlist } from "@/lib/watchlist";
import { loadAlertRules } from "@/lib/alerts";
import { listProjectsAPI } from "@/lib/projects-api";
import { getLatestCVEs } from "@/lib/api";
import { applySearchResultPreferences, matchesSearchState } from "@/lib/search";

export default function AIDigestPanel() {
  const [digest, setDigest] = useState<AIDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [latest, projects, watchlist, alertRules] = await Promise.all([
          getLatestCVEs(1, 80).catch(() => []),
          listProjectsAPI().catch(() => []),
          loadWatchlist().catch(() => []),
          loadAlertRules().catch(() => []),
        ]);

        const alertPayload = alertRules.map((rule) => {
          const matching = applySearchResultPreferences(
            latest.filter((cve) => matchesSearchState(cve, rule.search)),
            rule.search
          );
          return {
            name: rule.name,
            unread: matching.length,
            topMatches: matching.slice(0, 3).map((item) => item.id),
          };
        });

        const res = await fetch("/api/ai/digest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            watchlist: watchlist.map((id) => ({ id })),
            alerts: alertPayload,
            projects: projects.map((project) => ({
              name: project.name,
              items: project.items,
              updatedAt: project.updatedAt,
            })),
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "Failed to generate digest");
        }

        if (!cancelled) {
          setDigest(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to generate digest");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.06] to-transparent p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15">
          <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">AI Daily Digest</h2>
          <p className="text-[11px] text-white/25">Summarized view across your watchlist, alerts, and projects.</p>
        </div>
      </div>

      {loading && <p className="text-sm text-white/25">Compiling digest...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {digest && !loading && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm font-medium text-white">
            {digest.headline}
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {digest.sections.map((section) => (
              <div key={section.title} className="glass rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                <p className="mt-2 text-sm text-white/40">{section.body}</p>
                <ul className="mt-3 space-y-2 text-sm text-white/60">
                  {section.items.map((item) => (
                    <li key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
