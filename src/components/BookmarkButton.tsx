"use client";

import { useEffect, useState } from "react";
import { isWatchlisted, loadWatchlist, toggleWatchlistItem, WATCHLIST_UPDATED_EVENT } from "@/lib/watchlist";

interface BookmarkButtonProps {
  cveId: string;
  size?: "sm" | "md";
}

export default function BookmarkButton({ cveId, size = "md" }: BookmarkButtonProps) {
  const [watchlisted, setWatchlisted] = useState(false);

  useEffect(() => {
    const sync = async () => {
      await loadWatchlist();
      setWatchlisted(isWatchlisted(cveId));
    };
    void sync();
    window.addEventListener(WATCHLIST_UPDATED_EVENT, sync);
    return () => window.removeEventListener(WATCHLIST_UPDATED_EVENT, sync);
  }, [cveId]);

  const sizeClasses = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  return (
    <button
      type="button"
      aria-label={watchlisted ? "Remove from watchlist" : "Add to watchlist"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggleWatchlistItem(cveId).then((next) => setWatchlisted(next.includes(cveId)));
      }}
      className={`inline-flex items-center justify-center rounded-lg border transition-all duration-200 ${sizeClasses} ${
        watchlisted
          ? "border-amber-400/30 bg-amber-500/10 text-amber-300 shadow-[0_0_10px_-3px_rgba(245,158,11,0.2)]"
          : "border-white/[0.06] bg-white/[0.02] text-white/25 hover:border-white/[0.12] hover:text-white/50"
      }`}
    >
      <svg className="h-3.5 w-3.5" fill={watchlisted ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75H7.5a2.25 2.25 0 00-2.25 2.25v14.489c0 .94 1.073 1.47 1.816.897L12 17.25l4.934 4.136a1.125 1.125 0 001.816-.897V6a2.25 2.25 0 00-2.25-2.25z" />
      </svg>
    </button>
  );
}
