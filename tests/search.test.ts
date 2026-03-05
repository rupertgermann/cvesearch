import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPresetHref,
  buildSearchParams,
  getSearchSummary,
  getSearchValidationError,
  isCveIdQuery,
  matchesSearchState,
  normalizeSearchState,
  parseSearchState,
  wasPublishedWithinDays,
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
    minSeverity: "ANY",
    sort: "published_desc",
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

test("buildSearchParams includes non-default prioritization controls", () => {
  const params = buildSearchParams(
    normalizeSearchState({
      minSeverity: "HIGH",
      sort: "cvss_desc",
    })
  );

  assert.equal(params.toString(), "minSeverity=HIGH&sort=cvss_desc");
});

test("buildPresetHref returns a shareable preset URL", () => {
  const href = buildPresetHref(
    normalizeSearchState({
      since: "2026-03-01",
      minSeverity: "CRITICAL",
    })
  );

  assert.equal(href, "/?since=2026-03-01&minSeverity=CRITICAL");
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

test("wasPublishedWithinDays matches recent publication windows", () => {
  assert.equal(
    wasPublishedWithinDays(
      {
        id: "CVE-2026-0001",
        published: "2026-03-03T00:00:00.000Z",
      },
      7,
      new Date("2026-03-05T00:00:00.000Z").getTime()
    ),
    true
  );

  assert.equal(
    wasPublishedWithinDays(
      {
        id: "CVE-2026-0002",
        published: "2026-02-01T00:00:00.000Z",
      },
      7,
      new Date("2026-03-05T00:00:00.000Z").getTime()
    ),
    false
  );
});

test("matchesSearchState applies text, product, CWE, severity, and date filters locally", () => {
  const state = normalizeSearchState({
    query: "openssl",
    product: "openssl",
    cwe: "CWE-79",
    since: "2026-03-01",
    minSeverity: "HIGH",
  });

  assert.equal(
    matchesSearchState(
      {
        id: "CVE-2026-1111",
        summary: "OpenSSL issue",
        cwe: "CWE-79",
        cvss3: 8.4,
        published: "2026-03-04T00:00:00.000Z",
        vulnerable_product: ["openssl:openssl"],
      },
      state
    ),
    true
  );

  assert.equal(
    matchesSearchState(
      {
        id: "CVE-2026-2222",
        summary: "Old OpenSSL issue",
        cwe: "CWE-79",
        cvss3: 8.4,
        published: "2026-02-01T00:00:00.000Z",
        vulnerable_product: ["openssl:openssl"],
      },
      state
    ),
    false
  );
});
