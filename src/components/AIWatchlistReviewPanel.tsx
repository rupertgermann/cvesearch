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
    <div className="rounded-xl border border-amber-500/15 bg-gradient-to-br from-amber-500/[0.06] to-transparent p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15">
            <svg className="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-200">AI Watchlist Analyst</h2>
            <p className="text-[11px] text-white/25">Reviews tracked items, highlights changes, and clusters related issues.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={loading || watchlistCount === 0}
          className="rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-3 py-2 text-sm font-semibold text-black shadow-[0_2px_12px_-2px_rgba(245,158,11,0.3)] transition-all hover:shadow-[0_4px_20px_-2px_rgba(245,158,11,0.4)] hover:-translate-y-px disabled:opacity-50"
        >
          {loading ? "Reviewing..." : review ? "Refresh Review" : "Run Review"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/25">
        <span>{watchlistCount} tracked {watchlistCount === 1 ? "item" : "items"}</span>
        {lastReviewAt ? <span>Last review: {new Date(lastReviewAt).toLocaleString("en-US")}</span> : <span>No saved review yet</span>}
        {stale && review ? <span className="text-amber-300">Workspace changed since this review</span> : null}
      </div>

      {watchlistCount === 0 ? <p className="mt-4 text-sm text-white/25">Add CVEs to the watchlist to generate an analyst review.</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {review ? (
        <div className="mt-4 space-y-5 animate-fade-in">
          <section>
            <div className="glass rounded-xl px-4 py-3 text-sm font-medium text-white">{review.headline}</div>
            <p className="mt-3 text-sm text-white/50">{review.summary}</p>
          </section>

          <ReviewList title="New Matches" emptyLabel="No new watchlist additions were detected since the previous review." items={review.newMatches} />
          <ReviewList title="Changed Since Last Review" emptyLabel="No triage, project, or upstream record changes were detected." items={review.changedSinceLastReview} />

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Related Clusters</h3>
            {review.clusters.length > 0 ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {review.clusters.map((cluster) => (
                  <div key={`${cluster.label}-${cluster.cveIds.join(",")}`} className="glass rounded-xl p-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="badge badge-xs border-amber-500/20 bg-amber-500/8 text-amber-200">{cluster.label}</span>
                      {cluster.cveIds.map((cveId) => (
                        <span key={cveId} className="badge badge-xs border-white/[0.06] bg-white/[0.04] text-white/40">{cveId}</span>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-white/50">{cluster.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/25">No multi-item clusters were detected in the current watchlist.</p>
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
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm text-white/50">
          {items.map((item) => (
            <li key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-white/25">{emptyLabel}</p>
      )}
    </section>
  );
}
