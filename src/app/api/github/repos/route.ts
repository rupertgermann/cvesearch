import { NextRequest, NextResponse } from "next/server";
import { fetchGitHubRepos, isGitHubTokenConfigured, fetchTokenScopes } from "@/lib/github";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";

export const GET = withRouteProtection(async function GET(_request: NextRequest) {
  void _request;
  if (!isGitHubTokenConfigured()) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN is not configured. Add it to your .env file." },
      { status: 503 }
    );
  }

  const [repos, scopes] = await Promise.all([
    fetchGitHubRepos(),
    fetchTokenScopes(),
  ]);

  return NextResponse.json({ repos, scopes });
}, {
  route: "/api/github/repos",
  errorMessage: "Failed to fetch GitHub repositories",
  rateLimit: API_RATE_LIMITS.githubReads,
});
