import { GitHubRepo, RepoFileContent } from "./github-types";

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15_000;

const DEPENDENCY_FILE_NAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "composer.json",
  "composer.lock",
]);

const IGNORED_PATH_SEGMENTS = ["node_modules", "vendor", ".git", "dist", "build"];

interface GitTreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
}

interface GitTree {
  sha: string;
  tree: GitTreeEntry[];
  truncated: boolean;
}

const getGitHubToken = (): string => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is not configured");
  }
  return token;
};

interface FetchGitHubOptions {
  method?: string;
  body?: unknown;
}

export const fetchGitHub = async <T>(
  path: string,
  options?: FetchGitHubOptions
): Promise<T> => {
  const token = getGitHubToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const method = options?.method ?? "GET";

  try {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "CVESearch-WebApp/1.0",
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
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
  branch?: string,
  options?: { allowMissing?: boolean }
): Promise<string | null> => {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const allowMissing = options?.allowMissing ?? true;

  try {
    const data = await fetchGitHub<{ content?: string; encoding?: string }>(
      `/repos/${fullName}/contents/${encodedPath}${ref}`
    );

    if (!data.content || data.encoding !== "base64") {
      if (allowMissing) {
        return null;
      }

      throw new Error(`Unsupported file content response for ${filePath}`);
    }

    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch (error) {
    if (allowMissing) {
      return null;
    }

    throw error;
  }
};

const FETCH_BATCH_SIZE = 10;

const fetchInBatches = async (
  fullName: string,
  paths: string[],
  branch?: string
): Promise<RepoFileContent[]> => {
  const results: RepoFileContent[] = [];

  for (let offset = 0; offset < paths.length; offset += FETCH_BATCH_SIZE) {
    const batch = paths.slice(offset, offset + FETCH_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (filePath) => {
        const content = await fetchRepoFile(fullName, filePath, branch, { allowMissing: false });
        return content === null ? null : { path: filePath, content };
      })
    );
    results.push(...batchResults.filter((r): r is RepoFileContent => r !== null));
  }

  return results;
};

const isIgnoredPath = (filePath: string): boolean =>
  IGNORED_PATH_SEGMENTS.some((segment) => filePath.includes(`${segment}/`));

const isDependencyFile = (filePath: string): boolean => {
  const fileName = filePath.split("/").pop() ?? "";
  return DEPENDENCY_FILE_NAMES.has(fileName);
};

export const discoverDependencyFiles = async (
  fullName: string,
  treeSha: string,
  contentRef = treeSha
): Promise<RepoFileContent[]> => {
  const tree = await fetchGitHub<GitTree>(
    `/repos/${fullName}/git/trees/${treeSha}?recursive=1`
  );

  if (tree.truncated) {
    throw new Error(`Dependency scan tree is truncated for ${fullName}; narrow the scan target or use a smaller repository snapshot`);
  }

  const matchingPaths = tree.tree
    .filter((entry) => entry.type === "blob" && isDependencyFile(entry.path) && !isIgnoredPath(entry.path))
    .map((entry) => entry.path);

  if (matchingPaths.length === 0) return [];

  return fetchInBatches(fullName, matchingPaths, contentRef);
};

export const fetchRepoDependencyFiles = async (
  fullName: string,
  branchOrSha?: string
): Promise<RepoFileContent[]> => {
  if (branchOrSha && /^[0-9a-f]{40}$/i.test(branchOrSha)) {
    return discoverDependencyFiles(fullName, branchOrSha, branchOrSha);
  }

  const repoInfo = await fetchGitHub<{ default_branch: string }>(
    `/repos/${fullName}`
  );
  const branch = branchOrSha ?? repoInfo.default_branch;
  const branchInfo = await fetchGitHub<{ commit: { sha: string } }>(
    `/repos/${fullName}/branches/${encodeURIComponent(branch)}`
  );
  return discoverDependencyFiles(fullName, branchInfo.commit.sha, branchInfo.commit.sha);
};

export const isGitHubTokenConfigured = (): boolean => {
  return !!process.env.GITHUB_TOKEN;
};

export const searchRepoFiles = async (
  fullName: string,
  query: string,
  maxResults = 5
): Promise<string[]> => {
  try {
    const searchQuery = encodeURIComponent(`${query} repo:${fullName}`);
    const data = await fetchGitHub<{
      items?: { path: string }[];
    }>(`/search/code?q=${searchQuery}&per_page=${maxResults}`);
    return (data.items ?? []).map((item) => item.path);
  } catch {
    return [];
  }
};

export const getFileSha = async (
  fullName: string,
  filePath: string,
  branch?: string
): Promise<string | null> => {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");

  try {
    const data = await fetchGitHub<{ sha?: string }>(
      `/repos/${fullName}/contents/${encodedPath}${ref}`
    );
    return data.sha ?? null;
  } catch {
    return null;
  }
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
