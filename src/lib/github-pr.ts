import { fetchGitHub, getFileSha } from "./github";
import { FixFileChange } from "./github-types";

interface BranchInfo {
  commit: { sha: string };
  name: string;
}

interface GitPullRequest {
  html_url: string;
  number: number;
  title: string;
  state: string;
  head: { ref: string };
}

const PULL_REQUESTS_PER_PAGE = 100;
const MAX_PULL_REQUEST_SCAN_PAGES = 10;

export interface ExistingPR {
  url: string;
  number: number;
  title: string;
  state: string;
  branchName: string;
}

export const getDefaultBranchSha = async (
  fullName: string,
  branch: string
): Promise<string> => {
  const branchInfo = await fetchGitHub<BranchInfo>(
    `/repos/${fullName}/branches/${encodeURIComponent(branch)}`
  );
  return branchInfo.commit.sha;
};

export const createBranch = async (
  fullName: string,
  branchName: string,
  fromSha: string
): Promise<void> => {
  await fetchGitHub<unknown>(`/repos/${fullName}/git/refs`, {
    method: "POST",
    body: {
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    },
  });
};

export const commitFileChanges = async (
  fullName: string,
  branch: string,
  fileChanges: FixFileChange[],
  commitMessage: string
): Promise<void> => {
  for (const change of fileChanges) {
    const existingSha = await getFileSha(fullName, change.path, branch);

    const body: Record<string, unknown> = {
      message: commitMessage,
      content: Buffer.from(change.content).toString("base64"),
      branch,
    };

    if (existingSha) {
      body.sha = existingSha;
    }

    await fetchGitHub<unknown>(
      `/repos/${fullName}/contents/${change.path}`,
      { method: "PUT", body }
    );
  }
};

export const createPullRequest = async (
  fullName: string,
  head: string,
  base: string,
  title: string,
  body: string
): Promise<string> => {
  const pr = await fetchGitHub<GitPullRequest>(
    `/repos/${fullName}/pulls`,
    {
      method: "POST",
      body: { title, body, head, base },
    }
  );
  return pr.html_url;
};

export const branchExists = async (
  fullName: string,
  branchName: string
): Promise<boolean> => {
  try {
    await fetchGitHub<BranchInfo>(
      `/repos/${fullName}/branches/${encodeURIComponent(branchName)}`
    );
    return true;
  } catch {
    return false;
  }
};

export const generateBranchName = async (
  fullName: string,
  vulnId: string
): Promise<string> => {
  const sanitized = vulnId.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  const baseName = `fix/${sanitized}`;

  const exists = await branchExists(fullName, baseName);
  if (!exists) return baseName;

  const timestamp = Date.now().toString(36);
  return `${baseName}-${timestamp}`;
};

export const sanitizeVulnIdForBranch = (vulnId: string): string =>
  vulnId.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();

export const findExistingFixPR = async (
  fullName: string,
  vulnId: string
): Promise<ExistingPR | null> => {
  const branchPattern = `fix/${sanitizeVulnIdForBranch(vulnId)}`;

  try {
    for (let page = 1; page <= MAX_PULL_REQUEST_SCAN_PAGES; page += 1) {
      const pullRequests = await fetchGitHub<GitPullRequest[]>(
        `/repos/${fullName}/pulls?state=all&per_page=${PULL_REQUESTS_PER_PAGE}&sort=created&direction=desc&page=${page}`
      );

      const match = pullRequests.find((pr) =>
        pr.head.ref === branchPattern || pr.head.ref.startsWith(`${branchPattern}-`)
      );

      if (match) {
        return {
          url: match.html_url,
          number: match.number,
          title: match.title,
          state: match.state,
          branchName: match.head.ref,
        };
      }

      if (pullRequests.length < PULL_REQUESTS_PER_PAGE) {
        break;
      }
    }

    return null;
  } catch {
    return null;
  }
};
