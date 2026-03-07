import { NextRequest, NextResponse } from "next/server";
import {
  isGitHubTokenConfigured,
  fetchGitHub,
  fetchRepoDependencyFiles,
  searchRepoFiles,
  fetchRepoFile,
} from "@/lib/github";
import {
  getDefaultBranchSha,
  createBranch,
  commitFileChanges,
  createPullRequest,
  generateBranchName,
  findExistingFixPR,
} from "@/lib/github-pr";
import { generateVulnerabilityFix, extractFixedVersion } from "@/lib/ai-fix";
import {
  FixRequestPayload,
  FixResponse,
  FixFileChange,
  ParsedDependency,
  RepoFileContent,
} from "@/lib/github-types";
import { AISettings, AIProvider } from "@/lib/types";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";

const MAX_SOURCE_FILES = 5;
const MAX_ALLOWED_FILE_CHANGES = 8;
const MAX_FILE_CONTENT_BYTES = 200_000;
const VALID_PROVIDERS: AIProvider[] = ["heuristic", "openai", "anthropic"];
const REPO_FULL_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  if (!isGitHubTokenConfigured()) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN is not configured" },
      { status: 503 }
    );
  }

  try {
    const body: FixRequestPayload | null = await request.json().catch(() => null);
    const repoFullName = typeof body?.repoFullName === "string" ? body.repoFullName.trim() : "";
    const vulnerability = body?.vulnerability;
    const matchedDependency = body?.matchedDependency;

    if (!repoFullName || !REPO_FULL_NAME_PATTERN.test(repoFullName) || !vulnerability || !isValidMatchedDependency(matchedDependency)) {
      return NextResponse.json(
        { error: "Missing required fields: repoFullName, vulnerability, matchedDependency" },
        { status: 400 }
      );
    }

    const aiSettings = body?.aiSettings;

    const fixedVersion = extractFixedVersion(vulnerability, matchedDependency.name);

    const dependencyFiles = selectRelevantDependencyFiles(
      await fetchRepoDependencyFiles(repoFullName),
      matchedDependency
    );

    if (dependencyFiles.length === 0) {
      return NextResponse.json(
        { error: "Could not locate the dependency manifest for this package in the repository." },
        { status: 422 }
      );
    }

    const sourceFiles: RepoFileContent[] = [];
    try {
      const filePaths = await searchRepoFiles(repoFullName, matchedDependency.name, MAX_SOURCE_FILES);

      const depFilePaths = new Set(dependencyFiles.map((f) => f.path));
      const relevantPaths = filePaths.filter(
        (p) => !depFilePaths.has(p) && !p.includes("node_modules") && !p.includes("vendor")
      );

      const fileContents = await Promise.all(
        relevantPaths.slice(0, MAX_SOURCE_FILES).map(async (filePath) => {
          const content = await fetchRepoFile(repoFullName, filePath);
          if (!content) return null;
          return { path: filePath, content };
        })
      );

      sourceFiles.push(
        ...fileContents.filter((f): f is RepoFileContent => f !== null)
      );
    } catch {
      // source file search is best-effort
    }

    const fixResult = await generateVulnerabilityFix(
      {
        vulnerability,
        matchedDependency,
        fixedVersion,
        dependencyFiles,
        sourceFiles,
      },
      aiSettings ? normalizeAISettingsFromRequest(aiSettings) : undefined
    );

    try {
      validateFixFileChanges(
        fixResult.fileChanges,
        new Set([...dependencyFiles, ...sourceFiles].map((file) => file.path))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid generated fix changes";
      return NextResponse.json(
        { error: message, analysis: fixResult.analysis },
        { status: 422 }
      );
    }

    if (fixResult.fileChanges.length === 0) {
      return NextResponse.json(
        {
          error: "No file changes could be generated. Manual intervention required.",
          analysis: fixResult.analysis,
        },
        { status: 422 }
      );
    }

    const repoInfo = await fetchGitHub<{ archived: boolean; default_branch: string; disabled: boolean }>(
      `/repos/${repoFullName}`
    );

    if (repoInfo.archived) {
      return NextResponse.json(
        {
          error: "This repository is archived and read-only. Unarchive it on GitHub before creating a fix PR.",
          analysis: fixResult.analysis,
        },
        { status: 422 }
      );
    }

    if (repoInfo.disabled) {
      return NextResponse.json(
        {
          error: "This repository is disabled. Enable it on GitHub before creating a fix PR.",
          analysis: fixResult.analysis,
        },
        { status: 422 }
      );
    }

    const existingPr = await findExistingFixPR(repoFullName, vulnerability.id);
    if (existingPr) {
      const response: FixResponse = {
        prUrl: existingPr.url,
        analysis: `A fix PR for ${vulnerability.id} already exists (${existingPr.state === "open" ? "open" : "closed/merged"}).`,
        fileChanges: [],
        branchName: existingPr.branchName,
        existingPr: true,
      };
      return NextResponse.json(response);
    }

    const defaultBranch = repoInfo.default_branch;

    let baseSha: string;
    try {
      baseSha = await getDefaultBranchSha(repoFullName, defaultBranch);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[fix-route] Failed to get SHA for branch "${defaultBranch}" in ${repoFullName}:`, msg);
      return NextResponse.json(
        { error: `Failed to get branch SHA (branch: ${defaultBranch}): ${msg}`, analysis: fixResult.analysis },
        { status: 500 }
      );
    }

    let branchName: string;
    try {
      branchName = await generateBranchName(repoFullName, vulnerability.id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[fix-route] Failed to generate branch name:`, msg);
      return NextResponse.json(
        { error: `Failed to generate branch name: ${msg}`, analysis: fixResult.analysis },
        { status: 500 }
      );
    }

    try {
      await createBranch(repoFullName, branchName, baseSha);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[fix-route] Failed to create branch "${branchName}":`, msg);
      return NextResponse.json(
        { error: `Failed to create branch "${branchName}": ${msg}`, analysis: fixResult.analysis },
        { status: 500 }
      );
    }

    try {
      await commitFileChanges(
        repoFullName,
        branchName,
        fixResult.fileChanges,
        fixResult.prTitle
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[fix-route] Failed to commit file changes:`, msg);
      return NextResponse.json(
        { error: `Failed to commit changes: ${msg}`, analysis: fixResult.analysis },
        { status: 500 }
      );
    }

    let prUrl: string;
    try {
      prUrl = await createPullRequest(
        repoFullName,
        branchName,
        defaultBranch,
        fixResult.prTitle,
        fixResult.prBody
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[fix-route] Failed to create PR:`, msg);
      return NextResponse.json(
        { error: `Failed to create pull request: ${msg}`, analysis: fixResult.analysis },
        { status: 500 }
      );
    }

    const response: FixResponse = {
      prUrl,
      analysis: fixResult.analysis,
      fileChanges: fixResult.fileChanges,
      branchName,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fix failed";
    console.error(`[fix-route] Unexpected error:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, {
  route: "/api/github/fix",
  errorMessage: "Failed to create GitHub fix pull request",
  rateLimit: API_RATE_LIMITS.githubWrites,
});

const normalizeAISettingsFromRequest = (
  raw: Record<string, unknown>
): Partial<AISettings> => {
  const provider = VALID_PROVIDERS.includes(raw.provider as AIProvider)
    ? (raw.provider as AIProvider)
    : undefined;

  return {
    provider,
    model: typeof raw.model === "string" ? raw.model : undefined,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined,
  };
};

const isValidMatchedDependency = (value: unknown): value is ParsedDependency => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const manifestPath = typeof record.manifestPath === "string" ? record.manifestPath : undefined;
  const lockfilePath = typeof record.lockfilePath === "string" ? record.lockfilePath : undefined;

  return (
    typeof record.name === "string" &&
    typeof record.version === "string" &&
    typeof record.isDev === "boolean" &&
    (record.ecosystem === "npm" || record.ecosystem === "Packagist") &&
    isSafeRepoPath(manifestPath) &&
    isSafeRepoPath(lockfilePath)
  );
};

const isSafeRepoPath = (value: string | undefined): boolean => {
  if (value === undefined) {
    return true;
  }

  return value.length > 0 && !value.startsWith("/") && !value.includes("\\") && !/(^|\/)\.\.(\/|$)/.test(value);
};

const getParentDir = (filePath: string | undefined): string => {
  if (!filePath) {
    return "";
  }

  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash === -1 ? "" : filePath.slice(0, lastSlash);
};

const selectRelevantDependencyFiles = (
  files: RepoFileContent[],
  dependency: ParsedDependency
): RepoFileContent[] => {
  const preferredPaths = new Set(
    [dependency.manifestPath, dependency.lockfilePath].filter((value): value is string => Boolean(value))
  );

  if (preferredPaths.size > 0) {
    return files.filter((file) => preferredPaths.has(file.path));
  }

  const sourceDirectory = dependency.sourceDirectory ?? getParentDir(dependency.manifestPath) ?? getParentDir(dependency.lockfilePath);
  if (!sourceDirectory) {
    return files;
  }

  return files.filter((file) => getParentDir(file.path) === sourceDirectory);
};

const validateFixFileChanges = (fileChanges: FixFileChange[], allowedPaths: Set<string>): void => {
  if (fileChanges.length > MAX_ALLOWED_FILE_CHANGES) {
    throw new Error(`Generated fix exceeds the maximum of ${MAX_ALLOWED_FILE_CHANGES} files`);
  }

  const seenPaths = new Set<string>();

  for (const change of fileChanges) {
    if (!isSafeRepoPath(change.path)) {
      throw new Error(`Generated fix contains an unsafe path: ${change.path}`);
    }

    if (!allowedPaths.has(change.path)) {
      throw new Error(`Generated fix tried to modify an unapproved file: ${change.path}`);
    }

    if (isLockfilePath(change.path)) {
      throw new Error(`Generated fix tried to modify a lock file: ${change.path}`);
    }

    if (seenPaths.has(change.path)) {
      throw new Error(`Generated fix contains duplicate file changes for ${change.path}`);
    }

    seenPaths.add(change.path);

    if (Buffer.byteLength(change.content, "utf8") > MAX_FILE_CONTENT_BYTES) {
      throw new Error(`Generated fix content is too large for ${change.path}`);
    }
  }
};

const isLockfilePath = (filePath: string): boolean => {
  return filePath.endsWith("package-lock.json") || filePath.endsWith("pnpm-lock.yaml") || filePath.endsWith("composer.lock");
};
