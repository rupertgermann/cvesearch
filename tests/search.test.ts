import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSearchParams,
  getSearchSummary,
  getSearchValidationError,
  isCveIdQuery,
  normalizeSearchState,
  parseSearchState,
} from "../src/lib/search";

test("parseSearchState trims values and applies defaults", () => {
  const state = parseSearchState({
    query: "  CVE-2025-1234  ",
    vendor: "  microsoft ",
    page: "3",
  });

  assert.deepEqual(state, {
    query: "CVE-2025-1234",
    vendor: "microsoft",
    product: "",
    cwe: "",
    since: "",
    page: 3,
    perPage: 20,
  });
});

test("buildSearchParams omits empty values and default page", () => {
  const params = buildSearchParams(
    normalizeSearchState({
      query: "openssl",
      cwe: "CWE-79",
      page: 1,
    })
  );

  assert.equal(params.toString(), "query=openssl&cwe=CWE-79");
});

test("isCveIdQuery matches CVE identifiers case-insensitively", () => {
  assert.equal(isCveIdQuery("CVE-2024-1234"), true);
  assert.equal(isCveIdQuery("cve-2024-1234"), true);
  assert.equal(isCveIdQuery("openssl"), false);
});

test("vendor-only filtering returns a validation error instead of being silently ignored", () => {
  const error = getSearchValidationError(
    normalizeSearchState({
      vendor: "microsoft",
    })
  );

  assert.equal(
    error,
    "Vendor filtering currently requires a product. Add a product or clear the vendor filter."
  );
});

test("getSearchSummary reflects query and filter states", () => {
  assert.equal(getSearchSummary(normalizeSearchState({})), "Latest vulnerabilities");
  assert.equal(getSearchSummary(normalizeSearchState({ cwe: "CWE-79" })), "Filtered vulnerabilities");
  assert.equal(getSearchSummary(normalizeSearchState({ query: "openssl" })), 'Results for "openssl"');
});
