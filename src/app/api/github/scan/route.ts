import { NextRequest, NextResponse } from "next/server";
import { isGitHubTokenConfigured } from "@/lib/github";
import { listRepoScansForRepo } from "@/lib/repo-scans-store";
import { scanRepoForUser } from "@/lib/repo-scan";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";

const isRepoFullName = (value: string): boolean => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
// History is also read for uploaded sources (see /api/sources), whose names have no "/".
const isSourceName = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}$/.test(value);

export const GET = withRouteProtection(async function GET(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const fullName = request.nextUrl.searchParams.get("fullName")?.trim() ?? "";

  if (!isRepoFullName(fullName) && !isSourceName(fullName)) {
    return applyWorkspaceSession(NextResponse.json({ error: "fullName is required" }, { status: 400 }), session);
  }

  const scans = await listRepoScansForRepo(session.userId, fullName);
  return applyWorkspaceSession(NextResponse.json(scans), session);
}, {
  route: "/api/github/scan",
  errorMessage: "Failed to load repository scan history",
  rateLimit: API_RATE_LIMITS.githubReads,
});

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  if (!isGitHubTokenConfigured()) {
    return applyWorkspaceSession(NextResponse.json(
      { error: "GITHUB_TOKEN is not configured" },
      { status: 503 }
    ), session);
  }

  const body = await request.json().catch(() => null);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const branch = typeof body?.branch === "string" && body.branch.trim() ? body.branch : undefined;

  if (!fullName || !isRepoFullName(fullName)) {
    return applyWorkspaceSession(NextResponse.json(
      { error: "Missing required field: fullName" },
      { status: 400 }
    ), session);
  }

  const { result } = await scanRepoForUser(session.userId, fullName, branch);
  return applyWorkspaceSession(NextResponse.json(result), session);
}, {
  route: "/api/github/scan",
  errorMessage: "Failed to scan GitHub repository",
  rateLimit: API_RATE_LIMITS.githubScans,
});
