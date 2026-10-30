import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config";

test("every route gets the security headers, with CSP in report-only mode", async () => {
  const rules = await nextConfig.headers!();
  const catchAll = rules.find((rule) => rule.source === "/(.*)");
  const headers = Object.fromEntries((catchAll?.headers ?? []).map(({ key, value }) => [key, value]));

  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.ok(headers["Referrer-Policy"]);
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.ok(headers["Permissions-Policy"]);
  assert.match(headers["Content-Security-Policy-Report-Only"] ?? "", /frame-ancestors 'none'/);
  assert.equal(headers["Content-Security-Policy"], undefined);
});
