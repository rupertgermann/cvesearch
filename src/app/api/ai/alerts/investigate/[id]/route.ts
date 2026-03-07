import { NextRequest, NextResponse } from "next/server";
import { applySearchResultPreferences, matchesSearchState } from "@/lib/search";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { generateAlertInvestigation } from "@/lib/ai-service";
import { getLatestCVEsServer } from "@/lib/server-api";
import { getSeverityFromScore } from "@/lib/utils";
import { getAlertRuleForUser } from "@/lib/workspace-store";

const ALERT_SAMPLE_SIZE = 80;

export const POST = withRouteProtection(async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = getOrCreateWorkspaceSession(request);
  const { id } = await context.params;
  const rule = await getAlertRuleForUser(session.userId, id);

  if (!rule) {
    return applyWorkspaceSession(NextResponse.json({ error: "Alert rule not found" }, { status: 404 }), session);
  }

  const sample = await getLatestCVEsServer(1, ALERT_SAMPLE_SIZE).catch(() => []);
  const matching = applySearchResultPreferences(
    sample.filter((cve) => matchesSearchState(cve, rule.search)),
    rule.search
  );

  const investigation = await generateAlertInvestigation({
    rule: {
      id: rule.id,
      name: rule.name,
      lastCheckedAt: rule.lastCheckedAt,
      search: rule.search,
    },
    matches: matching.slice(0, 8).map((cve) => ({
      id: cve.id,
      summary: cve.summary || cve.description || "No summary available",
      severity: getSeverityFromScore(cve.cvss3 ?? cve.cvss),
      kev: Boolean(cve.kev),
      published: cve.published || "",
      modified: cve.modified || cve.published || "",
      unread: isUnreadMatch(cve.modified ?? cve.published ?? "", rule.lastCheckedAt),
    })),
  });

  return applyWorkspaceSession(NextResponse.json(investigation), session);
}, {
  route: "/api/ai/alerts/investigate/[id]",
  errorMessage: "Failed to investigate alert rule with AI",
  rateLimit: API_RATE_LIMITS.aiWrite,
});

function isUnreadMatch(modified: string, lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) {
    return true;
  }

  const modifiedTs = Date.parse(modified);
  const checkedTs = Date.parse(lastCheckedAt);
  if (Number.isNaN(modifiedTs) || Number.isNaN(checkedTs)) {
    return true;
  }

  return modifiedTs > checkedTs;
}
