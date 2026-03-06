import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHeuristicCveInsight,
  buildHeuristicDigest,
  interpretSearchPromptHeuristically,
} from "../src/lib/ai";

test("interpretSearchPromptHeuristically extracts severity and recent window", () => {
  const result = interpretSearchPromptHeuristically("show me critical OpenSSL vulns from this month");

  assert.equal(result.minSeverity, "CRITICAL");
  assert.equal(result.sort, "cvss_desc");
  assert.match(result.query, /openssl/i);
  assert.notEqual(result.since, "");
  assert.equal(result.appliedFilters.some((filter) => filter.field === "query"), true);
  assert.equal(result.toolCalls.length > 0, true);
  assert.equal(result.needsClarification, false);
});

test("interpretSearchPromptHeuristically requests clarification for underspecified prompts", () => {
  const result = interpretSearchPromptHeuristically("recent");

  assert.equal(result.needsClarification, true);
  assert.match(result.clarificationQuestion, /product|vendor|severity|time window/i);
});

test("buildHeuristicCveInsight produces triage and remediation guidance", () => {
  const result = buildHeuristicCveInsight({
    id: "CVE-2026-1111",
    cvss3: 9.8,
    summary: "Critical issue in OpenSSL",
    aliases: ["GHSA-xxxx-yyyy-zzzz"],
    containers: {
      cna: {
        affected: [{ product: "openssl", vendor: "openssl" }],
      },
    },
  });

  assert.equal(result.triage.priority, "critical");
  assert.equal(result.cluster.canonicalId, "CVE-2026-1111");
  assert.equal(result.remediation.length > 0, true);
});

test("buildHeuristicDigest summarizes watchlist, alerts, and projects", () => {
  const result = buildHeuristicDigest({
    watchlist: [{ id: "CVE-2026-1111" }],
    alerts: [{ name: "Critical OpenSSL", unread: 2, topMatches: ["CVE-2026-1111"] }],
    projects: [{ name: "Incident Alpha", updatedAt: "2026-03-05", items: [{ cveId: "CVE-2026-1111", addedAt: "2026-03-05" }] }],
  });

  assert.match(result.headline, /Critical OpenSSL|Tracking/);
  assert.equal(result.sections.length, 3);
});
