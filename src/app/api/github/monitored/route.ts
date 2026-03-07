import { NextRequest, NextResponse } from "next/server";
import {
  listMonitoredRepos,
  addMonitoredRepo,
  removeMonitoredRepo,
} from "@/lib/monitored-repos-store";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";

const isRepoFullName = (value: string): boolean => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);

export const GET = withRouteProtection(async function GET(_request: NextRequest) {
  void _request;
  try {
    const repos = await listMonitoredRepos();
    return NextResponse.json(repos);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list monitored repos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, {
  route: "/api/github/monitored",
  errorMessage: "Failed to list monitored repositories",
  rateLimit: API_RATE_LIMITS.githubReads,
});

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";

    if (!fullName || !isRepoFullName(fullName)) {
      return NextResponse.json({ error: "Missing required field: fullName" }, { status: 400 });
    }

    const repo = await addMonitoredRepo({
      githubId: typeof body?.githubId === "number" ? body.githubId : 0,
      fullName,
      htmlUrl: typeof body?.htmlUrl === "string" ? body.htmlUrl : "",
      isPrivate: body?.isPrivate === true,
      defaultBranch: typeof body?.defaultBranch === "string" && body.defaultBranch.trim() ? body.defaultBranch : "main",
    });

    return NextResponse.json(repo, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add monitored repo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, {
  route: "/api/github/monitored",
  errorMessage: "Failed to add monitored repository",
  rateLimit: API_RATE_LIMITS.githubWrites,
});

export const DELETE = withRouteProtection(async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repoId = searchParams.get("id");

    if (!repoId) {
      return NextResponse.json({ error: "Missing query parameter: id" }, { status: 400 });
    }

    const removed = await removeMonitoredRepo(repoId);

    if (!removed) {
      return NextResponse.json({ error: "Repo not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove monitored repo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, {
  route: "/api/github/monitored",
  errorMessage: "Failed to remove monitored repository",
  rateLimit: API_RATE_LIMITS.githubWrites,
});
