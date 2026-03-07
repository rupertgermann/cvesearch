import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addMonitoredRepo, listMonitoredRepos } from "../src/lib/monitored-repos-store";

test("monitored repo store serializes concurrent writes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvesearch-monitored-repos-"));
  const previous = process.env.MONITORED_REPOS_FILE;
  process.env.MONITORED_REPOS_FILE = path.join(tempDir, "monitored-repos.json");

  try {
    await Promise.all([
      addMonitoredRepo({ githubId: 1, fullName: "acme/api", htmlUrl: "https://example.test/acme/api", isPrivate: true, defaultBranch: "main" }),
      addMonitoredRepo({ githubId: 2, fullName: "acme/web", htmlUrl: "https://example.test/acme/web", isPrivate: true, defaultBranch: "main" }),
      addMonitoredRepo({ githubId: 3, fullName: "acme/worker", htmlUrl: "https://example.test/acme/worker", isPrivate: false, defaultBranch: "main" }),
    ]);

    const repos = await listMonitoredRepos();
    assert.equal(repos.length, 3);
    assert.deepEqual(
      repos.map((repo) => repo.fullName).sort(),
      ["acme/api", "acme/web", "acme/worker"]
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MONITORED_REPOS_FILE;
    } else {
      process.env.MONITORED_REPOS_FILE = previous;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
