"use client";

import { useEffect, useState } from "react";
import { AIDigest } from "@/lib/types";
import { readWatchlist } from "@/lib/watchlist";
import { readAlertRules } from "@/lib/alerts";
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
        const [latest, projects] = await Promise.all([
          getLatestCVEs(1, 80).catch(() => []),
          listProjectsAPI().catch(() => []),
        ]);

        const alertPayload = readAlertRules().map((rule) => {
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
            watchlist: readWatchlist().map((id) => ({ id })),
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
    <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-300">AI Daily Digest</h2>
        <p className="mt-1 text-sm text-gray-400">A summarized view across your watchlist, alerts, and projects.</p>
      </div>

      {loading && <p className="text-sm text-gray-500">Compiling digest...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {digest && !loading && (
        <div className="space-y-4">
          <div className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm font-medium text-white">
            {digest.headline}
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {digest.sections.map((section) => (
              <div key={section.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                <p className="mt-2 text-sm text-gray-400">{section.body}</p>
                <ul className="mt-3 space-y-2 text-sm text-gray-300">
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
