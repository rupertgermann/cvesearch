import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultTriageRecord, getTriageStatusLabel, parseTags, summarizeTriageChanges } from "../src/lib/triage";

test("parseTags normalizes comma-separated tag input", () => {
  assert.deepEqual(parseTags(" internet-facing, patch-window, internet-facing "), [
    "internet-facing",
    "patch-window",
  ]);
});

test("getTriageStatusLabel returns user-facing labels", () => {
  assert.equal(getTriageStatusLabel("new"), "New");
  assert.equal(getTriageStatusLabel("investigating"), "Investigating");
  assert.equal(getTriageStatusLabel("accepted"), "Accepted Risk");
});

test("createDefaultTriageRecord starts with empty activity history", () => {
  const record = createDefaultTriageRecord("CVE-2026-0001");
  assert.deepEqual(record.activity, []);
});

test("summarizeTriageChanges describes meaningful field updates", () => {
  const previous = createDefaultTriageRecord("CVE-2026-0001");
  const next = {
    ...previous,
    status: "investigating" as const,
    owner: "secops",
    notes: "Internet-facing service",
    tags: ["internet-facing", "patch-window"],
    updatedAt: "2026-03-06T12:00:00.000Z",
  };

  assert.deepEqual(summarizeTriageChanges(previous, next), [
    "Status changed to Investigating",
    "Owner set to secops",
    "Notes updated",
    "Tags updated: internet-facing, patch-window",
  ]);
});
