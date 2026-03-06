import { NextRequest, NextResponse } from "next/server";
import { isGitHubTokenConfigured, fetchRepoDependencyFiles } from "@/lib/github";
import { parseDependencyFiles } from "@/lib/dependency-parser";
import { queryOSVBatch } from "@/lib/osv";
import { updateLastScan } from "@/lib/monitored-repos-store";
import { DependencyScanResult } from "@/lib/github-types";

export async function POST(request: NextRequest) {
  if (!isGitHubTokenConfigured()) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN is not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const fullName = body.fullName;
    const branch = body.branch;

    if (!fullName || typeof fullName !== "string") {
      return NextResponse.json(
        { error: "Missing required field: fullName" },
        { status: 400 }
      );
    }

    const files = await fetchRepoDependencyFiles(fullName, branch);

    if (files.length === 0) {
      const emptyResult: DependencyScanResult = {
        repoFullName: fullName,
        scannedAt: new Date().toISOString(),
        dependencyCount: 0,
        vulnerabilities: [],
      };

      await updateLastScan(fullName, 0);
      return NextResponse.json(emptyResult);
    }

    const dependencies = parseDependencyFiles(files);
    const vulnerabilities = await queryOSVBatch(dependencies);

    const result: DependencyScanResult = {
      repoFullName: fullName,
      scannedAt: new Date().toISOString(),
      dependencyCount: dependencies.length,
      vulnerabilities,
    };

    await updateLastScan(fullName, vulnerabilities.length);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
