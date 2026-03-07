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

  try {
    const [repos, scopes] = await Promise.all([
      fetchGitHubRepos(),
      fetchTokenScopes(),
    ]);

    return NextResponse.json({ repos, scopes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch GitHub repos";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}, {
  route: "/api/github/repos",
  errorMessage: "Failed to fetch GitHub repositories",
  rateLimit: API_RATE_LIMITS.githubReads,
});
