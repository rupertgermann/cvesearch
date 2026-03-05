import assert from "node:assert/strict";
import test from "node:test";
import { extractCVSSScore, extractDescription, getSeverityFromScore } from "../src/lib/utils";
import { CVEDetail } from "../src/lib/types";

test("getSeverityFromScore maps score bands correctly", () => {
  assert.equal(getSeverityFromScore(9.8), "CRITICAL");
  assert.equal(getSeverityFromScore(7.4), "HIGH");
  assert.equal(getSeverityFromScore(5.1), "MEDIUM");
  assert.equal(getSeverityFromScore(2.3), "LOW");
  assert.equal(getSeverityFromScore(0), "NONE");
  assert.equal(getSeverityFromScore(undefined), "UNKNOWN");
});

test("extractDescription prefers English CNA descriptions", () => {
  const cve: CVEDetail = {
    id: "CVE-2025-0001",
    containers: {
      cna: {
        descriptions: [
          { lang: "fr", value: "Description francaise" },
          { lang: "en", value: "English description" },
        ],
      },
    },
  };

  assert.equal(extractDescription(cve), "English description");
});

test("extractCVSSScore prefers CVSS v3.1 metrics when available", () => {
  const cve: CVEDetail = {
    id: "CVE-2025-0002",
    containers: {
      cna: {
        metrics: [
          {
            cvssV3_1: {
              baseScore: 9.8,
              baseSeverity: "CRITICAL",
            },
          },
        ],
      },
    },
  };

  assert.deepEqual(extractCVSSScore(cve), {
    score: 9.8,
    version: "3.1",
    severity: "CRITICAL",
  });
});
