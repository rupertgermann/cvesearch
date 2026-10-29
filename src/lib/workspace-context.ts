import type { DigestInput } from "./ai-service";
import { applySearchResultPreferences, matchesSearchState } from "./search";
import { getLatestCVEsServer } from "./server-api";
import { TriageRecord } from "./triage-shared";
import { ProjectRecord, CVESummary } from "./types";
import { AlertRule, SavedView } from "./workspace-types";
import {
  listAlertRuleMatches,
  listAlertRulesForUser,
  listSavedViewsForUser,
  listWatchlistEntriesForUser,
  readTriageMapForUser,
  recordAlertRuleMatches,
} from "./workspace-store";
import { listProjects } from "./projects-store";

const ALERT_PAGE_SIZE = 100;
const ALERT_MAX_PAGES = 10;

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
  const { cves: latestSample, truncated: latestSampleTruncated } = await fetchLatestCVEsUntil(cursors);
  const newestPublished = latestSample.reduce<string | null>(
    (newest, cve) => (cve.published && (!newest || Date.parse(cve.published) > Date.parse(newest)) ? cve.published : newest),
    null
  );

  const alertEvaluations = alertRules.map((rule, index) => {
    const cursor = cursors[index];
    recordAlertRuleMatches(
      rule.id,
      latestSample.filter((cve) => !isBeforeCursor(cve, cursor) && matchesSearchState(cve, rule.search)),
      newestPublished
    );

    const stored = listAlertRuleMatches(rule.id);
    return {
      rule,
      matching: applySearchResultPreferences(stored.matching, rule.search),
      unread: stored.unread,
    };
  });

  return {
    watchlist,
    savedViews,
    alertRules,
    alertEvaluations,
    triage,
    projects,
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
  };
}

// Pages upstream (newest published first) until every rule's cursor is reached; null cursor means a never-evaluated rule.
async function fetchLatestCVEsUntil(cursors: Array<string | null>): Promise<{ cves: CVESummary[]; truncated: boolean }> {
  if (cursors.length === 0) return { cves: [], truncated: false };

  const oldestCursor = cursors.includes(null)
    ? null
    : cursors.reduce((oldest, cursor) => (Date.parse(cursor!) < Date.parse(oldest!) ? cursor : oldest));
  const fetched: CVESummary[] = [];

  try {
    for (let page = 1; page <= ALERT_MAX_PAGES; page += 1) {
      const batch = await getLatestCVEsServer(page, ALERT_PAGE_SIZE);
      fetched.push(...batch);
      // Short pages are not the end: the list parser drops duplicate ids, so only an empty page is.
      if (batch.length === 0 || batch.some((cve) => isBeforeCursor(cve, oldestCursor))) {
        return { cves: fetched, truncated: false };
      }
    }
  } catch {
    // Partial pages would advance cursors past unseen records, so drop them and retry next time.
    return { cves: [], truncated: false };
  }

  return { cves: fetched, truncated: oldestCursor !== null };
}

function isBeforeCursor(cve: CVESummary, cursor: string | null): boolean {
  if (!cursor || !cve.published) return false;
  return Date.parse(cve.published) < Date.parse(cursor);
}
