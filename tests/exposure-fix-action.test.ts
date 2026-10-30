import assert from "node:assert/strict";
import test from "node:test";
import { buildRepoExposureRows } from "../src/lib/exposure";
import { DependencyEcosystem, RepoScanRecord, VulnerabilityMatch } from "../src/lib/github-types";
import { canOpenFixPR, findRepoRowMatch } from "../src/lib/repo-scan-diff";

function match(vulnId: string, pkg: string, ecosystem: DependencyEcosystem, aliases: string[] = []): VulnerabilityMatch {
  return {
    vulnerability: { id: vulnId, summary: "x", details: "", aliases, severity: [], affected: [], references: [], published: "2026-01-01T00:00:00Z", modified: "" },
    matchedDependency: { name: pkg, version: "1.0.0", ecosystem, isDev: false },
    cveIds: aliases,
  };
}

function rowsFor(fullName: string, matches: VulnerabilityMatch[]) {
  const scan = { scannedAt: "2026-10-01T00:00:00Z", vulnerabilities: matches } as RepoScanRecord;
  return buildRepoExposureRows({ id: "repo-1", fullName }, scan);
}

test("repo exposure rows map back to the scan match the fix flow needs", () => {
  const matches = [
    match("GHSA-aaaa", "lodash", "npm", ["CVE-2021-23337"]),
    match("GHSA-bbbb", "@scope/pkg", "npm"),
    match("GHSA-cccc", "guzzlehttp/guzzle", "Packagist"),
  ];
  const rows = rowsFor("acme/app", matches);

  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.ok(canOpenFixPR(row), row.assetId);
    const found = findRepoRowMatch(row, matches);
    assert.ok(found, row.assetId);
    assert.equal(`${found.matchedDependency.name}@${found.matchedDependency.version}`, row.assetLabel);
  }
});

test("no fix PR action for uploaded sources, unsupported ecosystems, or inventory rows", () => {
  assert.equal(rowsFor("vendor-appliance", [match("GHSA-a", "lodash", "npm")]).some(canOpenFixPR), false);
  assert.equal(rowsFor("acme/app", [match("GHSA-b", "requests", "PyPI" as DependencyEcosystem)]).some(canOpenFixPR), false);
  assert.equal(canOpenFixPR({ source: "inventory", assetId: "asset-1", repoFullName: null }), false);
});

test("fix lookup copes with OSV matches that carry no aliases", () => {
  const bare = match("GHSA-dddd", "next", "npm");
  delete (bare.vulnerability as { aliases?: string[] }).aliases;
  const target = match("GHSA-eeee", "next", "npm", ["CVE-2026-0002"]);
  const row = rowsFor("acme/app", [bare, target]).find((item) => item.vulnerabilityId !== "GHSA-dddd")!;
  assert.equal(findRepoRowMatch(row, [bare, target]), target);
});
