import assert from "node:assert/strict";
import test from "node:test";
import { getSeverityLabel } from "../src/lib/osv";
import { OSVVulnerability } from "../src/lib/github-types";

const vuln = (overrides: Partial<OSVVulnerability>): OSVVulnerability => ({
  id: "GHSA-test",
  summary: "",
  details: "",
  aliases: [],
  severity: [],
  affected: [],
  references: [],
  published: "",
  modified: "",
  ...overrides,
});

test("getSeverityLabel falls back to the GHSA label when only a CVSS v4 vector exists", () => {
  const v4Only = vuln({
    severity: [{ type: "CVSS_V4", score: "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N" }],
    database_specific: { severity: "CRITICAL" },
  });
  assert.equal(getSeverityLabel(v4Only), "CRITICAL");
});

test("getSeverityLabel maps the GHSA MODERATE label to MEDIUM", () => {
  assert.equal(getSeverityLabel(vuln({ database_specific: { severity: "MODERATE" } })), "MEDIUM");
});

test("getSeverityLabel prefers a CVSS v3 vector over the GHSA label", () => {
  const v3 = vuln({
    severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N" }],
    database_specific: { severity: "CRITICAL" },
  });
  assert.equal(getSeverityLabel(v3), "MEDIUM");
});

test("getSeverityLabel returns UNKNOWN without a v3 vector or GHSA label", () => {
  assert.equal(getSeverityLabel(vuln({ severity: [{ type: "CVSS_V4", score: "CVSS:4.0/AV:N" }] })), "UNKNOWN");
});
