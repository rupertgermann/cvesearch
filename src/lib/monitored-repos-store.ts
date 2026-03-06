import { promises as fs } from "node:fs";
import path from "node:path";
import { MonitoredRepo } from "./github-types";

const DATA_DIR = path.join(process.cwd(), "data");
const MONITORED_REPOS_FILE = path.join(DATA_DIR, "monitored-repos.json");

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
  const repos = await readMonitoredRepos();

  const existing = repos.find((repo) => repo.fullName === input.fullName);
  if (existing) return existing;

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

  repos.push(repo);
  await writeMonitoredRepos(repos);
  return repo;
};

export const removeMonitoredRepo = async (repoId: string): Promise<boolean> => {
  const repos = await readMonitoredRepos();
  const filtered = repos.filter((repo) => repo.id !== repoId);

  if (filtered.length === repos.length) return false;

  await writeMonitoredRepos(filtered);
  return true;
};

export const updateLastScan = async (
  repoFullName: string,
  vulnerabilityCount: number
): Promise<void> => {
  const repos = await readMonitoredRepos();
  const index = repos.findIndex((repo) => repo.fullName === repoFullName);

  if (index === -1) return;

  repos[index] = {
    ...repos[index],
    lastScannedAt: new Date().toISOString(),
    lastScanVulnerabilityCount: vulnerabilityCount,
  };

  await writeMonitoredRepos(repos);
};

export const getMonitoredRepo = async (repoId: string): Promise<MonitoredRepo | null> => {
  const repos = await readMonitoredRepos();
  return repos.find((repo) => repo.id === repoId) ?? null;
};

const readMonitoredRepos = async (): Promise<MonitoredRepo[]> => {
  try {
    const raw = await fs.readFile(MONITORED_REPOS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isMonitoredRepo) : [];
  } catch {
    return [];
  }
};

const writeMonitoredRepos = async (repos: MonitoredRepo[]): Promise<void> => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MONITORED_REPOS_FILE, JSON.stringify(repos, null, 2));
};

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
