import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { parseFindingTriageInput, writeFindingTriage } from "@/lib/finding-triage-store";

export const PUT = withRouteProtection(async function PUT(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const parsed = parseFindingTriageInput(await request.json().catch(() => null), new Date());
  if ("error" in parsed) {
    return applyWorkspaceSession(NextResponse.json({ error: parsed.error }, { status: 400 }), session);
  }
  return applyWorkspaceSession(NextResponse.json(writeFindingTriage(session.userId, parsed)), session);
}, {
  route: "/api/exposure/triage",
  errorMessage: "Failed to save finding triage",
  rateLimit: API_RATE_LIMITS.workspaceMutations,
});
