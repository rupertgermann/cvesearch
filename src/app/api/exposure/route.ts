import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { loadExposureQueueForUser } from "@/lib/exposure-queue";

export const GET = withRouteProtection(async function GET(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const response = NextResponse.json(await loadExposureQueueForUser(session.userId));
  return applyWorkspaceSession(response, session);
}, {
  route: "/api/exposure",
  errorMessage: "Failed to load exposure queue",
  rateLimit: API_RATE_LIMITS.workspaceReads,
});
