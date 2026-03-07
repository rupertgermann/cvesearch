import { promises as fs } from "node:fs";
import path from "node:path";
import { MonitoredRepo } from "./github-types";

const DATA_DIR = path.join(process.cwd(), "data");
let writeQueue: Promise<void> = Promise.resolve();

function getMonitoredReposFile(): string {
  return process.env.MONITORED_REPOS_FILE?.trim() || path.join(DATA_DIR, "monitored-repos.json");
}

export const listMonitoredRepos = async (): Promise<MonitoredRepo[]> => {
  const repos = await readMonitoredRepos();
  return repos.sort((left, right) => right.addedAt.localeCompare(left.addedAt));
};

export const addMonitoredRepo = async (input: {
  githubId: number;
  fullName: string;
  htmlUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
}): Promise<MonitoredRepo> => {
  return mutateMonitoredRepos((repos) => {
    const existing = repos.find((repo) => repo.fullName === input.fullName);
    if (existing) {
      return { repos, result: existing };
    }

    const repo: MonitoredRepo = {
      id: crypto.randomUUID(),
      githubId: input.githubId,
      fullName: input.fullName,
      htmlUrl: input.htmlUrl,
      isPrivate: input.isPrivate,
      defaultBranch: input.defaultBranch,
      addedAt: new Date().toISOString(),
      lastScannedAt: null,
      lastScanVulnerabilityCount: null,
    };

    return {
      repos: [...repos, repo],
      result: repo,
    };
  });
};

export const removeMonitoredRepo = async (repoId: string): Promise<boolean> => {
  return mutateMonitoredRepos((repos) => {
    const filtered = repos.filter((repo) => repo.id !== repoId);
    return {
      repos: filtered,
      result: filtered.length !== repos.length,
      changed: filtered.length !== repos.length,
    };
  });
};

export const updateLastScan = async (
  repoFullName: string,
  vulnerabilityCount: number
): Promise<void> => {
  await mutateMonitoredRepos((repos) => {
    const index = repos.findIndex((repo) => repo.fullName === repoFullName);
    if (index === -1) {
      return { repos, result: undefined };
    }

    const next = [...repos];
    next[index] = {
      ...next[index],
      lastScannedAt: new Date().toISOString(),
      lastScanVulnerabilityCount: vulnerabilityCount,
    };

    return {
      repos: next,
      result: undefined,
      changed: true,
    };
  });
};

export const getMonitoredRepo = async (repoIdOrFullName: string): Promise<MonitoredRepo | null> => {
  const repos = await readMonitoredRepos();
  return (
    repos.find((repo) => repo.id === repoIdOrFullName) ??
    repos.find((repo) => repo.fullName === repoIdOrFullName) ??
    null
  );
};

const readMonitoredRepos = async (): Promise<MonitoredRepo[]> => {
  try {
    const raw = await fs.readFile(getMonitoredReposFile(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isMonitoredRepo) : [];
  } catch {
    return [];
  }
};

const writeMonitoredRepos = async (repos: MonitoredRepo[]): Promise<void> => {
  await fs.mkdir(path.dirname(getMonitoredReposFile()), { recursive: true });
  await fs.writeFile(getMonitoredReposFile(), JSON.stringify(repos, null, 2));
};

async function mutateMonitoredRepos<T>(
  mutation: (repos: MonitoredRepo[]) => { repos: MonitoredRepo[]; result: T; changed?: boolean }
): Promise<T> {
  let result!: T;

  const operation = writeQueue.then(async () => {
    const repos = await readMonitoredRepos();
    const next = mutation(repos);
    result = next.result;

    if (next.changed !== false) {
      await writeMonitoredRepos(next.repos);
    }
  });

  writeQueue = operation.catch(() => undefined);
  await operation;
  return result;
}

const isMonitoredRepo = (value: unknown): value is MonitoredRepo => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.githubId === "number" &&
    typeof record.fullName === "string" &&
    typeof record.htmlUrl === "string" &&
    typeof record.isPrivate === "boolean" &&
    typeof record.defaultBranch === "string" &&
    typeof record.addedAt === "string"
  );
};
