import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchState } from "../src/lib/search";

test("normalizeSearchState keeps alert rules deterministic", () => {
  const state = normalizeSearchState({
    query: "  openssl ",
    minSeverity: "HIGH",
    sort: "cvss_desc",
  });

  assert.deepEqual(state, {
    query: "openssl",
    vendor: "",
    product: "",
    cwe: "",
    since: "",
    minSeverity: "HIGH",
    sort: "cvss_desc",
    page: 1,
    perPage: 20,
  });
});
