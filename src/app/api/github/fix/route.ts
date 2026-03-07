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
  RepoFileContent,
} from "@/lib/github-types";
import { AISettings, AIProvider } from "@/lib/types";

const MAX_SOURCE_FILES = 5;

export async function POST(request: NextRequest) {
  if (!isGitHubTokenConfigured()) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN is not configured" },
      { status: 503 }
    );
  }

  try {
    const body: FixRequestPayload = await request.json();

    if (!body.repoFullName || !body.vulnerability || !body.matchedDependency) {
      return NextResponse.json(
        { error: "Missing required fields: repoFullName, vulnerability, matchedDependency" },
        { status: 400 }
      );
    }

    const { repoFullName, vulnerability, matchedDependency, aiSettings } = body;

    const fixedVersion = extractFixedVersion(vulnerability, matchedDependency.name);

    const dependencyFiles = await fetchRepoDependencyFiles(repoFullName);

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
}

const VALID_PROVIDERS: AIProvider[] = ["heuristic", "openai", "anthropic"];

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
