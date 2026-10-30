import assert from "node:assert/strict";
import test from "node:test";
import { buildRepoExposureRows, compareVersions, exposureRowKey, matchesInventoryAsset } from "../src/lib/exposure";
import type { MonitoredRepo, RepoScanRecord } from "../src/lib/github-types";
import { parseCVESummaryList } from "../src/lib/validation";

const asset = (vendor: string, product: string, version: string) => ({ vendor, product, version });

function cna(affected: unknown[]) {
  return parseCVESummaryList([{ id: "CVE-2026-0001", containers: { cna: { affected } } }])[0];
}

test("compareVersions orders numeric segments numerically and suffixes after the base", () => {
  assert.ok(compareVersions("3.0.7", "3.0.10") < 0);
  assert.ok(compareVersions("3.0.8", "3.0.7") > 0);
  assert.equal(compareVersions("v1.2.0", "1.2"), 0);
  assert.ok(compareVersions("1.1.1", "1.1.1t") < 0);
});

test("compareVersions orders pre-releases before their release", () => {
  assert.ok(compareVersions("2.0.0-beta", "2.0.0") < 0);
  assert.ok(compareVersions("2.0.0-rc.1", "2.0.0-rc.2") < 0);
  assert.ok(compareVersions("2.0.0rc1", "2.0.0") < 0);
  assert.ok(compareVersions("2.0.0-beta", "1.9.9") > 0);
  assert.ok(compareVersions("1.1.1t", "1.1.1-beta") > 0);
});

test("CVE 5 range entries match an asset version inside the range only", () => {
  const cve = cna([{ vendor: "OpenSSL", product: "OpenSSL", versions: [{ version: "3.0.0", lessThan: "3.0.8", status: "affected", versionType: "semver" }] }]);
  assert.equal(matchesInventoryAsset(cve, asset("openssl", "openssl", "3.0.7")), true);
  assert.equal(matchesInventoryAsset(cve, asset("openssl", "openssl", "3.0.8")), false);
  assert.equal(matchesInventoryAsset(cve, asset("openssl", "openssl", "1.1.1")), false);
  assert.equal(matchesInventoryAsset(cve, asset("", "OpenSSL", "")), true, "no asset version means product match only");
});

test("lessThanOrEqual, exact versions and unaffected entries", () => {
  const cve = cna([{
    vendor: "openssl",
    product: "openssl",
    versions: [
      { version: "0", lessThanOrEqual: "1.1.1t", status: "affected", versionType: "custom" },
      { version: "3.0.7", status: "affected" },
      { version: "3.1.0", status: "unaffected" },
    ],
  }]);
  assert.equal(matchesInventoryAsset(cve, asset("openssl", "openssl", "1.1.1t")), true);
  assert.equal(matchesInventoryAsset(cve, asset("openssl", "openssl", "3.0.7")), true);
  assert.equal(matchesInventoryAsset(cve, asset("openssl", "openssl", "3.0.6")), false);
  assert.equal(matchesInventoryAsset(cve, asset("openssl", "openssl", "3.1.0")), false);
});

test("version data that cannot be compared still matches on product", () => {
  assert.equal(matchesInventoryAsset(cna([{ vendor: "openssl", product: "openssl" }]), asset("openssl", "openssl", "3.0.7")), true);
  assert.equal(
    matchesInventoryAsset(cna([{ vendor: "n/a", product: "openssl", versions: [{ version: "n/a", status: "affected" }] }]), asset("openssl", "openssl", "3.0.7")),
    true
  );
  assert.equal(
    matchesInventoryAsset(cna([{ vendor: "openssl", product: "openssl", versions: [{ version: "3.0 before 3.0.8", status: "affected" }] }]), asset("openssl", "openssl", "3.0.7")),
    true
  );
});

test("vendor and product must match when both sides name them", () => {
  const cve = cna([{ vendor: "Apache", product: "HTTP_Server" }]);
  assert.equal(matchesInventoryAsset(cve, asset("apache", "http server", "")), true);
  assert.equal(matchesInventoryAsset(cve, asset("nginx", "http server", "")), false);
  assert.equal(matchesInventoryAsset(cve, asset("apache", "tomcat", "")), false);
  assert.equal(matchesInventoryAsset(cve, asset("", "", "")), false, "an asset without a product matches nothing");
});

test("CPE vulnerable_product entries match exact or wildcard versions", () => {
  const [cve] = parseCVESummaryList([{
    id: "CVE-2026-0002",
    vulnerable_product: ["cpe:2.3:a:openssl:openssl:3.0.7:*:*:*:*:*:*:*", "cpe:2.3:a:zlib:zlib:*:*:*:*:*:*:*:*"],
  }]);
  assert.equal(matchesInventoryAsset(cve, asset("openssl", "openssl", "3.0.7")), true);
  assert.equal(matchesInventoryAsset(cve, asset("openssl", "openssl", "3.0.6")), false);
  assert.equal(matchesInventoryAsset(cve, asset("zlib", "zlib", "1.3")), true);
});

test("repo rows come from the latest scan with first-seen from the oldest scan that had the finding", () => {
  const repo = { id: "repo-1", fullName: "acme/web" } as MonitoredRepo;
  const finding = (id: string, aliases: string[], name: string) => ({
    vulnerability: {
      id,
      aliases,
      summary: "",
      details: "Prototype pollution",
      severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }],
      affected: [],
      references: [],
      published: "2026-01-01T00:00:00Z",
      modified: "2026-01-01T00:00:00Z",
    },
    matchedDependency: { name, version: "4.17.0", ecosystem: "npm" as const, isDev: false, manifestPath: "package.json" },
    cveIds: aliases,
  });
  const scan = (scannedAt: string, vulnerabilities: ReturnType<typeof finding>[]) =>
    ({ scannedAt, vulnerabilities } as unknown as RepoScanRecord);
  const lodash = finding("GHSA-aaaa-bbbb-cccc", ["CVE-2026-1111"], "lodash");
  const minimist = finding("GHSA-dddd-eeee-ffff", [], "minimist");

  const rows = buildRepoExposureRows(repo, [
    scan("2026-03-01T00:00:00Z", [lodash, minimist, lodash]),
    scan("2026-02-01T00:00:00Z", [lodash]),
    scan("2026-01-01T00:00:00Z", []),
  ]);

  assert.deepEqual(rows.map((row) => [row.key, row.firstSeenAt]), [
    [exposureRowKey("CVE-2026-1111", "repo-1:npm:lodash"), "2026-02-01T00:00:00Z"],
    [exposureRowKey("GHSA-dddd-eeee-ffff", "repo-1:npm:minimist"), "2026-03-01T00:00:00Z"],
  ]);
  assert.equal(rows[0].cve.cvss3, 9.8);
  assert.equal(rows[0].repoFullName, "acme/web");
  assert.equal(rows[0].criticality, null);
  assert.deepEqual(buildRepoExposureRows(repo, []), []);
});
