import { applySearchResultPreferences, matchesSearchState } from "./search";
import { enrichCVEs, getLatestCVESummariesServer } from "./server-api";
import { TriageRecord } from "./triage-shared";
import { AIDigest, ProjectRecord, CVESummary } from "./types";
import { AlertRule, SavedView } from "./workspace-types";
import {
  FeedBackfill,
  listAlertRuleMatches,
  listAlertRulesForUser,
  listSavedViewsForUser,
  listWatchlistEntriesForUser,
  readFeedBackfill,
  readTriageMapForUser,
  recordAlertRuleMatches,
  writeFeedBackfill,
} from "./workspace-store";
import { listProjects } from "./projects-store";
import { listUndigestedRepoNotifications, RepoFindingsNotification } from "./repo-scans-store";

export interface DigestInput {
  watchlist: Array<{ id: string; summary?: string; severity?: string }>;
  alerts: Array<{ name: string; unread: number; topMatches: string[] }>;
  projects: Pick<ProjectRecord, "name" | "items" | "updatedAt">[];
  // New findings from repo rescans since the last digest.
  repoFindings?: Array<{ repo: string; findings: string[] }>;
}

const ALERT_PAGE_SIZE = 100;
// ~4 days of feed (~1,100 records/day) for rules that already have a cursor.
const ALERT_MAX_PAGES = 40;
// A new rule only needs a baseline, not the whole backlog.
const ALERT_BASELINE_PAGES = 10;
// The feed is only roughly ordered by published date, so keep paging a little past the cursor.
const ALERT_CURSOR_LOOKBACK_MS = 3 * 60 * 60 * 1000;

export interface EvaluatedAlertRule {
  rule: AlertRule;
  matching: CVESummary[];
  unread: number;
}

export interface WorkspaceContextSnapshot {
  watchlist: Array<{ cveId: string; addedAt: string }>;
  savedViews: SavedView[];
  alertRules: AlertRule[];
  alertEvaluations: EvaluatedAlertRule[];
  triage: Record<string, TriageRecord>;
  projects: ProjectRecord[];
  repoNotifications: RepoFindingsNotification[];
  latestSample: CVESummary[];
  // The page cap stopped before reaching every rule's cursor, so older new CVEs were not evaluated.
  latestSampleTruncated: boolean;
}

export interface AlertEvaluationsSnapshot {
  evaluations: EvaluatedAlertRule[];
  sampledCount: number;
  truncated: boolean;
}

export async function loadWorkspaceContextSnapshot(userId: string): Promise<WorkspaceContextSnapshot> {
  const [watchlist, savedViews, alertRules, triage, projects] = await Promise.all([
    listWatchlistEntriesForUser(userId),
    listSavedViewsForUser(userId),
    listAlertRulesForUser(userId),
    readTriageMapForUser(userId),
    listProjects(userId),
  ]);

  const cursors = alertRules.map((rule) => rule.cursorPublishedAt);
  const { cves: latestSample, truncated: latestSampleTruncated, backfill } =
    await fetchLatestCVEsUntil(cursors, readFeedBackfill(userId, "alerts"));
  const newestPublished = latestSample.reduce<string | null>(
    (newest, cve) => (cve.published && (!newest || Date.parse(cve.published) > Date.parse(newest)) ? cve.published : newest),
    null
  );

  const alertEvaluations: EvaluatedAlertRule[] = [];
  for (const rule of alertRules) {
    // No cursor filter here: out-of-order records must still match; the (rule, cve) key dedupes repeats.
    const matches = latestSample.filter((cve) => matchesSearchState(cve, rule.search));
    recordAlertRuleMatches(rule.id, await enrichCVEs(matches), newestPublished);

    const stored = listAlertRuleMatches(rule.id);
    alertEvaluations.push({
      rule,
      matching: applySearchResultPreferences(stored.matching, rule.search),
      unread: stored.unread,
    });
  }
  // Saved after the matches so a crash in between re-reads the gap rather than losing it.
  writeFeedBackfill(userId, "alerts", backfill);

  return {
    watchlist,
    savedViews,
    alertRules,
    alertEvaluations,
    triage,
    projects,
    repoNotifications: listUndigestedRepoNotifications(userId),
    latestSample,
    latestSampleTruncated,
  };
}

export async function loadAlertEvaluationsForUser(userId: string): Promise<AlertEvaluationsSnapshot> {
  const snapshot = await loadWorkspaceContextSnapshot(userId);
  return {
    evaluations: snapshot.alertEvaluations,
    sampledCount: snapshot.latestSample.length,
    truncated: snapshot.latestSampleTruncated,
  };
}

export function buildDigestInputFromWorkspaceSnapshot(snapshot: WorkspaceContextSnapshot): DigestInput {
  return {
    watchlist: snapshot.watchlist.map((item) => ({ id: item.cveId })),
    alerts: snapshot.alertEvaluations.map((item) => ({
      name: item.rule.name,
      unread: item.unread,
      topMatches: item.matching.slice(0, 3).map((match) => match.id),
    })),
    projects: snapshot.projects.map((project) => ({
      name: project.name,
      items: project.items,
      updatedAt: project.updatedAt,
    })),
    repoFindings: snapshot.repoNotifications.map((item) => ({ repo: item.repoFullName, findings: item.findings })),
  };
}

// Pages upstream (newest published first) until every cursor is reached; null cursor means a never-evaluated source.
// When the page cap cuts a run short, the unread gap is returned as `backfill` and the next run pages it after the
// new records. Records only ever push older ones to later pages, so resuming at `page` overlaps but never skips.
export async function fetchLatestCVEsUntil(
  cursors: Array<string | null>,
  backfill: FeedBackfill | null = null
): Promise<{ cves: CVESummary[]; truncated: boolean; backfill: FeedBackfill | null }> {
  if (cursors.length === 0) return { cves: [], truncated: false, backfill };

  const oldestCursor = cursors.includes(null)
    ? null
    : cursors.reduce((oldest, cursor) => (Date.parse(cursor!) < Date.parse(oldest!) ? cursor : oldest));
  let budget = oldestCursor === null ? ALERT_BASELINE_PAGES : ALERT_MAX_PAGES;
  const fetched: CVESummary[] = [];

  // Returns null once a page is empty or entirely older than floor - lookback, else the next unread page.
  const pageDown = async (page: number, floor: string | null): Promise<number | null> => {
    const stopBefore = floor === null ? null : new Date(Date.parse(floor) - ALERT_CURSOR_LOOKBACK_MS).toISOString();
    for (; budget > 0; page += 1, budget -= 1) {
      const batch = await getLatestCVESummariesServer(page, ALERT_PAGE_SIZE);
      fetched.push(...batch);
      // Short pages are not the end: the list parser drops duplicate ids, so only an empty page is.
      if (batch.length === 0 || batch.every((cve) => isBeforeCursor(cve, stopBefore))) return null;
    }
    return page;
  };

  try {
    const stoppedAt = await pageDown(1, oldestCursor);
    // A baseline is never truncated; an older gap waits for a run without new sources.
    if (oldestCursor === null) return { cves: fetched, truncated: false, backfill };

    let next: FeedBackfill | null = null;
    if (stoppedAt !== null) {
      next = { page: stoppedAt, floor: backfill?.floor ?? oldestCursor };
    } else if (backfill) {
      const resumedTo = await pageDown(backfill.page, backfill.floor);
      next = resumedTo === null ? null : { page: resumedTo, floor: backfill.floor };
    }
    return { cves: fetched, truncated: next !== null, backfill: next };
  } catch {
    // Partial pages would advance cursors past unseen records, so drop them and retry next time.
    return { cves: [], truncated: false, backfill };
  }
}

function isBeforeCursor(cve: CVESummary, cursor: string | null): boolean {
  if (!cursor || !cve.published) return false;
  return Date.parse(cve.published) < Date.parse(cursor);
}

// Rule-based on purpose: digests make no model call (docs/adr/0001-shrink-ai-features.md).
export function buildDigest(input: DigestInput): AIDigest {
  const highestAlert = [...input.alerts].sort((a, b) => b.unread - a.unread)[0];
  const activeProjects = input.projects.filter((project) => project.items.length > 0);

  return {
    headline:
      highestAlert && highestAlert.unread > 0
        ? `${highestAlert.unread} unread matches in ${highestAlert.name}`
        : `Tracking ${input.watchlist.length} watchlist items across ${activeProjects.length} projects`,
    sections: [
      {
        title: "Watchlist",
        body: `You have ${input.watchlist.length} tracked vulnerabilities in the current profile.`,
        items: input.watchlist.slice(0, 5).map((item) => item.id),
      },
      {
        title: "Alerts",
        body:
          input.alerts.length > 0
            ? `${input.alerts.filter((item) => item.unread > 0).length} alert rules currently have unread matches.`
            : "No alert rules are configured yet.",
        items: input.alerts.slice(0, 5).map((item) => `${item.name}: ${item.unread} unread`),
      },
      {
        title: "Projects",
        body:
          activeProjects.length > 0
            ? `${activeProjects.length} projects currently contain tracked CVEs.`
            : "No projects contain tracked CVEs yet.",
        items: activeProjects.slice(0, 5).map((project) => `${project.name}: ${project.items.length} CVEs`),
      },
      ...(input.repoFindings?.length
        ? [{
          title: "Repositories",
          body: `Rescans found new vulnerabilities in ${new Set(input.repoFindings.map((entry) => entry.repo)).size} repositories.`,
          items: input.repoFindings.flatMap((entry) => entry.findings.map((finding) => `${entry.repo}: ${finding}`)).slice(0, 10),
        }]
        : []),
    ],
  };
}
