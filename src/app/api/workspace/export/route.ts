import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { listProjects } from "@/lib/projects-store";
import {
  listAlertRulesForUser,
  listInventoryAssetsForUser,
  listSavedViewsForUser,
  listWatchlist,
  readTriageMapForUser,
} from "@/lib/workspace-store";
import { WorkspaceExportSnapshot } from "@/lib/workspace-types";

export const GET = withRouteProtection(async function GET(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const [watchlist, savedViews, alertRules, inventoryAssets, triageMap, projects] = await Promise.all([
    listWatchlist(session.userId),
    listSavedViewsForUser(session.userId),
    listAlertRulesForUser(session.userId),
    listInventoryAssetsForUser(session.userId),
    readTriageMapForUser(session.userId),
    listProjects(),
  ]);

  const snapshot: WorkspaceExportSnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    watchlist,
    savedViews,
    alertRules,
    inventoryAssets,
    triageRecords: Object.values(triageMap),
    projects,
  };

  const response = NextResponse.json(snapshot);
  response.headers.set("Content-Disposition", `attachment; filename="cvesearch-workspace-${snapshot.exportedAt.slice(0, 10)}.json"`);
  return applyWorkspaceSession(response, session);
}, {
  route: "/api/workspace/export",
  errorMessage: "Failed to export workspace data",
  rateLimit: API_RATE_LIMITS.workspaceReads,
});
