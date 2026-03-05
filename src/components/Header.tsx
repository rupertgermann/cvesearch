"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readWatchlist, WATCHLIST_UPDATED_EVENT } from "@/lib/watchlist";
import { ALERT_RULES_UPDATED_EVENT, readAlertRules } from "@/lib/alerts";

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isWatchlist = pathname === "/watchlist";
  const isAlerts = pathname === "/alerts";
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [alertRuleCount, setAlertRuleCount] = useState(0);

  useEffect(() => {
    const sync = () => setWatchlistCount(readWatchlist().length);
    sync();
    window.addEventListener(WATCHLIST_UPDATED_EVENT, sync);
    return () => window.removeEventListener(WATCHLIST_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    const sync = () => setAlertRuleCount(readAlertRules().length);
    sync();
    window.addEventListener(ALERT_RULES_UPDATED_EVENT, sync);
    return () => window.removeEventListener(ALERT_RULES_UPDATED_EVENT, sync);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
            <svg
              className="h-5 w-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <span className="text-lg font-semibold tracking-tight text-white">
              CVE Search
            </span>
            <span className="ml-2 hidden text-xs text-gray-500 sm:inline">
              Vulnerability Database
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isHome
                ? "bg-white/[0.08] text-white"
                : "text-gray-400 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            Search
          </Link>
          <Link
            href="/watchlist"
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isWatchlist
                ? "bg-white/[0.08] text-white"
                : "text-gray-400 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            Watchlist
            {watchlistCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-300">
                {watchlistCount}
              </span>
            )}
          </Link>
          <Link
            href="/alerts"
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isAlerts
                ? "bg-white/[0.08] text-white"
                : "text-gray-400 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            Alerts
            {alertRuleCount > 0 && (
              <span className="ml-2 rounded-full bg-red-400/20 px-2 py-0.5 text-[11px] text-red-300">
                {alertRuleCount}
              </span>
            )}
          </Link>
          <a
            href="https://vulnerability.circl.lu"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            API
            <svg className="ml-1 inline h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
          </a>
        </nav>
      </div>
    </header>
  );
}
