import { NextResponse } from "next/server";
import { fetchGitHubRepos, isGitHubTokenConfigured, fetchTokenScopes } from "@/lib/github";

export async function GET() {
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
}
