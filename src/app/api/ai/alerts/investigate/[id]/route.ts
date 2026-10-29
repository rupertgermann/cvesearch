import { NextRequest, NextResponse } from "next/server";
import { applySearchResultPreferences } from "@/lib/search";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { generateAlertInvestigation } from "@/lib/ai-service";
import { getSeverityFromScore } from "@/lib/utils";
import { getAlertRuleForUser, listAlertRuleMatches } from "@/lib/workspace-store";
import { getAICacheEntry, setAICacheEntry } from "@/lib/ai-cache-store";

export const POST = withRouteProtection(async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = getOrCreateWorkspaceSession(request);
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const regenerate = body?.regenerate === true;

  if (!regenerate) {
    const cached = getAICacheEntry(session.userId, "alert_investigation", id);
    if (cached) {
      const data = JSON.parse(cached.outputJson);
      return applyWorkspaceSession(NextResponse.json({ ...data, _cachedAt: cached.createdAt }), session);
    }
  }

  const rule = await getAlertRuleForUser(session.userId, id);

  if (!rule) {
    return applyWorkspaceSession(NextResponse.json({ error: "Alert rule not found" }, { status: 404 }), session);
  }

  const matching = applySearchResultPreferences(listAlertRuleMatches(rule.id).matching, rule.search);

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
  }, { userId: session.userId });

  setAICacheEntry(session.userId, "alert_investigation", id, JSON.stringify(investigation));
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
