import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { loadExposureQueueForUser } from "@/lib/exposure-queue";
import { isGitHubTokenConfigured } from "@/lib/github";

export const GET = withRouteProtection(async function GET(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const queue = await loadExposureQueueForUser(session.userId, {
    includeHidden: request.nextUrl.searchParams.get("showHidden") === "1",
  });
  // Lets the queue hide the inline fix-PR action when /api/github/fix would answer 503.
  const response = NextResponse.json({ ...queue, githubConfigured: isGitHubTokenConfigured() });
  return applyWorkspaceSession(response, session);
}, {
  route: "/api/exposure",
  errorMessage: "Failed to load exposure queue",
  rateLimit: API_RATE_LIMITS.workspaceReads,
});
