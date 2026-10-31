"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadWatchlist, WATCHLIST_UPDATED_EVENT } from "@/lib/watchlist";
import { ALERT_RULES_UPDATED_EVENT, ALERT_UNREAD_UPDATED_EVENT, loadAlertRules } from "@/lib/alerts";
import { loadTriageMap, TRIAGE_UPDATED_EVENT } from "@/lib/triage";
import ThemeToggle from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { href: "/search", label: "Search", icon: SearchIcon },
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/repos", label: "Repos", icon: CodeIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
] as const;

export default function Header() {
  const pathname = usePathname();
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [investigatingCount, setInvestigatingCount] = useState(0);

  useEffect(() => {
    const sync = async () => setWatchlistCount((await loadWatchlist()).length);
    void sync();
    window.addEventListener(WATCHLIST_UPDATED_EVENT, sync);
    return () => window.removeEventListener(WATCHLIST_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    const sync = async () =>
      setUnreadAlertCount((await loadAlertRules()).reduce((sum, rule) => sum + (rule.unreadCount ?? 0), 0));
    void sync();
    window.addEventListener(ALERT_RULES_UPDATED_EVENT, sync);
    window.addEventListener(ALERT_UNREAD_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener(ALERT_RULES_UPDATED_EVENT, sync);
      window.removeEventListener(ALERT_UNREAD_UPDATED_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    const sync = async () => {
      const triage = Object.values(await loadTriageMap());
      setInvestigatingCount(triage.filter((item) => item.status === "investigating").length);
    };
    void sync();
    window.addEventListener(TRIAGE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(TRIAGE_UPDATED_EVENT, sync);
  }, []);

  function getBadge(href: string) {
    if (href !== "/dashboard") return null;
    if (unreadAlertCount > 0) return { count: unreadAlertCount, label: "", description: "unread matches", color: "red" as const };
    if (investigatingCount > 0) return { count: investigatingCount, label: "active", description: "investigating", color: "amber" as const };
    if (watchlistCount > 0) return { count: watchlistCount, label: "", description: "watched", color: "cyan" as const };
    return null;
  }

  return (
    <header className="scan-line sticky top-0 z-50 border-b border-[color:var(--color-border)] bg-[color:var(--color-header-bg)] backdrop-blur-2xl">
      <div className="app-shell flex h-14 items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 opacity-40 blur-md transition-opacity group-hover:opacity-60" />
            <svg className="relative h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-tight text-[color:var(--color-foreground)]">CVE Search</span>
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.12em] text-[color:rgb(var(--color-foreground-rgb)/0.45)] sm:inline">vuln db</span>
          </div>
        </Link>

        {/* Navigation */}
        <nav aria-label="Primary" className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const badge = getBadge(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                aria-label={badge ? `${item.label}, ${badge.count} ${badge.description}` : item.label}
                className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-[color:var(--color-nav-active-bg)] text-[color:var(--color-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "text-[color:rgb(var(--color-foreground-rgb)/0.55)] hover:bg-[color:var(--color-nav-hover-bg)] hover:text-[color:rgb(var(--color-foreground-rgb)/0.82)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{item.label}</span>
                {badge && (
                  <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
                    badge.color === "red"
                      ? "bg-red-500/20 text-red-300"
                      : badge.color === "amber"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-cyan-500/20 text-cyan-300"
                  }`}>
                    {badge.count}
                  </span>
                )}
                {isActive && (
                  <span className="absolute -bottom-[9px] left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full bg-[color:var(--color-accent)] shadow-[0_0_8px_var(--color-glow)]" />
                )}
              </Link>
            );
          })}

          <span className="mx-1 h-4 w-px bg-[color:var(--color-border)]" />

          <ThemeToggle />

          <a
            href="https://vulnerability.circl.lu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[color:rgb(var(--color-foreground-rgb)/0.45)] transition-colors hover:text-[color:rgb(var(--color-foreground-rgb)/0.78)]"
          >
            API
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
          </a>
        </nav>
      </div>
    </header>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h6.75v6.75H3.75V4.5zm9.75 0h6.75v10.5H13.5V4.5zm-9.75 10.5h6.75v4.5H3.75V15zm9.75 3h6.75v1.5H13.5V18z" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
