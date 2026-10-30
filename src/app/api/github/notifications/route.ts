import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { listRecentRepoNotifications } from "@/lib/repo-scans-store";

export const GET = withRouteProtection(async function GET(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  return applyWorkspaceSession(NextResponse.json(listRecentRepoNotifications(session.userId)), session);
}, {
  route: "/api/github/notifications",
  errorMessage: "Failed to load repo notifications",
  rateLimit: API_RATE_LIMITS.workspaceReads,
});
