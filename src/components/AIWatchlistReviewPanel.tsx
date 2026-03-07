"use client";

import { useEffect, useState } from "react";
import { AIRunRecord, AIWatchlistReview } from "@/lib/types";
import { TRIAGE_UPDATED_EVENT } from "@/lib/triage";
import { WATCHLIST_UPDATED_EVENT } from "@/lib/watchlist";

export default function AIWatchlistReviewPanel({ watchlistCount }: { watchlistCount: number }) {
  const [review, setReview] = useState<AIWatchlistReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [lastReviewAt, setLastReviewAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLastReview() {
      try {
        const res = await fetch("/api/ai/runs?limit=50", { cache: "no-store" });
        const data = await res.json().catch(() => []);
        if (!res.ok || cancelled || !Array.isArray(data)) {
          return;
        }

        const latest = data.find((item): item is AIRunRecord => Boolean(item) && typeof item === "object" && (item as AIRunRecord).feature === "watchlist_analyst");
        if (latest?.createdAt) {
          setLastReviewAt(latest.createdAt);
        }
      } catch {
      }
    }

    void loadLastReview();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const markStale = () => setStale(true);
    window.addEventListener(WATCHLIST_UPDATED_EVENT, markStale);
    window.addEventListener(TRIAGE_UPDATED_EVENT, markStale);
    return () => {
      window.removeEventListener(WATCHLIST_UPDATED_EVENT, markStale);
      window.removeEventListener(TRIAGE_UPDATED_EVENT, markStale);
    };
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/watchlist/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to generate AI watchlist review");
      }

      setReview(data);
      setLastReviewAt(data?.reviewedAt ?? null);
      setStale(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate AI watchlist review");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-200">AI Watchlist Analyst</h2>
          <p className="mt-1 text-sm text-gray-400">Reviews tracked watchlist items, highlights changes since the last saved review, and clusters related issues for faster analyst triage.</p>
        </div>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={loading || watchlistCount === 0}
          className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {loading ? "Reviewing..." : review ? "Refresh Review" : "Run Review"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
        <span>{watchlistCount} tracked {watchlistCount === 1 ? "item" : "items"}</span>
        {lastReviewAt ? <span>Last review: {new Date(lastReviewAt).toLocaleString("en-US")}</span> : <span>No saved review yet</span>}
        {stale && review ? <span className="text-amber-300">Workspace changed since this review</span> : null}
      </div>

      {watchlistCount === 0 ? <p className="mt-4 text-sm text-gray-500">Add CVEs to the watchlist to generate an analyst review.</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {review ? (
        <div className="mt-4 space-y-5">
          <section>
            <div className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm font-medium text-white">{review.headline}</div>
            <p className="mt-3 text-sm text-gray-300">{review.summary}</p>
          </section>

          <ReviewList title="New Matches" emptyLabel="No new watchlist additions were detected since the previous review." items={review.newMatches} />
          <ReviewList title="Changed Since Last Review" emptyLabel="No triage, project, or upstream record changes were detected." items={review.changedSinceLastReview} />

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Related Clusters</h3>
            {review.clusters.length > 0 ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {review.clusters.map((cluster) => (
                  <div key={`${cluster.label}-${cluster.cveIds.join(",")}`} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">{cluster.label}</span>
                      {cluster.cveIds.map((cveId) => (
                        <span key={cveId} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-300">{cveId}</span>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-gray-300">{cluster.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No multi-item clusters were detected in the current watchlist.</p>
            )}
          </section>

          <ReviewList title="Recommended Actions" emptyLabel="No follow-up actions were generated." items={review.recommendedActions} />
        </div>
      ) : null}
    </div>
  );
}

function ReviewList({ title, items, emptyLabel }: { title: string; items: string[]; emptyLabel: string }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm text-gray-300">
          {items.map((item) => (
            <li key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-500">{emptyLabel}</p>
      )}
    </section>
  );
}
