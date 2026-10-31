import { applySearchResultPreferences, matchesSearchState } from "./search";
import { enrichCVEs, getLatestCVESummariesServer } from "./server-api";
import { CVESummary } from "./types";
import { AlertRule } from "./workspace-types";
import {
  FeedBackfill,
  listAlertRuleMatches,
  listAlertRulesForUser,
  readFeedBackfill,
  recordAlertRuleMatches,
  writeFeedBackfill,
} from "./workspace-store";

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

export interface AlertEvaluationsSnapshot {
  evaluations: EvaluatedAlertRule[];
  sampledCount: number;
  truncated: boolean;
}

export async function loadAlertEvaluationsForUser(userId: string): Promise<AlertEvaluationsSnapshot> {
  const alertRules = await listAlertRulesForUser(userId);
  const cursors = alertRules.map((rule) => rule.cursorPublishedAt);
  const { cves: latestSample, truncated, backfill } =
    await fetchLatestCVEsUntil(cursors, readFeedBackfill(userId, "alerts"));
  const newestPublished = latestSample.reduce<string | null>(
    (newest, cve) => (cve.published && (!newest || Date.parse(cve.published) > Date.parse(newest)) ? cve.published : newest),
    null
  );

  const evaluations: EvaluatedAlertRule[] = [];
  for (const rule of alertRules) {
    // No cursor filter here: out-of-order records must still match; the (rule, cve) key dedupes repeats.
    const matches = latestSample.filter((cve) => matchesSearchState(cve, rule.search));
    recordAlertRuleMatches(rule.id, await enrichCVEs(matches), newestPublished);

    const stored = listAlertRuleMatches(rule.id);
    evaluations.push({
      rule,
      matching: applySearchResultPreferences(stored.matching, rule.search),
      unread: stored.unread,
    });
  }
  // Saved after the matches so a crash in between re-reads the gap rather than losing it.
  writeFeedBackfill(userId, "alerts", backfill);

  return { evaluations, sampledCount: latestSample.length, truncated };
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
