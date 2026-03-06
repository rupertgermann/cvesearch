import { GitHubRepo, RepoFileContent } from "./github-types";

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15_000;

const DEPENDENCY_FILE_PATHS = [
  "package.json",
  "package-lock.json",
  "composer.json",
  "composer.lock",
] as const;

const getGitHubToken = (): string => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is not configured");
  }
  return token;
};

const fetchGitHub = async <T>(path: string): Promise<T> => {
  const token = getGitHubToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "CVESearch-WebApp/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = body?.message || `${response.status} ${response.statusText}`;
      throw new Error(`GitHub API error: ${message}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("GitHub API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

interface GitHubLinkHeader {
  next?: string;
}

const parseLinkHeader = (header: string | null): GitHubLinkHeader => {
  if (!header) return {};
  const links: GitHubLinkHeader = {};
  const parts = header.split(",");

  parts.forEach((part) => {
    const match = part.match(/<([^>]+)>;\s*rel="(\w+)"/);
    if (match && match[2] === "next") {
      const url = new URL(match[1]);
      links.next = `${url.pathname}${url.search}`;
    }
  });

  return links;
};

export const fetchGitHubRepos = async (): Promise<GitHubRepo[]> => {
  const allRepos: GitHubRepo[] = [];
  let path: string | undefined = "/user/repos?per_page=100&sort=updated&direction=desc&visibility=all&affiliation=owner,collaborator,organization_member";

  while (path) {
    const token = getGitHubToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${GITHUB_API_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "CVESearch-WebApp/1.0",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(`GitHub API error: ${body?.message || response.statusText}`);
      }

      const repos: GitHubRepo[] = await response.json();
      allRepos.push(...repos);

      const linkHeader = parseLinkHeader(response.headers.get("link"));
      path = linkHeader.next;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("GitHub API request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return allRepos;
};

export const fetchRepoFile = async (
  fullName: string,
  filePath: string,
  branch?: string
): Promise<string | null> => {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");

  try {
    const data = await fetchGitHub<{ content?: string; encoding?: string }>(
      `/repos/${fullName}/contents/${encodedPath}${ref}`
    );

    if (!data.content || data.encoding !== "base64") return null;

    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
};

export const fetchRepoDependencyFiles = async (
  fullName: string,
  branch?: string
): Promise<RepoFileContent[]> => {
  const results: RepoFileContent[] = [];

  const filePromises = DEPENDENCY_FILE_PATHS.map(async (filePath) => {
    const content = await fetchRepoFile(fullName, filePath, branch);
    if (content) {
      results.push({ path: filePath, content });
    }
  });

  await Promise.all(filePromises);
  return results;
};

export const isGitHubTokenConfigured = (): boolean => {
  return !!process.env.GITHUB_TOKEN;
};

export const fetchTokenScopes = async (): Promise<{
  scopes: string[];
  hasRepoScope: boolean;
  tokenType: string;
}> => {
  const token = getGitHubToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "CVESearch-WebApp/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { scopes: [], hasRepoScope: false, tokenType: "unknown" };
    }

    const scopeHeader = response.headers.get("x-oauth-scopes");
    const scopes = scopeHeader
      ? scopeHeader.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const isFineGrained = !scopeHeader && response.ok;
    const hasRepoScope = scopes.includes("repo") || isFineGrained;
    const tokenType = isFineGrained ? "fine-grained" : "classic";

    return { scopes, hasRepoScope, tokenType };
  } catch {
    return { scopes: [], hasRepoScope: false, tokenType: "unknown" };
  } finally {
    clearTimeout(timeout);
  }
};
