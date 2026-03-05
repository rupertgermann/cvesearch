import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCVEDetail,
  parseCVESummaryList,
  parseCWEData,
  parseEPSSResponse,
  parseStringList,
} from "../src/lib/validation";

test("parseCVESummaryList accepts a basic CVE list", () => {
  const data = parseCVESummaryList([
    { id: "CVE-2026-0001", summary: "Example" },
    { id: "CVE-2026-0002" },
  ]);

  assert.equal(data.length, 2);
  assert.equal(data[0].id, "CVE-2026-0001");
});

test("parseCVEDetail rejects missing ids", () => {
  assert.throws(() => parseCVEDetail({ summary: "Missing id" }), /missing an id/);
});

test("parseStringList rejects mixed arrays", () => {
  assert.throws(() => parseStringList(["ok", 2], "vendors"), /string list/);
});

test("parseEPSSResponse parses numeric strings", () => {
  const data = parseEPSSResponse({
    data: [{ cve: "CVE-2026-0001", epss: "0.42", percentile: "0.88", date: "2026-03-05" }],
  });

  assert.deepEqual(data, {
    cve: "CVE-2026-0001",
    epss: 0.42,
    percentile: 0.88,
    date: "2026-03-05",
  });
});

test("parseCWEData requires an id", () => {
  assert.throws(() => parseCWEData({ description: "No id" }), /missing an id/);
});
