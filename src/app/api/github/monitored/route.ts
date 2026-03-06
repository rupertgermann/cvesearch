import { NextRequest, NextResponse } from "next/server";
import {
  listMonitoredRepos,
  addMonitoredRepo,
  removeMonitoredRepo,
} from "@/lib/monitored-repos-store";

export async function GET() {
  try {
    const repos = await listMonitoredRepos();
    return NextResponse.json(repos);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list monitored repos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.fullName || typeof body.fullName !== "string") {
      return NextResponse.json({ error: "Missing required field: fullName" }, { status: 400 });
    }

    const repo = await addMonitoredRepo({
      githubId: body.githubId ?? 0,
      fullName: body.fullName,
      htmlUrl: body.htmlUrl ?? "",
      isPrivate: body.isPrivate ?? false,
      defaultBranch: body.defaultBranch ?? "main",
    });

    return NextResponse.json(repo, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add monitored repo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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
}
