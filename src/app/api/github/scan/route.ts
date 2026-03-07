import { NextRequest, NextResponse } from "next/server";
import { isGitHubTokenConfigured, fetchRepoDependencyFiles } from "@/lib/github";
import { parseDependencyFiles } from "@/lib/dependency-parser";
import { queryOSVBatch } from "@/lib/osv";
import { updateLastScan } from "@/lib/monitored-repos-store";
import { DependencyScanResult } from "@/lib/github-types";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";

const isRepoFullName = (value: string): boolean => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  if (!isGitHubTokenConfigured()) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN is not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
    const branch = typeof body?.branch === "string" && body.branch.trim() ? body.branch : undefined;

    if (!fullName || !isRepoFullName(fullName)) {
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
        locationCount: 0,
        vulnerabilities: [],
      };

      await updateLastScan(fullName, 0);
      return NextResponse.json(emptyResult);
    }

    const { dependencies, locationCount } = parseDependencyFiles(files);
    const vulnerabilities = await queryOSVBatch(dependencies);

    const result: DependencyScanResult = {
      repoFullName: fullName,
      scannedAt: new Date().toISOString(),
      dependencyCount: dependencies.length,
      locationCount,
      vulnerabilities,
    };

    await updateLastScan(fullName, vulnerabilities.length);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}, {
  route: "/api/github/scan",
  errorMessage: "Failed to scan GitHub repository",
  rateLimit: API_RATE_LIMITS.githubScans,
});
