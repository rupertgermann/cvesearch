"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  GitHubRepo,
  MonitoredRepo,
  DependencyScanResult,
  VulnerabilityMatch,
} from "@/lib/github-types";
import { getSeverityLabel } from "@/lib/osv";

type ScanState = "idle" | "scanning" | "done" | "error";

interface RepoScanState {
  state: ScanState;
  result: DependencyScanResult | null;
  error: string | null;
}

interface TokenScopeInfo {
  scopes: string[];
  hasRepoScope: boolean;
  tokenType: string;
}

export default function ReposPageClient() {
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [monitoredRepos, setMonitoredRepos] = useState<MonitoredRepo[]>([]);
  const [scanStates, setScanStates] = useState<Record<string, RepoScanState>>({});
  const [loadingGithub, setLoadingGithub] = useState(false);
  const [loadingMonitored, setLoadingMonitored] = useState(true);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenScopeInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showRepoBrowser, setShowRepoBrowser] = useState(false);

  const loadMonitoredRepos = useCallback(async () => {
    try {
      const response = await fetch("/api/github/monitored");
      if (!response.ok) throw new Error("Failed to load monitored repos");
      const repos: MonitoredRepo[] = await response.json();
      setMonitoredRepos(repos);
    } catch {
      setMonitoredRepos([]);
    } finally {
      setLoadingMonitored(false);
    }
  }, []);

  useEffect(() => {
    loadMonitoredRepos();
  }, [loadMonitoredRepos]);

  const loadGithubRepos = async () => {
    setLoadingGithub(true);
    setGithubError(null);
    try {
      const response = await fetch("/api/github/repos");
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to fetch repos from GitHub");
      }
      const data = await response.json();
      const repos: GitHubRepo[] = data.repos ?? data;
      setGithubRepos(repos);
      if (data.scopes) {
        setTokenInfo(data.scopes);
      }
      setShowRepoBrowser(true);
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoadingGithub(false);
    }
  };

  const handleAddRepo = async (repo: GitHubRepo) => {
    try {
      const response = await fetch("/api/github/monitored", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubId: repo.id,
          fullName: repo.full_name,
          htmlUrl: repo.html_url,
          isPrivate: repo.private,
          defaultBranch: repo.default_branch,
        }),
      });
      if (!response.ok) throw new Error("Failed to add repo");
      await loadMonitoredRepos();
    } catch {
      // silently fail
    }
  };

  const handleRemoveRepo = async (repoId: string) => {
    try {
      const response = await fetch(`/api/github/monitored?id=${repoId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to remove repo");
      setMonitoredRepos((current) => current.filter((repo) => repo.id !== repoId));
      setScanStates((current) => {
        const next = { ...current };
        const repo = monitoredRepos.find((r) => r.id === repoId);
        if (repo) delete next[repo.fullName];
        return next;
      });
    } catch {
      // silently fail
    }
  };

  const handleScanRepo = async (fullName: string) => {
    setScanStates((current) => ({
      ...current,
      [fullName]: { state: "scanning", result: null, error: null },
    }));

    try {
      const response = await fetch("/api/github/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Scan failed");
      }

      const result: DependencyScanResult = await response.json();
      setScanStates((current) => ({
        ...current,
        [fullName]: { state: "done", result, error: null },
      }));
      await loadMonitoredRepos();
    } catch (error) {
      setScanStates((current) => ({
        ...current,
        [fullName]: {
          state: "error",
          result: null,
          error: error instanceof Error ? error.message : "Scan failed",
        },
      }));
    }
  };

  const handleScanAll = async () => {
    const scanPromises = monitoredRepos.map((repo) => handleScanRepo(repo.fullName));
    await Promise.allSettled(scanPromises);
  };

  const monitoredFullNames = new Set(monitoredRepos.map((repo) => repo.fullName));

  const filteredGithubRepos = githubRepos.filter((repo) =>
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isAnyScanRunning = Object.values(scanStates).some((s) => s.state === "scanning");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Repos
          </h1>
          <p className="mt-2 text-base text-gray-500">
            Monitor GitHub repositories for dependency vulnerabilities.
          </p>
        </div>
        <div className="flex gap-2">
          {monitoredRepos.length > 0 && (
            <button
              type="button"
              onClick={handleScanAll}
              disabled={isAnyScanRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isAnyScanRunning ? (
                <>
                  <SpinnerIcon />
                  Scanning...
                </>
              ) : (
                <>
                  <ScanIcon />
                  Scan All
                </>
              )}
            </button>
          )}
          <Link
            href="/"
            className="inline-flex rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-gray-300 hover:bg-white/[0.06] hover:text-white"
          >
            Back to Search
          </Link>
        </div>
      </div>

      {/* Add Repos Section */}
      <section className="mb-8">
        {!showRepoBrowser ? (
          <button
            type="button"
            onClick={loadGithubRepos}
            disabled={loadingGithub}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-8 text-sm text-gray-400 transition-colors hover:border-cyan-500/30 hover:bg-white/[0.04] hover:text-white"
          >
            {loadingGithub ? (
              <>
                <SpinnerIcon />
                Loading repositories from GitHub...
              </>
            ) : (
              <>
                <GithubIcon />
                Browse GitHub Repositories
              </>
            )}
          </button>
        ) : (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                GitHub Repositories
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {githubRepos.length} found
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setShowRepoBrowser(false)}
                className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-gray-400 hover:bg-white/[0.06] hover:text-white"
              >
                Close
              </button>
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search repositories..."
              className="mb-4 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
            />

            <div className="max-h-80 space-y-1 overflow-y-auto">
              {filteredGithubRepos.map((repo) => {
                const isMonitored = monitoredFullNames.has(repo.full_name);
                return (
                  <div
                    key={repo.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">
                          {repo.full_name}
                        </span>
                        {repo.private && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                            private
                          </span>
                        )}
                        {repo.language && (
                          <span className="text-xs text-gray-500">{repo.language}</span>
                        )}
                      </div>
                      {repo.description && (
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {repo.description}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        isMonitored
                          ? handleRemoveRepo(
                              monitoredRepos.find((r) => r.fullName === repo.full_name)?.id ?? ""
                            )
                          : handleAddRepo(repo)
                      }
                      className={`ml-3 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        isMonitored
                          ? "border border-red-500/20 text-red-300 hover:bg-red-500/10"
                          : "border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
                      }`}
                    >
                      {isMonitored ? "Remove" : "Monitor"}
                    </button>
                  </div>
                );
              })}

              {filteredGithubRepos.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-500">
                  {searchQuery ? "No repositories match your search." : "No repositories found."}
                </p>
              )}
            </div>
          </div>
        )}

        {tokenInfo && !tokenInfo.hasRepoScope && (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <strong>Token lacks private repo access.</strong>{" "}
            {tokenInfo.tokenType === "classic" ? (
              <>Your classic PAT needs the <code className="rounded bg-amber-500/20 px-1">repo</code> scope (not just <code className="rounded bg-amber-500/20 px-1">public_repo</code>). Regenerate it at{" "}
                <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">github.com/settings/tokens</a>.
              </>
            ) : (
              <>Your fine-grained PAT may not have access to the desired repositories. Edit it at{" "}
                <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">github.com/settings/tokens</a> and grant &quot;Contents: Read&quot; for the repos you want to monitor.
              </>
            )}
            <span className="mt-1 block text-xs text-amber-300/60">
              Token type: {tokenInfo.tokenType} | Scopes: {tokenInfo.scopes.length > 0 ? tokenInfo.scopes.join(", ") : "none (fine-grained)"}
            </span>
          </div>
        )}

        {tokenInfo && tokenInfo.hasRepoScope && githubRepos.every((r) => !r.private) && githubRepos.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <strong>No private repos found.</strong>{" "}
            {tokenInfo.tokenType === "fine-grained" ? (
              <>Your fine-grained PAT might only have access to specific repos. Edit it at{" "}
                <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">github.com/settings/tokens</a> and grant access to additional repositories.
              </>
            ) : (
              <>Your token has the <code className="rounded bg-amber-500/20 px-1">repo</code> scope but no private repos were returned. Verify the token belongs to the correct account.
              </>
            )}
          </div>
        )}

        {githubError && (
          <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {githubError}
          </div>
        )}
      </section>

      {/* Monitored Repos */}
      {loadingMonitored ? (
        <div className="flex items-center justify-center py-12">
          <SpinnerIcon />
          <span className="ml-2 text-sm text-gray-500">Loading monitored repos...</span>
        </div>
      ) : monitoredRepos.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-6 py-10 text-center text-gray-500">
          No repositories monitored yet. Click &quot;Browse GitHub Repositories&quot; to add repos.
        </div>
      ) : (
        <div className="space-y-4">
          {monitoredRepos.map((repo) => {
            const scan = scanStates[repo.fullName];
            return (
              <MonitoredRepoCard
                key={repo.id}
                repo={repo}
                scanState={scan ?? null}
                onScan={() => handleScanRepo(repo.fullName)}
                onRemove={() => handleRemoveRepo(repo.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface MonitoredRepoCardProps {
  repo: MonitoredRepo;
  scanState: RepoScanState | null;
  onScan: () => void;
  onRemove: () => void;
}

const MonitoredRepoCard = ({ repo, scanState, onScan, onRemove }: MonitoredRepoCardProps) => {
  const isScanning = scanState?.state === "scanning";
  const hasResults = scanState?.state === "done" && scanState.result;
  const hasError = scanState?.state === "error";

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-semibold text-white hover:text-cyan-400"
            >
              {repo.fullName}
            </a>
            {repo.isPrivate && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                private
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
            <span>Branch: {repo.defaultBranch}</span>
            {repo.lastScannedAt && (
              <span>
                Last scan: {new Date(repo.lastScannedAt).toLocaleString()}
                {repo.lastScanVulnerabilityCount !== null && (
                  <span
                    className={`ml-1 ${
                      repo.lastScanVulnerabilityCount > 0 ? "text-red-400" : "text-green-400"
                    }`}
                  >
                    ({repo.lastScanVulnerabilityCount} vulnerabilities)
                  </span>
                )}
              </span>
            )}
            {!repo.lastScannedAt && <span className="text-amber-400">Not yet scanned</span>}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onScan}
            disabled={isScanning}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/10 disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <SpinnerIcon />
                Scanning...
              </>
            ) : (
              <>
                <ScanIcon />
                Scan
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
          >
            Remove
          </button>
        </div>
      </div>

      {hasError && (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {scanState.error}
        </div>
      )}

      {hasResults && scanState.result && (
        <ScanResults result={scanState.result} />
      )}
    </section>
  );
};

interface ScanResultsProps {
  result: DependencyScanResult;
}

const ScanResults = ({ result }: ScanResultsProps) => {
  const [showAll, setShowAll] = useState(false);

  if (result.dependencyCount === 0) {
    return (
      <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-gray-500">
        No dependency files found in this repository.
      </div>
    );
  }

  const sortedVulns = [...result.vulnerabilities].sort((left, right) => {
    const leftSeverity = getSeverityLabel(left.vulnerability);
    const rightSeverity = getSeverityLabel(right.vulnerability);
    const severityOrder: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      NONE: 4,
      UNKNOWN: 5,
    };
    return (severityOrder[leftSeverity] ?? 5) - (severityOrder[rightSeverity] ?? 5);
  });

  const INITIAL_DISPLAY_COUNT = 10;
  const displayedVulns = showAll ? sortedVulns : sortedVulns.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMore = sortedVulns.length > INITIAL_DISPLAY_COUNT;

  return (
    <div className="mt-3">
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-gray-400">
          {result.dependencyCount} dependencies scanned
        </span>
        <span className="text-gray-600">|</span>
        {result.vulnerabilities.length > 0 ? (
          <span className="font-medium text-red-400">
            {result.vulnerabilities.length} vulnerabilities found
          </span>
        ) : (
          <span className="font-medium text-green-400">No vulnerabilities found</span>
        )}
      </div>

      {displayedVulns.length > 0 && (
        <div className="space-y-2">
          {displayedVulns.map((match) => (
            <VulnerabilityRow key={`${match.vulnerability.id}-${match.matchedDependency.name}`} match={match} />
          ))}

          {hasMore && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-2 w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-xs text-gray-400 hover:bg-white/[0.04] hover:text-white"
            >
              Show {sortedVulns.length - INITIAL_DISPLAY_COUNT} more vulnerabilities
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface VulnerabilityRowProps {
  match: VulnerabilityMatch;
}

const getVulnerabilityDetailUrl = (match: VulnerabilityMatch): { href: string; isExternal: boolean } => {
  const primaryCveId = match.cveIds[0];
  if (primaryCveId) {
    return { href: `/cve/${primaryCveId}`, isExternal: false };
  }
  return { href: `https://osv.dev/vulnerability/${match.vulnerability.id}`, isExternal: true };
};

const VulnerabilityRow = ({ match }: VulnerabilityRowProps) => {
  const severity = getSeverityLabel(match.vulnerability);

  const severityStyles: Record<string, string> = {
    CRITICAL: "border-red-500/20 bg-red-500/5 hover:bg-red-500/10",
    HIGH: "border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10",
    MEDIUM: "border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10",
    LOW: "border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10",
    NONE: "border-gray-500/20 bg-gray-500/5 hover:bg-gray-500/10",
    UNKNOWN: "border-gray-500/20 bg-gray-500/5 hover:bg-gray-500/10",
  };

  const severityBadgeStyles: Record<string, string> = {
    CRITICAL: "bg-red-500/15 text-red-400 border-red-500/30",
    HIGH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    MEDIUM: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    LOW: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    NONE: "bg-gray-500/15 text-gray-400 border-gray-500/30",
    UNKNOWN: "bg-gray-500/15 text-gray-500 border-gray-500/30",
  };

  const { href, isExternal } = getVulnerabilityDetailUrl(match);

  const content = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
              severityBadgeStyles[severity] ?? severityBadgeStyles.UNKNOWN
            }`}
          >
            {severity}
          </span>

          <span className="font-mono text-sm font-medium text-white">
            {match.vulnerability.id}
          </span>

          {match.cveIds.map((cveId) => (
            <span
              key={cveId}
              className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-xs text-cyan-400"
            >
              {cveId}
            </span>
          ))}
        </div>

        <p className="mt-1 text-sm text-gray-400">
          {match.vulnerability.summary || "No summary available."}
        </p>

        <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-gray-500">
          <span className="rounded bg-white/[0.05] px-1.5 py-0.5">
            {match.matchedDependency.ecosystem === "Packagist" ? "composer" : match.matchedDependency.ecosystem}:{" "}
            <span className="text-gray-300">{match.matchedDependency.name}</span>
            @{match.matchedDependency.version}
          </span>
          {match.matchedDependency.isDev && (
            <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-purple-400">
              dev dependency
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500">
        <span>{isExternal ? "OSV" : "CVE"} Details</span>
        {isExternal ? <ExternalLinkIcon /> : <ChevronRightIcon />}
      </div>
    </div>
  );

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`block cursor-pointer rounded-lg border px-4 py-3 transition-colors ${severityStyles[severity] ?? severityStyles.UNKNOWN}`}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={`block cursor-pointer rounded-lg border px-4 py-3 transition-colors ${severityStyles[severity] ?? severityStyles.UNKNOWN}`}
    >
      {content}
    </Link>
  );
};

const SpinnerIcon = () => (
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const ScanIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  </svg>
);

const GithubIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
  </svg>
);
