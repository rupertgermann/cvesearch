import { NextRequest, NextResponse } from "next/server";
import { parseDependencyFiles } from "@/lib/dependency-parser";
import { parseSbom } from "@/lib/sbom-parser";
import { queryOSVBatch } from "@/lib/osv";
import { addMonitoredRepo, updateLastScan } from "@/lib/monitored-repos-store";
import { persistRepoScanResult } from "@/lib/repo-scans-store";
import { DependencyScanResult } from "@/lib/github-types";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";

// No "/" so a source name can never collide with a GitHub owner/repo full name.
const isSourceName = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}$/.test(value);
const isFileName = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value);

// The lockfile parsers key off the manifest in the same directory, so a lone lockfile gets an empty one.
const STUB_MANIFESTS = ["package.json", "composer.json"];

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const filename = typeof body?.filename === "string" ? body.filename.trim() : "";
  const content = typeof body?.content === "string" ? body.content : "";
  const fail = (error: string) => applyWorkspaceSession(NextResponse.json({ error }, { status: 400 }), session);

  if (!isSourceName(name)) {
    return fail("name is required (letters, digits, space, _ . -; no slashes; max 100 chars)");
  }
  if (!isFileName(filename)) {
    return fail("filename is required, e.g. bom.json or package-lock.json");
  }
  if (!content.trim()) {
    return fail("content is required");
  }

  const dependencies = parseSbom(content, filename) ?? parseDependencyFiles([
    { path: filename, content },
    ...STUB_MANIFESTS.filter((manifest) => manifest !== filename).map((path) => ({ path, content: "{}" })),
  ]).dependencies;

  if (dependencies.length === 0) {
    return fail("No dependencies found. Upload a CycloneDX/SPDX JSON SBOM or a supported lockfile.");
  }

  const vulnerabilities = await queryOSVBatch(dependencies);
  const result: DependencyScanResult = {
    repoFullName: name,
    scannedAt: new Date().toISOString(),
    dependencyCount: dependencies.length,
    locationCount: 1,
    vulnerabilities,
  };

  await addMonitoredRepo(session.userId, {
    githubId: 0,
    fullName: name,
    htmlUrl: "",
    isPrivate: false,
    defaultBranch: filename,
    sourceKind: "upload",
  });
  await updateLastScan(session.userId, name, vulnerabilities.length);
  await persistRepoScanResult(session.userId, name, filename, result);

  return applyWorkspaceSession(NextResponse.json(result), session);
}, {
  route: "/api/sources",
  errorMessage: "Failed to scan uploaded dependency source",
  rateLimit: API_RATE_LIMITS.githubScans,
});
